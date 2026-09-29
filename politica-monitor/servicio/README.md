# Backend 24/7 en esta PC

El frontend vive en Firebase Hosting, pero la API necesita un Node corriendo.
Cloud Functions pide plan Blaze y el Render gratuito ya no existe, así que la API
corre en esta máquina y sale a internet por un túnel.

## Ya está andando

`instalar-tarea.ps1` ya se corrió: la tarea está registrada y el backend sale por
un **túnel rápido de Cloudflare**, que no necesita cuenta de nada.

El precio de ese modo es que Cloudflare da una URL distinta en cada arranque. El
supervisor lo resuelve solo: cuando detecta una URL nueva reescribe
`frontend/public/config.json` y redeploya el hosting. Tarda unos 40 s después de
cada arranque, y en esa ventana el sitio apunta a la URL vieja.

## Mejora opcional: dominio fijo con ngrok

Con un dominio estático de ngrok la URL deja de cambiar y desaparece el redeploy
automático en cada arranque.

1. En <https://dashboard.ngrok.com>: crear cuenta gratis, copiar el **authtoken**,
   y en **Domains** crear el dominio estático gratuito
   (queda tipo `algo-1234.ngrok-free.app`).

2. ```powershell
   cd C:\Users\EMANUEL\Desktop\Monitor2.0\politica-monitor\servicio
   .\configurar-ngrok.ps1 -Authtoken '<tu-token>' -Dominio 'algo-1234.ngrok-free.app'
   .\instalar-tarea.ps1
   ```

El supervisor elige el modo solo: si existe `tunel.json` usa ngrok, si no usa
Cloudflare.

## Cómo funciona

`mantener-backend.ps1` es un supervisor que no termina nunca:

- Arranca `node src/api-server.js` en el puerto 4000 y el túnel contra ese puerto.
- Cada 30 s chequea `localhost:4000/health` y el túnel (la API local de ngrok en
  `:4040`, o el proceso de `cloudflared`). Si alguno no responde, lo relevanta.
- En modo Cloudflare, cuando la URL cambia actualiza `config.json` y publica el
  hosting. `ultima-url.txt` guarda la última publicada para no redeployar al
  pedo cuando el túnel vuelve con la misma.
- Tras 3 fallos seguidos espacia los reintentos hasta 5 min, para no llenar el
  log cuando el problema es de afuera (sin internet, token vencido).
- Le pide a Windows no suspender la máquina mientras corre (la pantalla se apaga
  igual, el sistema no se duerme).
- Un mutex global evita que queden dos supervisores peleando por el puerto.

La tarea programada arranca **al iniciar sesión**, con reintento cada minuto y sin
límite de duración (el default de Windows mata tareas a las 72 h).

## Operación

```powershell
# estado
Get-ScheduledTask 'PoliticaMonitor Backend'
Invoke-RestMethod http://localhost:4000/health

# logs
Get-Content .\logs\supervisor.log -Tail 50
Get-Content .\logs\backend.err.log -Tail 50

# reiniciar
Stop-ScheduledTask 'PoliticaMonitor Backend'; Start-ScheduledTask 'PoliticaMonitor Backend'

# desinstalar
.\instalar-tarea.ps1 -Quitar

# probar a mano, viendo el log en pantalla
.\mantener-backend.ps1 -Verboso
```

## Límites conocidos

- **Arranca al iniciar sesión, no al boot.** Si la PC se reinicia sola y queda en
  la pantalla de login, la API está caída hasta que alguien entre. Para que
  arranque sin login hace falta un servicio de Windows, y eso pide permisos de
  administrador.
- **Los túneles gratuitos se cortan cada tanto.** El supervisor los relevanta
  solo, pero hay unos segundos de corte, y en modo Cloudflare además el minuto
  que tarda el redeploy del hosting.
- **La página de advertencia de ngrok** se saltea con el header
  `ngrok-skip-browser-warning`, que mandan `auth.interceptor.ts` y
  `socket.service.ts`. Si algún día se pega a la API desde otro cliente, ese
  header tiene que ir.
- **Socket.IO (el "Offline" del header) no sobrevive bien al túnel.** Solo afecta
  las menciones en tiempo real; el resto de la app anda igual porque va por HTTP.
- **Si la PC se apaga, el sitio deja de funcionar.** No hay backend de respaldo.

## Archivos

| Archivo | Para qué |
|---|---|
| `configurar-ngrok.ps1` | Setup inicial: token, dominio, config.json, build, deploy |
| `instalar-tarea.ps1` | Crea/quita la tarea programada |
| `mantener-backend.ps1` | El supervisor |
| `tunel.json` | Dominio de ngrok, si se configuró. Sin él, modo Cloudflare |
| `ultima-url.txt` | Última URL publicada en el hosting (modo Cloudflare) |
| `logs/` | supervisor, backend y ngrok |
