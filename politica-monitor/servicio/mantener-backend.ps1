# Mantiene el backend de PoliticaMonitor vivo 24/7 en esta PC.
#
# Que hace, en un loop que no termina nunca:
#   - Levanta el backend (node src/api-server.js) en el puerto 4000.
#   - Levanta el tunel que expone ese puerto a internet.
#   - Cada 30 segundos chequea los dos. Si alguno murio o dejo de responder,
#     lo vuelve a levantar.
#   - Le pide a Windows que no suspenda la maquina mientras esto corre.
#
# El tunel tiene dos modos, elegidos segun exista o no servicio\tunel.json:
# ngrok con dominio fijo (necesita cuenta, la URL no cambia nunca) o el tunel
# rapido de Cloudflare (sin cuenta, funciona al instante, pero da una URL nueva
# en cada arranque y por eso hay que republicar el hosting cuando cambia). Ver
# la seccion "Que tunel usar" mas abajo.
#
# No corre solo: lo dispara la tarea programada que crea instalar-tarea.ps1.
# Para probarlo a mano:  .\mantener-backend.ps1 -Verboso

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

$PUERTO          = 4000
$INTERVALO_SEG   = 30
$MAX_LOG_BYTES   = 5MB
$TIMEOUT_HEALTH  = 8

# Origenes que la API acepta por CORS: los dos dominios que Firebase Hosting le
# da al mismo sitio, mas el front local por si estas desarrollando.
$ORIGENES = 'https://muni-8ed74.web.app,https://muni-8ed74.firebaseapp.com,http://localhost:4300'

New-Item -ItemType Directory -Force -Path $dirLogs | Out-Null
$logPrincipal = Join-Path $dirLogs 'supervisor.log'
$logBackend   = Join-Path $dirLogs 'backend.out.log'
$logBackendEr = Join-Path $dirLogs 'backend.err.log'
$logTunel     = Join-Path $dirLogs 'tunel.log'

function Escribir($nivel, $mensaje) {
    $linea = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $nivel, $mensaje
    Add-Content -Path $logPrincipal -Value $linea -Encoding utf8
    if ($Verboso) { Write-Host $linea }
}

# Set-Content -Encoding utf8 en PowerShell 5.1 siempre antepone un BOM. Para un
# log da igual, pero config.json lo lee el navegador con JSON.parse, asi que se
# escribe con UTF-8 pelado.
function EscribirUtf8SinBom($ruta, $contenido) {
    [System.IO.File]::WriteAllText($ruta, $contenido, (New-Object System.Text.UTF8Encoding($false)))
}

# Los logs de un proceso que corre meses sin parar crecen sin limite: al pasar
# el tope se rota a .1 y se empieza de nuevo.
function RotarSiHaceFalta($ruta) {
    if (-not (Test-Path $ruta)) { return }
    if ((Get-Item $ruta).Length -lt $MAX_LOG_BYTES) { return }
    $viejo = "$ruta.1"
    if (Test-Path $viejo) { Remove-Item $viejo -Force -ErrorAction SilentlyContinue }
    Move-Item $ruta $viejo -Force -ErrorAction SilentlyContinue
}

# ─── Una sola instancia ──────────────────────────────────────────────────────
# Sin esto, cerrar sesion y volver a entrar dispara la tarea otra vez y quedan
# dos supervisores peleando por el puerto 4000.
$mutex = New-Object System.Threading.Mutex($false, 'Global\PoliticaMonitorSupervisor')
if (-not $mutex.WaitOne(0)) {
    Escribir 'WARN' 'Ya hay otro supervisor corriendo. Salgo.'
    exit 0
}

# ─── No dejar que la PC se duerma ────────────────────────────────────────────
# ES_SYSTEM_REQUIRED mantiene el sistema despierto; ES_CONTINUOUS hace que valga
# hasta que el proceso muera. No toca la pantalla: el monitor se apaga igual.
Add-Type -Namespace Energia -Name Win32 -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
$ES_CONTINUOUS = [uint32]'0x80000000'
$ES_SYSTEM_REQUIRED = [uint32]'0x00000001'
[Energia.Win32]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null

# ─── Que tunel usar ──────────────────────────────────────────────────────────
# Dos modos, segun haya o no un dominio configurado en tunel.json:
#
#   ngrok       dominio fijo. La URL nunca cambia, asi que el hosting se
#               publica una sola vez (lo hace configurar-ngrok.ps1) y este
#               script no lo toca mas. Es el modo bueno, pero necesita cuenta
#               de ngrok.
#
#   cloudflare  tunel rapido, sin cuenta. Funciona al instante pero da una URL
#               distinta en cada arranque, asi que cuando cambia hay que
#               reescribir config.json y redeployar el hosting. Ese redeploy lo
#               hace este script solo, mas abajo.
#
# Arranca en cloudflare para que el sitio funcione sin tramites, y pasa solo a
# ngrok en cuanto exista tunel.json.
$archivoTunel = Join-Path $raizServicio 'tunel.json'
$dominio = $null
if (Test-Path $archivoTunel) {
    $tunel = Get-Content $archivoTunel -Raw | ConvertFrom-Json
    # Con StrictMode, leer una propiedad que no existe tira error en vez de dar
    # $null, asi que se pregunta antes.
    if ($tunel.PSObject.Properties.Name -contains 'dominio') { $dominio = $tunel.dominio }
}
$modo = if ($dominio) { 'ngrok' } else { 'cloudflare' }

