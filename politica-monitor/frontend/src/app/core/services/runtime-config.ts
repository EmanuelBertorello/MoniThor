import { environment } from '../../../environments/environment';

// La URL de la API no queda quemada en el build: se lee de /config.json al
// arrancar la app. Así, mover el backend (de esta PC a Render, a un VPS, a
// donde sea) es editar un archivo y redeployar solo el hosting, sin recompilar
// el frontend ni tocar código.
//
// Si el archivo no existe o falla, se usa environment.apiUrl como antes.
interface RuntimeConfig {
  apiUrl?: string;
}

let configurada: string | null = null;

export function apiBaseUrl(): string {
  return configurada ?? environment.apiUrl;
}

export async function cargarRuntimeConfig(): Promise<void> {
  try {
    // cache: 'no-store' es importante: si el navegador cachea el config.json
    // viejo, la app sigue apuntando al backend anterior después de moverlo.
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) return;

    const cfg: RuntimeConfig = await res.json();
    const url = (cfg.apiUrl ?? '').trim().replace(/\/+$/, '');
    if (url) configurada = url;
  } catch {
    // Sin config.json se sigue con lo que trae el build.
  }
}
