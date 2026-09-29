# Levanta el backend en esta PC y lo publica con un tunel de Cloudflare, para
# que https://muni-8ed74.web.app pueda usarlo.
#
# Por que hace falta: Firebase Hosting sirve el frontend, pero la API necesita
# un Node corriendo. Cloud Functions exige el plan Blaze (facturacion abierta),
# asi que por ahora la API vive aca.
#
# El tunel gratuito da una URL distinta cada vez que arranca, por eso el script
# la detecta sola, la escribe en config.json y redeploya el hosting. El frontend
# lee esa URL al iniciar, asi que no hay que recompilar nada.
#
# Uso:  .\levantar-backend-local.ps1
# Cortar: Ctrl+C (frena el tunel; el backend se cierra con el script)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot

$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
    $enPath = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
    if ($enPath) { $cloudflared = $enPath }
    else { throw "No encuentro cloudflared. Instalalo con: winget install --id Cloudflare.cloudflared" }
}

# Origenes que la API acepta por CORS: los dos dominios de Firebase Hosting mas
# el front local por si estas desarrollando.
$origenes = 'https://muni-8ed74.web.app,https://muni-8ed74.firebaseapp.com,http://localhost:4300'

Write-Host "`n[1/4] Arrancando el backend en el puerto 4000..." -ForegroundColor Cyan
$env:FRONTEND_URL = $origenes
$backend = Start-Process -FilePath 'node' -ArgumentList 'src/api-server.js' `
    -WorkingDirectory (Join-Path $raiz 'backend') -PassThru -WindowStyle Hidden

$listo = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    try {
        if ((Invoke-RestMethod 'http://localhost:4000/health' -TimeoutSec 3).status -eq 'ok') { $listo = $true; break }
    } catch { }
}
if (-not $listo) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue; throw "El backend no respondio en el puerto 4000" }
Write-Host "      backend OK (pid $($backend.Id))" -ForegroundColor Green

Write-Host "[2/4] Abriendo el tunel..." -ForegroundColor Cyan
$log = Join-Path $env:TEMP 'cf-tunnel.log'
if (Test-Path $log) { Remove-Item $log -Force }
$tunel = Start-Process -FilePath $cloudflared `
    -ArgumentList 'tunnel', '--url', 'http://localhost:4000', '--no-autoupdate', '--logfile', $log `
    -PassThru -WindowStyle Hidden

$url = $null
foreach ($i in 1..40) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
             Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value; break }
    }
}
if (-not $url) {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $tunel.Id -Force -ErrorAction SilentlyContinue
    throw "El tunel no devolvio una URL. Mira $log"
}
Write-Host "      tunel OK: $url" -ForegroundColor Green

Write-Host "[3/4] Escribiendo config.json..." -ForegroundColor Cyan
$config = [ordered]@{
    _comentario = 'URL del backend. La app la lee al arrancar, por eso mover el backend no requiere recompilar el frontend.'
    apiUrl      = $url
}
$destino = Join-Path $raiz 'frontend\public\config.json'
$config | ConvertTo-Json | Set-Content -Path $destino -Encoding utf8
# El build servido tambien tiene su copia: se pisa para no tener que recompilar.
$enDist = Join-Path $raiz 'frontend\dist\frontend\browser\config.json'
if (Test-Path $enDist) { $config | ConvertTo-Json | Set-Content -Path $enDist -Encoding utf8 }

Write-Host "[4/4] Publicando en Firebase Hosting..." -ForegroundColor Cyan
Push-Location $raiz
try { npx firebase deploy --only hosting --project muni-8ed74 --non-interactive | Out-Null }
finally { Pop-Location }

Write-Host "`n  Todo arriba." -ForegroundColor Green
Write-Host "  Sitio  : https://muni-8ed74.web.app"
Write-Host "  Backend: $url"
Write-Host "`n  Dejalo abierto. Ctrl+C para cortar.`n" -ForegroundColor Yellow

try {
    while ($true) {
        Start-Sleep -Seconds 5
        if ($backend.HasExited -or $tunel.HasExited) { Write-Host "  Un proceso se cerro, cortando." -ForegroundColor Red; break }
    }
} finally {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $tunel.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Backend y tunel detenidos." -ForegroundColor Yellow
}
