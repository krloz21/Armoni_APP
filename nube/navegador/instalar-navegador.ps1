# instalar-navegador.ps1  (PowerShell 5.1)
# Levanta un Chrome real (browserless) en la MISMA red Docker que n8n, sin publicar puertos.
# n8n lo llama en:  http://browserless:3000
# NOTA: este archivo es solo ASCII a proposito (PowerShell 5.1 lee mal los acentos sin BOM).

$NombreN8n   = 'n8n'
$NombreNav   = 'browserless'
$Imagen      = 'ghcr.io/browserless/chromium'
$ImagenCurl  = 'curlimages/curl'
$Concurrent  = 2        # paginas/navegadores a la vez
$Queued      = 10       # cuantas esperan en fila
$TimeoutMs   = 60000    # maximo por sesion: 60 s
$Memoria     = '2g'     # tope de RAM del contenedor

function Fallo($msg) {
    Write-Host ''
    Write-Host ('ERROR: ' + $msg) -ForegroundColor Red
    Write-Host ''
    exit 1
}
function Paso($msg) { Write-Host ''; Write-Host ('>> ' + $msg) -ForegroundColor Cyan }
function Bien($msg) { Write-Host ('   OK: ' + $msg) -ForegroundColor Green }

# Nota: NO usamos $ErrorActionPreference='Stop' porque en PS 5.1 rompe con la salida de errores de docker.

# 1) Docker instalado y corriendo
Paso 'Revisando que Docker este funcionando...'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fallo 'No encuentro el comando "docker". Instala o abre Docker Desktop y vuelve a intentar.'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Fallo 'Docker no esta corriendo. Abre Docker Desktop, espera a que diga "Engine running" (abajo a la izquierda en verde) y vuelve a ejecutar este script.'
}
Bien 'Docker esta corriendo.'

# 2) Existe el contenedor n8n
Paso ('Buscando el contenedor "' + $NombreN8n + '"...')
$existe = docker ps -a --filter ('name=^' + $NombreN8n + '$') --format '{{.Names}}' 2>$null
if (-not $existe) {
    Fallo ('No encuentro un contenedor llamado "' + $NombreN8n + '". Mira en Docker Desktop > Containers como se llama el de n8n. Si tiene otro nombre, abre este script con el Bloc de notas y cambia la linea $NombreN8n al principio.')
}
$estado = docker inspect $NombreN8n --format '{{.State.Status}}' 2>$null
if ($estado -ne 'running') {
    Write-Host ('   AVISO: n8n esta en estado "' + $estado + '". Seguimos, pero acuerdate de encenderlo en Docker Desktop.') -ForegroundColor Yellow
} else {
    Bien 'n8n existe y esta encendido.'
}

# 3) Detectar la red de n8n
Paso 'Detectando la red Docker de n8n...'
$json = docker inspect $NombreN8n --format '{{json .NetworkSettings.Networks}}' 2>$null
if (-not $json) { Fallo 'No pude leer la red de n8n.' }
$redes = @()
try {
    $obj = $json | ConvertFrom-Json
    $redes = @($obj.PSObject.Properties.Name)
} catch {
    Fallo 'No pude interpretar la informacion de red de n8n.'
}
$redes = @($redes | Where-Object { $_ -and $_ -ne 'bridge' -and $_ -ne 'host' -and $_ -ne 'none' })
if ($redes.Count -eq 0) {
    Fallo 'n8n no esta en una red propia (solo en la red "bridge" por defecto). Avisame para ajustarlo.'
}
$Red = $redes[0]
if ($redes.Count -gt 1) {
    Write-Host ('   AVISO: n8n esta en varias redes (' + ($redes -join ', ') + '). Uso la primera.') -ForegroundColor Yellow
}
Bien ('Red de n8n: ' + $Red)

# 4) Borrar browserless previo
Paso 'Quitando una instalacion anterior (si existe)...'
$previo = docker ps -a --filter ('name=^' + $NombreNav + '$') --format '{{.Names}}' 2>$null
if ($previo) {
    docker rm -f $NombreNav *> $null
    Bien 'Instalacion anterior eliminada.'
} else {
    Bien 'No habia ninguna anterior.'
}

