# Configuracion inicial del tunel. Se corre UNA sola vez.
#
# Antes de correrlo, en https://dashboard.ngrok.com:
#   1. Crear cuenta (gratis).
#   2. Copiar el authtoken de "Your Authtoken".
#   3. En "Domains", crear el dominio estatico gratuito. Queda algo como
#      lindo-nombre-1234.ngrok-free.app. Ese es el que va en -Dominio.
#
# Uso:
#   .\configurar-ngrok.ps1 -Authtoken '2abc...' -Dominio 'algo.ngrok-free.app'
#
# Que hace:
#   - Guarda el authtoken en la config de ngrok (fuera del repo, nunca se commitea).
#   - Escribe servicio\tunel.json, que es lo que lee el supervisor.
#   - Apunta el frontend a https://<dominio> (config.json) y redeploya el hosting.
#     Esto es lo ultimo que hay que hacer con el hosting: como el dominio es fijo,
#     no se toca nunca mas.

param(
    [Parameter(Mandatory = $true)][string]$Authtoken,
    [Parameter(Mandatory = $true)][string]$Dominio,
    # Saltea el deploy del hosting (util si solo queres reconfigurar el token).
    [switch]$SinDeploy
)

$ErrorActionPreference = 'Stop'

$raizServicio = $PSScriptRoot
$raizProyecto = Split-Path $raizServicio -Parent

# Se acepta pegar la URL completa; se queda con el host pelado.
$Dominio = $Dominio.Trim() -replace '^https?://', '' -replace '/+$', ''
if ($Dominio -notmatch '^[a-z0-9.\-]+\.[a-z]{2,}$') {
    throw "Dominio raro: '$Dominio'. Esperaba algo como lindo-nombre-1234.ngrok-free.app"
}

$ngrokExe = Join-Path $env:APPDATA 'npm\node_modules\ngrok\bin\ngrok.exe'
if (-not (Test-Path $ngrokExe)) {
    $enPath = Get-Command ngrok -ErrorAction SilentlyContinue
    if ($enPath) { $ngrokExe = $enPath.Source }
    else { throw 'No encuentro ngrok. Instalalo con: npm i -g ngrok' }
}

Write-Host "`n[1/4] Guardando el authtoken de ngrok..." -ForegroundColor Cyan
& $ngrokExe config add-authtoken $Authtoken
if ($LASTEXITCODE -ne 0) { throw "ngrok rechazo el authtoken (exit $LASTEXITCODE)" }
Write-Host "      listo (queda en $env:LOCALAPPDATA\ngrok\ngrok.yml, fuera del repo)" -ForegroundColor Green

Write-Host "[2/4] Escribiendo tunel.json..." -ForegroundColor Cyan
[ordered]@{
    _comentario = 'Dominio estatico de ngrok. Lo lee mantener-backend.ps1. El authtoken NO vive aca: esta en la config de ngrok.'
    dominio     = $Dominio
} | ConvertTo-Json | Set-Content -Path (Join-Path $raizServicio 'tunel.json') -Encoding utf8
Write-Host "      dominio: $Dominio" -ForegroundColor Green

Write-Host "[3/5] Apuntando el frontend a https://$Dominio ..." -ForegroundColor Cyan
$config = [ordered]@{
    _comentario = 'URL del backend. La app la lee al arrancar. Dominio estatico de ngrok: no cambia entre reinicios, no hace falta volver a deployar por esto.'
    apiUrl      = "https://$Dominio"
}
$json = $config | ConvertTo-Json
# UTF-8 sin BOM: lo lee el navegador con JSON.parse y Set-Content -Encoding utf8
# de PowerShell 5.1 siempre le mete BOM adelante.
$sinBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $raizProyecto 'frontend\public\config.json'), $json, $sinBom)

# Tambien el fallback del build. Si algun dia config.json no carga (404, cache
# raro), la app cae en environment.apiUrl: hasta ahora apuntaba al viejo Render,
# que ya no existe, con lo que el fallback estaba tan muerto como el principal.
$envProd = Join-Path $raizProyecto 'frontend\src\environments\environment.prod.ts'
$texto = Get-Content $envProd -Raw
$nuevo = [regex]::Replace($texto, "apiUrl:\s*'[^']*'", "apiUrl: 'https://$Dominio'", 1)
if ($nuevo -eq $texto) { throw "No pude actualizar apiUrl en $envProd. Revisalo a mano." }
[System.IO.File]::WriteAllText($envProd, $nuevo, $sinBom)
Write-Host '      config.json y environment.prod.ts actualizados' -ForegroundColor Green

Write-Host '[4/5] Compilando el frontend...' -ForegroundColor Cyan
Push-Location $raizProyecto
try {
    npm run build --workspace=frontend
    if ($LASTEXITCODE -ne 0) { throw "El build fallo (exit $LASTEXITCODE)" }
} finally { Pop-Location }
Write-Host '      build listo' -ForegroundColor Green

if ($SinDeploy) {
    Write-Host "[5/5] Deploy salteado (-SinDeploy).`n" -ForegroundColor Yellow
} else {
    Write-Host '[5/5] Publicando en Firebase Hosting...' -ForegroundColor Cyan
    Push-Location $raizProyecto
    try {
        npx firebase deploy --only hosting --project muni-8ed74 --non-interactive
        if ($LASTEXITCODE -ne 0) { throw "El deploy fallo (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
    Write-Host '      hosting actualizado' -ForegroundColor Green
}

Write-Host "`n  Tunel configurado." -ForegroundColor Green
Write-Host "  Backend publico: https://$Dominio"
Write-Host "  Siguiente paso : .\instalar-tarea.ps1`n"
