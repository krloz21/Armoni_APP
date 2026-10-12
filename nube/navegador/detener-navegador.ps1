# detener-navegador.ps1  (PowerShell 5.1) - quita el navegador browserless. ASCII a proposito.
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: No encuentro docker. Abre Docker Desktop.' -ForegroundColor Red
    exit 1
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: Docker no esta corriendo. Abre Docker Desktop y reintenta.' -ForegroundColor Red
    exit 1
}
$previo = docker ps -a --filter 'name=^browserless$' --format '{{.Names}}' 2>$null
if ($previo) {
    docker rm -f browserless *> $null
    Write-Host 'OK: el navegador (browserless) fue eliminado. n8n no se toco.' -ForegroundColor Green
} else {
    Write-Host 'No habia ningun navegador (browserless) instalado.' -ForegroundColor Yellow
}
Write-Host 'Opcional para liberar disco (~1 GB):  docker rmi ghcr.io/browserless/chromium'
