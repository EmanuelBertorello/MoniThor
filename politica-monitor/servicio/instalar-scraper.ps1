# Registra la tarea programada que mantiene vivo el worker de scraping.
#
# Es la hermana de instalar-tarea.ps1 (esa levanta la API, esta el scraping).
# Van separadas a proposito: la API tiene que estar arriba siempre, el scraping
# es opcional y se puede apagar sin tumbar el sitio.
#
# Tampoco necesita permisos de administrador, con el mismo precio: arranca al
# iniciar sesion, no al boot.
#
# Uso:
#   .\instalar-scraper.ps1            crea (o reemplaza) la tarea y la arranca
#   .\instalar-scraper.ps1 -Quitar    la borra y baja el worker

param([switch]$Quitar)

$ErrorActionPreference = 'Stop'

$NOMBRE_TAREA = 'PoliticaMonitor Scraper'
$script = Join-Path $PSScriptRoot 'mantener-scraper.ps1'

if ($Quitar) {
    Unregister-ScheduledTask -TaskName $NOMBRE_TAREA -Confirm:$false -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match 'scraper-worker\.js' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host 'Tarea de scraping eliminada y worker detenido.' -ForegroundColor Yellow
    return
}

if (-not (Test-Path $script)) { throw "No encuentro $script" }

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
# Sin esto Windows mata la tarea a las 72 horas.
$config.ExecutionTimeLimit = 'PT0S'

Register-ScheduledTask -TaskName $NOMBRE_TAREA -Action $accion -Trigger $disparadores `
    -Settings $config -Description 'Mantiene vivo el worker horario de scraping de PoliticaMonitor.' `
    -Force | Out-Null

Write-Host "Tarea '$NOMBRE_TAREA' registrada (arranca al iniciar sesion)." -ForegroundColor Green

Start-ScheduledTask -TaskName $NOMBRE_TAREA
Write-Host 'Arrancando ahora...' -ForegroundColor Cyan

$ok = $false
foreach ($i in 1..12) {
    Start-Sleep -Seconds 5
    $vivo = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match 'scraper-worker\.js' }
    if ($vivo) {
        Write-Host "  worker OK (pid $($vivo.ProcessId))" -ForegroundColor Green
        $ok = $true
        break
    }
}
if (-not $ok) {
    Write-Host '  el worker no arranco. Mira servicio\logs\scraper-supervisor.log' -ForegroundColor Yellow
}

Write-Host "`n  Cron   : cada hora en punto (SCRAPE_CRON en backend\.env)"
Write-Host "  Gasto  : solo corre para campanas de usuarios online; tope mensual APIFY_MONTHLY_BUDGET_USD"
Write-Host "  Logs   : $(Join-Path $PSScriptRoot 'logs\scraper.out.log')`n"
