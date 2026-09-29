# Registra la tarea programada que arranca el supervisor al iniciar sesion.
#
# No necesita permisos de administrador: es una tarea del usuario actual. El
# precio de eso es que el backend arranca cuando entras a Windows, no antes. Si
# la PC se reinicia sola de madrugada y queda en la pantalla de login, la API
# queda caida hasta que alguien entre. Para que arranque sin login hace falta un
# servicio de Windows, y eso si pide admin.
#
# Uso:
#   .\instalar-tarea.ps1            crea (o reemplaza) la tarea y la arranca
#   .\instalar-tarea.ps1 -Quitar    la borra y baja los procesos

param([switch]$Quitar)

$ErrorActionPreference = 'Stop'

$NOMBRE_TAREA = 'PoliticaMonitor Backend'
$script = Join-Path $PSScriptRoot 'mantener-backend.ps1'

if ($Quitar) {
    Unregister-ScheduledTask -TaskName $NOMBRE_TAREA -Confirm:$false -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match 'api-server\.js' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Get-Process ngrok, cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host 'Tarea eliminada y procesos detenidos.' -ForegroundColor Yellow
    return
}

if (-not (Test-Path $script)) { throw "No encuentro $script" }
# tunel.json es opcional: sin el, el supervisor usa el tunel rapido de
# Cloudflare, que no necesita cuenta.

# -WindowStyle Hidden para que no quede una ventana azul abierta, y
# -ExecutionPolicy Bypass porque la politica por defecto de Windows no deja
# correr scripts .ps1 sin firmar.
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $PSScriptRoot

$disparadores = @(
    New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
)

$config = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -DontStopOnIdleEnd `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable
# Sin esto la tarea se mata sola a los 3 dias: el default de Windows es un
# limite de 72 horas de ejecucion.
$config.ExecutionTimeLimit = 'PT0S'

Register-ScheduledTask -TaskName $NOMBRE_TAREA -Action $accion -Trigger $disparadores `
    -Settings $config -Description 'Mantiene vivos el backend de PoliticaMonitor y el tunel de ngrok.' `
    -Force | Out-Null

Write-Host "Tarea '$NOMBRE_TAREA' registrada (arranca al iniciar sesion)." -ForegroundColor Green

Start-ScheduledTask -TaskName $NOMBRE_TAREA
Write-Host 'Arrancando ahora...' -ForegroundColor Cyan

# Con tunel de Cloudflare el primer arranque incluye levantar el tunel y
# publicar el hosting, asi que puede tardar un par de minutos.
$ok = $false
foreach ($i in 1..24) {
    Start-Sleep -Seconds 5
    try {
        $h = Invoke-RestMethod 'http://localhost:4000/health' -TimeoutSec 5
        Write-Host "  backend OK (version $($h.version))" -ForegroundColor Green
        $ok = $true
        break
    } catch { }
}
if (-not $ok) {
    Write-Host '  el backend no respondio. Mira servicio\logs\supervisor.log' -ForegroundColor Yellow
}

$urlBackend = '(todavia no publicada)'
$archivoTunel = Join-Path $PSScriptRoot 'tunel.json'
$archivoUrl = Join-Path $PSScriptRoot 'ultima-url.txt'
if (Test-Path $archivoTunel) {
    $urlBackend = "https://$((Get-Content $archivoTunel -Raw | ConvertFrom-Json).dominio)"
} elseif (Test-Path $archivoUrl) {
    $urlBackend = (Get-Content $archivoUrl -Raw).Trim()
}

Write-Host "`n  Sitio  : https://muni-8ed74.web.app"
Write-Host "  Backend: $urlBackend"
Write-Host "  Logs   : $(Join-Path $PSScriptRoot 'logs')`n"
