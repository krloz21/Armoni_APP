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

function Prueba($ruta, $url, $extra, $patron) {
    Write-Host ''
    Write-Host ('>> ' + $ruta + '  ->  ' + $url) -ForegroundColor Cyan
    $cuerpo = '{"url":"' + $url + '","gotoOptions":{"waitUntil":"networkidle2","timeout":40000},"waitForTimeout":9000,"bestAttempt":true' + $extra + '}'
    $codigo = $cuerpo | docker run --rm -i --network $Red $ImagenCurl -s -o - -w '\n__CODIGO__%{http_code}' --max-time 90 -X POST -H 'Content-Type: application/json' --data-binary '@-' ('http://browserless:3000' + $ruta) 2>&1 | Out-String
    $m = [regex]::Match($codigo, '__CODIGO__(\d+)\s*$')
    $http = if ($m.Success) { $m.Groups[1].Value } else { '???' }
    $html = [regex]::Replace($codigo, '__CODIGO__\d+\s*$', '')
    $titulo = [regex]::Match($html, '<title[^>]*>([^<]*)</title>', 'IgnoreCase').Groups[1].Value.Trim()
    $films = [regex]::Matches($html, $patron, 'IgnoreCase').Count
    $bloqueo = [regex]::IsMatch($titulo, 'just a moment|access denied|attention required|captcha|forbidden|denied', 'IgnoreCase')
    Write-Host ('   HTTP: ' + $http + ' | tamano: ' + $html.Length + ' | titulo: ' + $titulo + ' | enlaces a peliculas: ' + $films)
    if ($films -ge 3 -and -not $bloqueo) { Write-Host '   RESULTADO: OK' -ForegroundColor Green }
    else { Write-Host '   RESULTADO: NO' -ForegroundColor Red }
}

$cc = 'https://www.cinecolombia.com/cali/cartelera'
Write-Host '=== CINE COLOMBIA (3 formas) ===' -ForegroundColor Yellow
Prueba '/content' $cc '' '/films/[a-z0-9\-]+/'
Prueba '/content?stealth=true' $cc '' '/films/[a-z0-9\-]+/'
Prueba '/content?stealth=true&headless=false' $cc '' '/films/[a-z0-9\-]+/'
Write-Host ''
Write-Host '=== CINEPOLIS ===' -ForegroundColor Yellow
Prueba '/content' 'https://cinepolis.com.co/cartelera/cali-colombia' '' '/pelicula/[a-z0-9\-]+'
Write-Host ''
Write-Host '=== CINEMARK ===' -ForegroundColor Yellow
Prueba '/content' 'https://www.cinemark.com.co/cartelera/cali' '' '/cartelera/cali/[a-z0-9\-]+'
Write-Host ''
Write-Host 'Copia todo lo que salio arriba y mandamelo.'
