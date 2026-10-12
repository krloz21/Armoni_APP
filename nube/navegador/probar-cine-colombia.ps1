# probar-cine-colombia.ps1  (PowerShell 5.1) - solo ASCII a proposito.
# Abre varias direcciones de Cine Colombia con el navegador (modo sigiloso) y muestra un resumen corto de cada una.
$NombreN8n = 'n8n'
$ImagenCurl = 'curlimages/curl'
$json = docker inspect $NombreN8n --format '{{json .NetworkSettings.Networks}}' 2>$null
if (-not $json) { Write-Host 'No encuentro el contenedor n8n.' -ForegroundColor Red; exit 1 }
$redes = @(($json | ConvertFrom-Json).PSObject.Properties.Name | Where-Object { $_ -ne 'bridge' -and $_ -ne 'host' -and $_ -ne 'none' })
$Red = $redes[0]

function Resumen($url) {
    Write-Host ''
    Write-Host ('>> ' + $url) -ForegroundColor Cyan
    $cuerpo = '{"url":"' + $url + '","gotoOptions":{"waitUntil":"networkidle2","timeout":40000},"waitForTimeout":6000,"bestAttempt":true}'
    $html = $cuerpo | docker run --rm -i --network $Red $ImagenCurl -s --max-time 90 -X POST -H 'Content-Type: application/json' --data-binary '@-' 'http://browserless:3000/content?stealth=true' 2>&1 | Out-String
    $titulo = [regex]::Match($html, '<title[^>]*>([^<]*)</title>', 'IgnoreCase').Groups[1].Value.Trim()
    $sinScripts = [regex]::Replace($html, '<(script|style|svg|noscript)[\s\S]*?</\1>', ' ', 'IgnoreCase')
    $texto = [regex]::Replace([regex]::Replace($sinScripts, '<[^>]+>', ' '), '\s+', ' ').Trim()
    Write-Host ('   tamano: ' + $html.Length + ' | titulo: ' + $titulo)
    $corto = $texto.Substring(0, [Math]::Min(260, $texto.Length))
    Write-Host ('   texto: ' + $corto)
    $links = [regex]::Matches($html, 'href="([^"]*/films/[^"]+)"', 'IgnoreCase') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    Write-Host ('   enlaces a peliculas distintos: ' + @($links).Count)
    @($links) | Select-Object -First 14 | ForEach-Object { Write-Host ('     ' + $_) }
}

Resumen 'https://www.cinecolombia.com/'
Resumen 'https://www.cinecolombia.com/cali'
Resumen 'https://www.cinecolombia.com/cartelera'
Resumen 'https://www.cinecolombia.com/films/pacifico/HO00000786/'
Write-Host ''
Write-Host 'Copia todo lo que salio arriba y mandamelo.'