# 5) Levantar browserless (SIN -p: no se publica ningun puerto)
Paso 'Descargando y arrancando el navegador (la primera vez puede tardar unos minutos, pesa ~1 GB)...'
docker run -d `
    --name $NombreNav `
    --network $Red `
    --restart unless-stopped `
    --shm-size=1g `
    --memory=$Memoria `
    -e ('CONCURRENT=' + $Concurrent) `
    -e ('QUEUED=' + $Queued) `
    -e ('TIMEOUT=' + $TimeoutMs) `
    $Imagen
if ($LASTEXITCODE -ne 0) {
    Fallo 'No se pudo crear el contenedor. Revisa tu conexion a internet y que Docker tenga espacio en disco.'
}
Bien 'Contenedor creado.'

# 6) Esperar a que responda, desde la MISMA red (igual que lo hara n8n)
Paso 'Esperando a que el navegador responda...'
Write-Host '   (la primera vez descarga una herramienta pequena y puede tardar 1-2 minutos; no cierres la ventana)'
docker pull $ImagenCurl *> $null
$listo = $false
$codigo = ''
for ($i = 1; $i -le 30; $i++) {
    $codigo = docker run --rm --network $Red $ImagenCurl -s -o /dev/null -w '%{http_code}' --max-time 5 http://browserless:3000/docs 2>$null
    if ($codigo -eq '200') { $listo = $true; break }
    if ($codigo -eq '401' -or $codigo -eq '403') { $listo = $true; break }
    Write-Host ('   ... intento ' + $i + ' de 30 (respuesta: ' + $codigo + ')')
    Start-Sleep -Seconds 3
}
if (-not $listo) {
    Write-Host '--- Ultimas lineas del registro de browserless ---' -ForegroundColor Yellow
    docker logs --tail 25 $NombreNav
    Fallo 'El navegador no respondio en ~90 segundos. Mira el registro de arriba.'
}
if ($codigo -ne '200') {
    Write-Host ('   AVISO: el navegador respondio ' + $codigo + ' (pide token). Mira el registro con: docker logs ' + $NombreNav) -ForegroundColor Yellow
} else {
    Bien 'El navegador responde dentro de la red de n8n.'
}

# 7) Prueba real: renderizar una pagina con /content
Paso 'Prueba real: renderizando una pagina con Chrome...'
$cuerpo = '{"url":"data:text/html,<html><body><h1 id=x>Hola desde Chrome</h1><script>document.getElementById(''x'').textContent=''Hola JS OK''</script></body></html>","gotoOptions":{"waitUntil":"load","timeout":20000}}'
$resp = $cuerpo | docker run --rm -i --network $Red $ImagenCurl -s --max-time 40 -X POST -H 'Content-Type: application/json' --data-binary '@-' http://browserless:3000/content 2>&1
$resp = ($resp | Out-String)
if ($resp -match 'Hola JS OK') {
    Write-Host '   RESULTADO: OK - Chrome abrio la pagina y ejecuto JavaScript.' -ForegroundColor Green
} else {
    Write-Host '   RESULTADO: ERROR - la prueba no devolvio lo esperado.' -ForegroundColor Red
    Write-Host '   Respuesta recibida (primeros 400 caracteres):'
    $corto = $resp.Substring(0, [Math]::Min(400, $resp.Length))
    Write-Host $corto
    docker logs --tail 20 $NombreNav
    Fallo 'La prueba de renderizado fallo.'
}

# 7b) Prueba opcional de una pagina real de internet (solo aviso, no es fatal)
$cuerpo2 = '{"url":"https://example.com","gotoOptions":{"waitUntil":"networkidle2","timeout":25000},"bestAttempt":true}'
$resp2 = ($cuerpo2 | docker run --rm -i --network $Red $ImagenCurl -s --max-time 45 -X POST -H 'Content-Type: application/json' --data-binary '@-' http://browserless:3000/content 2>&1 | Out-String)
if ($resp2 -match 'Example Domain') {
    Write-Host '   Internet desde el navegador: OK (abrio example.com).' -ForegroundColor Green
} else {
    Write-Host '   AVISO: no pude abrir example.com desde el navegador (puede ser tu internet o un proxy). La prueba local si funciono.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=============================================' -ForegroundColor Green
Write-Host ' LISTO. Dentro de n8n usa esta direccion:'
Write-Host '     http://browserless:3000' -ForegroundColor Green
Write-Host ' (Ejemplo: POST http://browserless:3000/content )'
Write-Host '=============================================' -ForegroundColor Green
Write-Host ''