$ngrokExe = $null
$cloudflaredExe = $null
if ($modo -eq 'ngrok') {
    $ngrokExe = Join-Path $env:APPDATA 'npm\node_modules\ngrok\bin\ngrok.exe'
    if (-not (Test-Path $ngrokExe)) {
        $enPath = (Get-Command ngrok -ErrorAction SilentlyContinue)
        if ($enPath) { $ngrokExe = $enPath.Source }
        else { Escribir 'ERROR' 'No encuentro ngrok.'; exit 1 }
    }
} else {
    $cloudflaredExe = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
    if (-not (Test-Path $cloudflaredExe)) {
        $enPath = (Get-Command cloudflared -ErrorAction SilentlyContinue)
        if ($enPath) { $cloudflaredExe = $enPath.Source }
        else { Escribir 'ERROR' 'No encuentro cloudflared ni tunel.json. Instalalo con: winget install --id Cloudflare.cloudflared'; exit 1 }
    }
}

# URL publica activa. En modo ngrok se sabe de entrada; en cloudflare se
# descubre leyendo el log del tunel recien arrancado.
$urlPublica = if ($dominio) { "https://$dominio" } else { $null }

# ─── Chequeos de salud ───────────────────────────────────────────────────────
function BackendVivo {
    try {
        $r = Invoke-RestMethod "http://localhost:$PUERTO/health" -TimeoutSec $TIMEOUT_HEALTH
        return $r.status -eq 'ok'
    } catch { return $false }
}

function TunelVivo {
    if ($modo -eq 'ngrok') {
        # ngrok expone su propia API en 4040. Preguntarle a el es mas barato y
        # mas confiable que salir a internet a pegarle al dominio publico.
        try {
            $r = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 5
            foreach ($t in $r.tunnels) {
                if ($t.public_url -like "*$dominio*") { return $true }
            }
            return $false
        } catch { return $false }
    }

    # cloudflared no expone una API local: alcanza con que el proceso siga vivo
    # y ya le hayamos sacado una URL.
    if (-not $script:urlPublica) { return $false }
    $vivo = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match 'tunnel' }
    return [bool]$vivo
}

