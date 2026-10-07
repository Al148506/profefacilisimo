<#
.SYNOPSIS
    Levanta el entorno de desarrollo completo de Profe Facilisimo.
.DESCRIPTION
    1. Verifica dependencias (Docker, dotnet, npm).
    2. Inicia PostgreSQL con Docker Compose (espera a que este sano).
    3. Lanza la API .NET en segundo plano en http://localhost:5080.
    4. Lanza el frontend Vite en segundo plano en http://localhost:5173.
    5. Abre el navegador en http://localhost:5173.
    6. Al pulsar Ctrl+C, detiene todos los procesos limpiamente.
.PARAMETER NoBrowser
    Omite la apertura automatica del navegador.
.EXAMPLE
    .\dev.ps1
.EXAMPLE
    .\dev.ps1 -NoBrowser
#>
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# -- helpers ------------------------------------------------------------------
function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "`n[ERROR] $msg" -ForegroundColor Red; exit 1 }

# -- verificar dependencias ---------------------------------------------------
Write-Step 'Verificando dependencias...'
foreach ($cmd in @('docker', 'dotnet', 'npm')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Fail "'$cmd' no esta disponible en el PATH. Instalalo e intentalo de nuevo."
    }
    Write-Ok $cmd
}

if (-not (Test-Path '.tools/local-settings.json')) {
    Write-Fail "Falta .tools/local-settings.json. Ejecuta primero:  .\scripts\Setup.ps1"
}
Write-Ok 'Configuracion local encontrada'

# -- cargar variables de entorno para la API ----------------------------------
. "$PSScriptRoot/scripts/Common.ps1"
$null = Read-LocalSettings

# -- base de datos ------------------------------------------------------------
Write-Step 'Iniciando base de datos (Docker / PostgreSQL)...'
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { Write-Fail 'docker compose up fallo. Comprueba que Docker Desktop este corriendo.' }
Write-Ok 'PostgreSQL listo en el puerto 5432'

# -- API .NET -----------------------------------------------------------------
Write-Step 'Iniciando API .NET (dotnet watch) en http://localhost:5080 ...'
New-Item -ItemType Directory -Force '.tools' | Out-Null
$apiLog    = "$PSScriptRoot\.tools\dev-api.log"
$apiErrLog = "$PSScriptRoot\.tools\dev-api-error.log"

$apiProc = Start-Process dotnet `
    -ArgumentList @('watch', '--project', 'backend/Api', '--no-launch-profile', '--urls', 'http://localhost:5080') `
    -WorkingDirectory $PSScriptRoot `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $apiLog `
    -RedirectStandardError  $apiErrLog
Write-Ok "API iniciada (PID $($apiProc.Id)) -- log: .tools\dev-api.log"

# -- frontend Vite ------------------------------------------------------------
Write-Step 'Iniciando frontend Vite en http://localhost:5173 ...'
$feLog    = "$PSScriptRoot\.tools\dev-frontend.log"
$feErrLog = "$PSScriptRoot\.tools\dev-frontend-error.log"

# npm es un .cmd; Start-Process con -Redirect* requiere un .exe real.
# Usamos cmd.exe /c como wrapper, que si es un ejecutable Win32.
$feProc = Start-Process 'cmd.exe' `
    -ArgumentList @('/c', 'npm', '--prefix', 'frontend', 'run', 'dev') `
    -WorkingDirectory $PSScriptRoot `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $feLog `
    -RedirectStandardError  $feErrLog
Write-Ok "Frontend iniciado (PID $($feProc.Id)) -- log: .tools\dev-frontend.log"

# -- abrir navegador ----------------------------------------------------------
if (-not $NoBrowser) {
    Write-Step 'Abriendo navegador en http://localhost:5173 ...'
    Start-Sleep -Seconds 4
    Start-Process 'http://localhost:5173'
    Write-Ok 'Navegador abierto'
}

# -- estado -------------------------------------------------------------------
Write-Host ''
Write-Host '-------------------------------------------------------------' -ForegroundColor DarkGray
Write-Host '  Base de datos : postgresql://localhost:5432' -ForegroundColor DarkGray
Write-Host '  API           : http://localhost:5080' -ForegroundColor White
Write-Host '  Frontend      : http://localhost:5173' -ForegroundColor White
Write-Host ''
Write-Host '  Pulsa Ctrl+C para detener la API y el frontend.' -ForegroundColor Yellow
Write-Host '  (Docker/PostgreSQL seguira corriendo; usa "docker compose' -ForegroundColor DarkGray
Write-Host '   stop" para detenerlo tambien.)' -ForegroundColor DarkGray
Write-Host '-------------------------------------------------------------' -ForegroundColor DarkGray
Write-Host ''

# -- bucle de monitoreo -------------------------------------------------------
try {
    while ($true) {
        if ($apiProc.HasExited) {
            Write-Host '[API] El proceso termino inesperadamente.' -ForegroundColor Red
            Write-Host '      Revisa: .tools\dev-api-error.log' -ForegroundColor Red
            break
        }
        if ($feProc.HasExited) {
            Write-Host '[Frontend] El proceso termino inesperadamente.' -ForegroundColor Red
            Write-Host '           Revisa: .tools\dev-frontend-error.log' -ForegroundColor Red
            break
        }
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "`nDeteniendo servicios..." -ForegroundColor Yellow
    foreach ($proc in @($feProc, $apiProc)) {
        if ($null -ne $proc -and -not $proc.HasExited) {
            $proc.Kill($true)
            $proc.WaitForExit(5000) | Out-Null
        }
    }
    Write-Host 'API y frontend detenidos.' -ForegroundColor Green
    Write-Host 'PostgreSQL sigue en Docker. Para detenerlo: docker compose stop' -ForegroundColor DarkGray
}
