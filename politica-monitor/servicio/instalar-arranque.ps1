# Hace que las tareas de PoliticaMonitor arranquen con la PC, sin esperar a que
# alguien inicie sesion en Windows.
#
# El problema que resuelve: instalar-tarea.ps1 e instalar-scraper.ps1 registran
# las tareas con disparador "al iniciar sesion", porque eso no pide permisos de
# administrador. El precio es que si la PC se reinicia sola de madrugada y queda
# en la pantalla de login, la API esta caida hasta que alguien entre.
#
# Que cambia este script:
#   - Agrega el disparador "al arrancar el sistema".
#   - Pasa las tareas a LogonType S4U ("correr este o no iniciada la sesion"),
#     que no guarda contrasena en ningun lado.
#   - Las deja con privilegios elevados (RunLevel Highest).
#
# Por que S4U y no SYSTEM: el supervisor republica el hosting con
# `npx firebase deploy` cuando el tunel de Cloudflare cambia de URL, y las
# credenciales del CLI viven en el perfil del usuario
# (%USERPROFILE%\.config\configstore\firebase-tools.json). Corriendo como SYSTEM
# esas credenciales no existen y el deploy falla, asi que el sitio quedaria
# apuntando a una URL muerta. Con S4U las tareas corren con la identidad del
# usuario y su perfil, sin necesitar que este logueado.
#
# Necesita PowerShell como administrador (el cambio de principal de una tarea
# lo exige). Uso:
#   .\instalar-arranque.ps1             deja las tareas arrancando con la PC
#   .\instalar-arranque.ps1 -Revertir   vuelve a "solo al iniciar sesion"

param([switch]$Revertir)

$ErrorActionPreference = 'Stop'

$TAREAS = @('PoliticaMonitor Backend', 'PoliticaMonitor Scraper')

$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Hace falta PowerShell como administrador. Abri uno elevado y volve a correr este script."
}

$usuario = $identidad.Name   # DOMINIO\usuario

foreach ($nombre in $TAREAS) {
    $tarea = Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue
    if (-not $tarea) {
        Write-Host "  '$nombre' no esta registrada, la salteo. Corre instalar-tarea.ps1 / instalar-scraper.ps1 primero." -ForegroundColor Yellow
        continue
    }

    if ($Revertir) {
        $disparadores = @(New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME)
        # Interactive = la tarea solo corre con el usuario logueado, que es el
        # comportamiento original.
        $prin = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive
    } else {
        # Los dos disparadores juntos: "al arrancar" cubre el reinicio sin
        # login, "al iniciar sesion" cubre el caso de que alguien mate la tarea
        # y despues vuelva a entrar.
        $disparadores = @(
            (New-ScheduledTaskTrigger -AtStartup),
            (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME)
        )
        $prin = New-ScheduledTaskPrincipal -UserId $usuario -LogonType S4U -RunLevel Highest
    }

    # Se conservan los Settings que ya tenia la tarea (ExecutionTimeLimit en
    # PT0S, reintentos cada minuto, etc.): solo cambian disparadores y principal.
    Set-ScheduledTask -TaskName $nombre -Trigger $disparadores -Principal $prin | Out-Null

    $t = Get-ScheduledTask -TaskName $nombre
    $tipos = ($t.Triggers | ForEach-Object { $_.CimClass.CimClassName -replace 'MSFT_Task|Trigger', '' }) -join ', '
    Write-Host "  '$nombre' -> logon: $($t.Principal.LogonType) | disparadores: $tipos" -ForegroundColor Green
}

# Arrancarlas ahora si estan detenidas: cambiar el principal las deja Ready.
foreach ($nombre in $TAREAS) {
    $t = Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue
    if ($t -and $t.State -ne 'Running') {
        Start-ScheduledTask -TaskName $nombre
        Write-Host "  '$nombre' arrancada" -ForegroundColor Cyan
    }
}

Write-Host "`nListo. Chequeo rapido:" -ForegroundColor Green
Get-ScheduledTask | Where-Object TaskName -like 'PoliticaMonitor*' |
    Select-Object TaskName, State, @{n='LogonType'; e={$_.Principal.LogonType}} |
    Format-Table -AutoSize | Out-String | Write-Host

Write-Host "Queda un limite: si la PC se apaga del todo, no hay backend de respaldo.`n"