function MatarPorNombre($nombre, $filtroLinea) {
    Get-CimInstance Win32_Process -Filter "Name = '$nombre'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match $filtroLinea } |
        ForEach-Object {
            Escribir 'INFO' "Matando $nombre pid $($_.ProcessId)"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

function ArrancarBackend {
    MatarPorNombre 'node.exe' 'api-server\.js'
    RotarSiHaceFalta $logBackend
    RotarSiHaceFalta $logBackendEr

    $env:FRONTEND_URL = $ORIGENES
    $env:NODE_ENV = 'production'
    $env:PORT = "$PUERTO"

    $p = Start-Process -FilePath 'node' -ArgumentList 'src/api-server.js' `
        -WorkingDirectory $dirBackend -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $logBackend -RedirectStandardError $logBackendEr
    Escribir 'INFO' "Backend arrancado (pid $($p.Id))"

    # Darle margen a Firestore para inicializar antes del primer chequeo.
    foreach ($i in 1..30) {
        Start-Sleep -Seconds 1
        if (BackendVivo) { Escribir 'INFO' 'Backend responde /health'; return $true }
    }
    Escribir 'ERROR' 'El backend no respondio en 30s. Mira backend.err.log'
    return $false
}

function ArrancarTunel {
    if ($modo -eq 'ngrok') {
        MatarPorNombre 'ngrok.exe' 'http'
        RotarSiHaceFalta $logTunel
        Start-Sleep -Seconds 2

        # --url y no --domain: ngrok 3.37 deprecó --domain y avisa por log en
        # cada arranque.
        $argsNgrok = @(
            'http', "$PUERTO",
            "--url=https://$dominio",
            '--log', $logTunel,
            '--log-format', 'logfmt',
            '--log-level', 'info'
        )
        $p = Start-Process -FilePath $ngrokExe -ArgumentList $argsNgrok -PassThru -WindowStyle Hidden
        Escribir 'INFO' "ngrok arrancado (pid $($p.Id)) -> https://$dominio"

        foreach ($i in 1..20) {
            Start-Sleep -Seconds 1
            if (TunelVivo) { Escribir 'INFO' 'Tunel activo'; return $true }
        }
        Escribir 'ERROR' "El tunel no levanto. Mira $logTunel"
        return $false
    }

    # ── Modo cloudflare ──
    MatarPorNombre 'cloudflared.exe' 'tunnel'
    # El log se borra en vez de rotarse: la URL se descubre buscandola ahi, y
    # con las corridas anteriores mezcladas se leeria una URL ya muerta.
    Remove-Item $logTunel -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    $argsCf = @('tunnel', '--url', "http://localhost:$PUERTO", '--no-autoupdate', '--logfile', $logTunel)
    $p = Start-Process -FilePath $cloudflaredExe -ArgumentList $argsCf -PassThru -WindowStyle Hidden
    Escribir 'INFO' "cloudflared arrancado (pid $($p.Id)), esperando URL"

    $url = $null
    foreach ($i in 1..45) {
        Start-Sleep -Seconds 1
        if (-not (Test-Path $logTunel)) { continue }
        $m = Select-String -Path $logTunel -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
             Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value; break }
    }
    if (-not $url) {
        Escribir 'ERROR' "El tunel no devolvio URL. Mira $logTunel"
        return $false
    }

    $script:urlPublica = $url
    Escribir 'INFO' "Tunel activo -> $url"
    PublicarUrl $url
    return $true
}

# Deja el frontend apuntando a la URL nueva. Solo corre en modo cloudflare y
# solo cuando la URL cambio: publicar el hosting tarda ~40s y no hay por que
# hacerlo si el tunel volvio a levantar con la misma direccion.
function PublicarUrl($url) {
    $publicado = Join-Path $raizServicio 'ultima-url.txt'
    # El -replace saca el BOM: Set-Content -Encoding utf8 en PowerShell 5.1 lo
    # escribe siempre, y sin sacarlo la comparacion nunca da igual y se
    # redeployaria el hosting en cada arranque aunque la URL no haya cambiado.
    $previo = if (Test-Path $publicado) { ((Get-Content $publicado -Raw) -replace "^﻿", '').Trim() } else { '' }
    if ($previo -eq $url) {
        Escribir 'INFO' 'La URL no cambio, no hace falta redeployar'
        return
    }

    Escribir 'INFO' "URL nueva (antes: '$previo'), actualizando config.json y hosting"
    $json = [ordered]@{
        _comentario = 'URL del backend. La escribe servicio/mantener-backend.ps1 en cada arranque del tunel rapido de Cloudflare. Con un dominio fijo de ngrok esto deja de cambiar.'
        apiUrl      = $url
    } | ConvertTo-Json

    EscribirUtf8SinBom (Join-Path $raizProyecto 'frontend\public\config.json') $json
    $enDist = Join-Path $raizProyecto 'frontend\dist\frontend\browser\config.json'
    if (Test-Path $enDist) { EscribirUtf8SinBom $enDist $json }

    Push-Location $raizProyecto
    try {
        # El deploy no puede tumbar al supervisor: si falla, el backend sigue
        # arriba y se reintenta en el proximo arranque del tunel.
        $salida = & npx firebase deploy --only hosting --project muni-8ed74 --non-interactive 2>&1
        if ($LASTEXITCODE -eq 0) {
            EscribirUtf8SinBom $publicado $url
            Escribir 'INFO' 'Hosting publicado'
        } else {
            Escribir 'ERROR' "El deploy del hosting fallo (exit $LASTEXITCODE): $($salida | Select-Object -Last 3)"
        }
    } catch {
        Escribir 'ERROR' "El deploy del hosting tiro: $($_.Exception.Message)"
    } finally { Pop-Location }
}

# ─── Loop ────────────────────────────────────────────────────────────────────
Escribir 'INFO' "=== Supervisor arrancando (dominio: $dominio) ==="

$fallosSeguidos = 0
try {
    while ($true) {
        RotarSiHaceFalta $logPrincipal

        if (-not (BackendVivo)) {
            Escribir 'WARN' 'Backend caido, reiniciando'
            if (ArrancarBackend) { $fallosSeguidos = 0 } else { $fallosSeguidos++ }
        }

        if (-not (TunelVivo)) {
            Escribir 'WARN' 'Tunel caido, reiniciando'
            if (ArrancarTunel) { $fallosSeguidos = 0 } else { $fallosSeguidos++ }
        }

        # Si algo esta roto de verdad (sin internet, authtoken vencido) no tiene
        # sentido reintentar cada 30s y llenar el log: se espacia progresivamente
        # hasta 5 minutos.
        $espera = $INTERVALO_SEG
        if ($fallosSeguidos -ge 3) { $espera = [Math]::Min(300, $INTERVALO_SEG * $fallosSeguidos) }
        Start-Sleep -Seconds $espera
    }
} finally {
    Escribir 'INFO' 'Supervisor terminando, bajando procesos'
    MatarPorNombre 'node.exe' 'api-server\.js'
    MatarPorNombre 'ngrok.exe' 'http'
    MatarPorNombre 'cloudflared.exe' 'tunnel'
    [Energia.Win32]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
    $mutex.ReleaseMutex()
}
