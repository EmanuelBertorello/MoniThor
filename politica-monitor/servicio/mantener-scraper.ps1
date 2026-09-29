# Mantiene vivo el worker de scraping (backend/src/scraper-worker.js) en esta PC.
#
# Por que hace falta: el job horario esta escrito para Cloud Scheduler
# (exports.hourlyScrape), pero Cloud Functions pide plan Blaze y la facturacion
# del proyecto esta cerrada. Sin esto, nadie dispara el scraping y la campana
# deja de recibir material nuevo aunque el backend este arriba.
#
# El worker trae su propio cron horario y el filtro de "usuario online": si
# nadie entro en los ultimos 15 minutos, la corrida no scrapea nada y no gasta
# Apify. O sea, el gasto lo manda el uso real del panel, no este supervisor.
#
# No corre solo: lo dispara la tarea programada que crea instalar-scraper.ps1.
# Para probarlo a mano:  .\mantener-scraper.ps1 -Verboso

param(
    # Muestra el log por consola ademas de escribirlo al archivo.
    [switch]$Verboso
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$raizServicio = $PSScriptRoot
$raizProyecto = Split-Path $raizServicio -Parent
$dirBackend   = Join-Path $raizProyecto 'backend'
$dirLogs      = Join-Path $raizServicio 'logs'

$INTERVALO_SEG = 60
$MAX_LOG_BYTES = 5MB

New-Item -ItemType Directory -Force -Path $dirLogs | Out-Null
$logPrincipal = Join-Path $dirLogs 'scraper-supervisor.log'
$logSalida    = Join-Path $dirLogs 'scraper.out.log'
$logError     = Join-Path $dirLogs 'scraper.err.log'

function Escribir($nivel, $mensaje) {
    $linea = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $nivel, $mensaje
    Add-Content -Path $logPrincipal -Value $linea -Encoding utf8
    if ($Verboso) { Write-Host $linea }
}

function RotarSiHaceFalta($ruta) {
    if (-not (Test-Path $ruta)) { return }
    if ((Get-Item $ruta).Length -lt $MAX_LOG_BYTES) { return }
    $viejo = "$ruta.1"
    if (Test-Path $viejo) { Remove-Item $viejo -Force -ErrorAction SilentlyContinue }
    Move-Item $ruta $viejo -Force -ErrorAction SilentlyContinue
}

# ─── Una sola instancia ──────────────────────────────────────────────────────
# Esto no es cosmetico: ya paso una vez que quedaran cuatro scraper-worker.js
# corriendo a la vez (restos de pruebas mal cerradas) y eso multiplico por
# cuatro la frecuencia real de scraping, y con ella la factura de Apify.
$mutex = New-Object System.Threading.Mutex($false, 'Global\PoliticaMonitorScraper')
if (-not $mutex.WaitOne(0)) {
    Escribir 'WARN' 'Ya hay otro supervisor de scraping corriendo. Salgo.'
    exit 0
}

function MatarWorkers {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match 'scraper-worker\.js' } |
        ForEach-Object {
            Escribir 'INFO' "Matando worker huerfano pid $($_.ProcessId)"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

function ArrancarWorker {
    # Cualquier worker previo se baja primero: dos crons en paralelo scrapean
    # el doble y pagan el doble.
    MatarWorkers
    RotarSiHaceFalta $logSalida
    RotarSiHaceFalta $logError

    $env:NODE_ENV = 'production'

    $p = Start-Process -FilePath 'node' -ArgumentList 'src/scraper-worker.js' `
        -WorkingDirectory $dirBackend -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $logSalida -RedirectStandardError $logError
    Escribir 'INFO' "Worker arrancado (pid $($p.Id))"
    return $p
}

# ─── Loop ────────────────────────────────────────────────────────────────────
Escribir 'INFO' '=== Supervisor de scraping arrancando ==='

$proceso = ArrancarWorker
$fallosSeguidos = 0

try {
    while ($true) {
        Start-Sleep -Seconds $INTERVALO_SEG
        RotarSiHaceFalta $logPrincipal

        if ($proceso.HasExited) {
            # Un worker que muere al toque suele ser un error de arranque
            # (Firestore sin credenciales, .env roto). Reintentar cada minuto
            # solo llena el log, asi que se espacia hasta 10 minutos.
            $fallosSeguidos++
            Escribir 'WARN' "El worker murio (exit $($proceso.ExitCode)), reiniciando. Fallos seguidos: $fallosSeguidos"
            if ($fallosSeguidos -ge 3) {
                $espera = [Math]::Min(600, 60 * $fallosSeguidos)
                Escribir 'INFO' "Espero $espera s antes de reintentar"
                Start-Sleep -Seconds $espera
            }
            $proceso = ArrancarWorker
        } elseif ($fallosSeguidos -gt 0) {
            # Sobrevivio un ciclo entero: se da por recuperado.
            $fallosSeguidos = 0
        }
    }
} finally {
    Escribir 'INFO' 'Supervisor de scraping terminando, bajando el worker'
    MatarWorkers
    $mutex.ReleaseMutex()
}
