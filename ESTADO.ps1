Write-Host "Contenedores del Grupo 1:" -ForegroundColor Cyan
docker ps -a --filter "name=proyecto-" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
Write-Host "`nSalud de la API:" -ForegroundColor Cyan
try { Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5 | Format-List }
catch { Write-Host "API no disponible todavía: $($_.Exception.Message)" -ForegroundColor Yellow }
