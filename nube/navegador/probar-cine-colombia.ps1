# probar-cine-colombia.ps1  (PowerShell 5.1) - solo ASCII a proposito.
# Le pide al navegador (browserless) que abra la cartelera de Cine Colombia y muestra que recibio.
# No cambia nada en tu computador.
$NombreN8n = 'n8n'
$ImagenCurl = 'curlimages/curl'
$json = docker inspect $NombreN8n --format '{{json .NetworkSettings.Networks}}' 2>$null
if (-not $json) { Write-Host 'No encuentro el contenedor n8n.' -ForegroundColor Red; exit 1 }
$redes = @(($json | ConvertFrom-Json).PSObject.Properties.Name | Where-Object { $_ -ne 'bridge' -and $_ -ne 'host' -and $_ -ne 'none' })
$Red = $redes[0]
Write-Host ('Red: ' + $Red)

function Prueba($ruta, $url) {
    Write-Host ''
    Write-Host ('>> ' + $ruta + '  ->  ' + $url) -ForegroundColor Cyan
    $cuerpo = '{"url":"' + $url + '","gotoOptions":{"waitUntil":"networkidle2","timeout":30000},"bestAttempt":true}'
    $tmp = Join-Path $env:TEMP 'cc_prueba.html'
    $codigo = $cuerpo | docker run --rm -i --network $Red $ImagenCurl -s -o - -w '\n__CODIGO__%{http_code}' --max-time 70 -X POST -H 'Content-Type: application/json' --data-binary '@-' ('http://browserless:3000' + $ruta) 2>&1 | Out-String
    $m = [regex]::Match($codigo, '__CODIGO__(\d+)\s*$')
    $http = if ($m.Success) { $m.Groups[1].Value } else { '???' }
    $html = [regex]::Replace($codigo, '__CODIGO__\d+\s*$', '')
    Set-Content -Path $tmp -Value $html -Encoding UTF8
    $titulo = [regex]::Match($html, '<title[^>]*>([^<]*)</title>', 'IgnoreCase').Groups[1].Value.Trim()
    $films = [regex]::Matches($html, '/films/[a-z0-9\-]+/', 'IgnoreCase').Count
    $bloqueo = [regex]::IsMatch($html, 'just a moment|access denied|attention required|captcha|incapsula|unusual traffic|forbidden', 'IgnoreCase')
    Write-Host ('   Respuesta HTTP del navegador: ' + $http)
    Write-Host ('   Tamano de la pagina: ' + $html.Length + ' caracteres')
    Write-Host ('   Titulo de la pagina: ' + $titulo)
    Write-Host ('   Enlaces a peliculas (/films/): ' + $films)
    if ($bloqueo) { Write-Host '   AVISO: la pagina parece un bloqueo anti-robots.' -ForegroundColor Yellow }
    if ($films -ge 3 -and -not $bloqueo) { Write-Host '   RESULTADO: OK, Chrome si pudo leer Cine Colombia.' -ForegroundColor Green }
    else { Write-Host '   RESULTADO: NO se pudo leer bien.' -ForegroundColor Red }
}

Prueba '/content' 'https://www.cinecolombia.com/cali/cartelera'
Prueba '/content' 'https://www.cinecolombia.com/'
Prueba '/chromium/stealth/content' 'https://www.cinecolombia.com/cali/cartelera'
Write-Host ''
Write-Host 'Copia todo lo que salio arriba y mandamelo.'
