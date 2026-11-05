$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-Compose {
    param(
        [Parameter(Mandatory=$true)][string]$RelativeFile,
        [Parameter(Mandatory=$true)][string[]]$ComposeArgs
    )
    $file = Join-Path $root $RelativeFile
    if (-not (Test-Path $file)) { throw "No existe el Compose: $file" }
    Write-Host "`n> docker compose -f $RelativeFile $($ComposeArgs -join ' ')" -ForegroundColor Cyan
    & docker compose -f $file @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "Falló Docker Compose en $RelativeFile (código $LASTEXITCODE)." }
}

function Wait-Healthy {
    param([string]$ContainerName, [int]$TimeoutSeconds = 120)
    Write-Host "Esperando estado healthy: $ContainerName" -ForegroundColor Yellow
    for ($i = 0; $i -lt ($TimeoutSeconds / 2); $i++) {
        $status = & docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $ContainerName 2>$null
        if ($LASTEXITCODE -eq 0 -and $status -eq 'healthy') {
            Write-Host "$ContainerName está healthy." -ForegroundColor Green
            return
        }
        if ($LASTEXITCODE -eq 0 -and ($status -eq 'exited' -or $status -eq 'dead')) {
            & docker logs --tail 60 $ContainerName
            throw "$ContainerName terminó en estado $status."
        }
        Start-Sleep -Seconds 2
    }
    & docker logs --tail 60 $ContainerName
    throw "$ContainerName no alcanzó healthy en $TimeoutSeconds segundos."
}

Write-Host "Verificando Docker Engine..." -ForegroundColor Cyan
& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop no está iniciado. Abre Docker Desktop y vuelve a ejecutar." }

$networkNames = & docker network ls --format '{{.Name}}'
if ($LASTEXITCODE -ne 0) { throw "No se pudieron consultar las redes Docker." }
if ($networkNames -notcontains 'proyecto-red') {
    Write-Host "Creando red compartida proyecto-red..." -ForegroundColor Cyan
    & docker network create proyecto-red
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la red proyecto-red." }
} else {
    Write-Host "La red proyecto-red ya existe; se reutilizará." -ForegroundColor Green
}

# Create/update API .env without changing existing credentials or JWT secret.
$apiDir = Join-Path $root 'PROYECTO_API'
$envPath = Join-Path $apiDir '.env'
$templatePath = Join-Path $apiDir '.env.example'
if (-not (Test-Path $envPath)) {
    $envText = Get-Content $templatePath -Raw
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','A').Replace('/','B')
    $envText = $envText.Replace('CAMBIAR_POR_UN_SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES', $secret)
} else {
    $envText = Get-Content $envPath -Raw
}
$corsLine = 'CORS_ORIGIN=http://localhost:5173,http://localhost:5500,http://localhost:8080'
if ($envText -match '(?m)^CORS_ORIGIN=.*$') {
    $envText = [regex]::Replace($envText, '(?m)^CORS_ORIGIN=.*$', $corsLine)
} else {
    $envText = $envText.TrimEnd() + "`r`n" + $corsLine + "`r`n"
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, $envText, $utf8NoBom)

Write-Host "`n1/5 PostgreSQL independiente..." -ForegroundColor Cyan
Invoke-Compose 'PROYECTO_POSTGRES\docker-compose.yml' @('up','-d','--build')
Wait-Healthy 'proyecto-postgres'
Write-Host "Aplicando esquema SQL de forma idempotente..." -ForegroundColor Cyan
Invoke-Compose 'PROYECTO_POSTGRES\docker-compose.yml' @('exec','-T','postgres','psql','-v','ON_ERROR_STOP=1','-U','mensajeria','-d','mensajeria','-f','/docker-entrypoint-initdb.d/001_schema.sql')

Write-Host "`n2/5 MongoDB independiente..." -ForegroundColor Cyan
Invoke-Compose 'PROYECTO_MONGO\docker-compose.yml' @('up','-d','--build')
Wait-Healthy 'proyecto-mongo'

Write-Host "`n3/5 Redis independiente..." -ForegroundColor Cyan
Invoke-Compose 'PROYECTO_REDIS\docker-compose.yml' @('up','-d','--build')
Wait-Healthy 'proyecto-redis'

Write-Host "`n4/5 API independiente..." -ForegroundColor Cyan
Invoke-Compose 'PROYECTO_API\docker-compose.yml' @('up','-d','--build')
Wait-Healthy 'proyecto-api' 120
Write-Host "Cargando/actualizando usuarios de demostración..." -ForegroundColor Cyan
Invoke-Compose 'PROYECTO_API\docker-compose.yml' @('exec','-T','api','npm','run','seed')

Write-Host "`n5/5 Frontend independiente..." -ForegroundColor Cyan
Invoke-Compose 'PROYECTO_FRONTEND\docker-compose.yml' @('up','-d','--build')

Write-Host "`nTodos los proyectos independientes fueron iniciados." -ForegroundColor Green
& docker ps --filter 'name=proyecto-' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
Write-Host "`nWeb: http://localhost:8080" -ForegroundColor Green
Write-Host "API: http://localhost:3000/health" -ForegroundColor Green
Write-Host "PostgreSQL: localhost:5433 | MongoDB: localhost:27018 | Redis: localhost:6380" -ForegroundColor Green
Write-Host "Usuarios demo: cliente_demo, operador_demo, repartidor_demo, admin_demo" -ForegroundColor Yellow
Write-Host "Clave demo: Demo2026!" -ForegroundColor Yellow
Write-Host "Los volúmenes se conservan; este script NO ejecuta down -v ni elimina datos." -ForegroundColor Green
