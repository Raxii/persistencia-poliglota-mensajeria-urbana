$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ErrorActionPreference = 'Stop'
$files = @(
  'PROYECTO_FRONTEND\docker-compose.yml',
  'PROYECTO_API\docker-compose.yml',
  'PROYECTO_REDIS\docker-compose.yml',
  'PROYECTO_MONGO\docker-compose.yml',
  'PROYECTO_POSTGRES\docker-compose.yml'
)
foreach ($relative in $files) {
  $file = Join-Path $root $relative
  if (Test-Path $file) {
    Write-Host "Deteniendo $relative (sin borrar volúmenes)..." -ForegroundColor Cyan
    & docker compose -f $file down
    if ($LASTEXITCODE -ne 0) { throw "No se pudo detener $relative" }
  }
}
Write-Host "Servicios detenidos. Los volúmenes y datos se conservaron." -ForegroundColor Green
