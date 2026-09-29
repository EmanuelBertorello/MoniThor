// Cache en memoria de las lecturas calientes de Firestore.
//
// Por qué existe: el proyecto está en el plan Spark, que corta las lecturas a
// 50.000 por día para todo el proyecto. Cuando se acaban, Firestore contesta
// `8 RESOURCE_EXHAUSTED: Quota exceeded` a TODA lectura y el sistema entero
// queda muerto hasta la medianoche de California. Las que más queman son las
// que se repiten en cada pantalla:
//
//   - users/{uid}   una lectura por request autenticado (el dashboard hace
//                   ~8 requests por carga).
//   - campaigns/{id} una lectura por chequeo de permiso, en casi toda ruta.
//   - mentions      analytics baja el rango entero de menciones; con 180d son
//                   miles de documentos por llamada, y el dashboard la pide
//                   cada vez que alguien cambia de pestaña.
//
// Con un TTL corto el resultado que ve el usuario sigue siendo fresco (60s) y
// las lecturas repetidas dejan de pegarle a Firestore.
//
// Es cache por proceso: si algún día corren dos instancias, cada una tiene la
// suya. No pasa nada — el TTL es corto y nada crítico depende de que dos
// procesos vean exactamente lo mismo en el mismo segundo.

const TTL_DEFECTO_MS = 60 * 1000;

// Cuánto tiempo se guarda un valor vencido para usarlo de red de emergencia
// cuando Firestore no contesta (cuota agotada o caída). Mejor servir algo de
// hace minutos que tirar el sistema abajo.
const TTL_EMERGENCIA_MS = 30 * 60 * 1000;

const MAX_ENTRADAS = 1000;

function crearCache({ ttlMs = TTL_DEFECTO_MS, ttlEmergenciaMs = TTL_EMERGENCIA_MS } = {}) {
  const datos = new Map();

  function podar() {
    if (datos.size <= MAX_ENTRADAS) return;
    // Map itera en orden de inserción: los primeros son los más viejos.
    const sobran = datos.size - MAX_ENTRADAS;
    let i = 0;
    for (const k of datos.keys()) {
      datos.delete(k);
      if (++i >= sobran) break;
    }
  }

  return {
    // Valor fresco, o undefined si venció o no está.
    get(clave) {
      const e = datos.get(clave);
      if (!e) return undefined;
      if (Date.now() > e.vence) return undefined;
      return e.valor;
    },

    // Valor vencido pero todavía utilizable. Solo para cuando Firestore falla.
    getVencido(clave) {
      const e = datos.get(clave);
      if (!e) return undefined;
      if (Date.now() > e.venceEmergencia) { datos.delete(clave); return undefined; }
      return e.valor;
    },

    set(clave, valor) {
      const ahora = Date.now();
      datos.delete(clave); // reinserta al final para que el podado sea por edad
      datos.set(clave, { valor, vence: ahora + ttlMs, venceEmergencia: ahora + ttlEmergenciaMs });
      podar();
      return valor;
    },

    invalidar(clave) {
      datos.delete(clave);
    },

    // Borra todo lo que empiece con ese prefijo (ej: todas las entradas de
    // analytics de una campaña que acaba de cambiar).
    invalidarPrefijo(prefijo) {
      for (const k of datos.keys()) {
        if (k.startsWith(prefijo)) datos.delete(k);
      }
    },

    vaciar() { datos.clear(); },
  };
}

// Errores de Firestore ante los que conviene servir cache vencida en vez de
// romper: cuota agotada, servicio caído, deadline.
function esFalloTransitorio(err) {
  return err && (err.code === 8 || err.code === 4 || err.code === 14);
}

const usuarios = crearCache({ ttlMs: 60 * 1000 });
const campanas = crearCache({ ttlMs: 60 * 1000 });
const analytics = crearCache({ ttlMs: 60 * 1000 });

// Lee campaigns/{id} pasando por cache. Devuelve los datos crudos del
// documento (sin id) o null si no existe.
async function leerCampana(db, campaignId) {
  if (!campaignId) return null;

  const enCache = campanas.get(campaignId);
  if (enCache !== undefined) return enCache;

  try {
    const doc = await db.collection('campaigns').doc(campaignId).get();
    return campanas.set(campaignId, doc.exists ? { id: doc.id, ...doc.data() } : null);
  } catch (err) {
    if (esFalloTransitorio(err)) {
      const vencido = campanas.getVencido(campaignId);
      if (vencido !== undefined) return vencido;
    }
    throw err;
  }
}

// Envuelve una lectura cara (analytics) con cache de 60s. `clave` tiene que
// incluir todo lo que cambie el resultado: campaña, período, intervalo.
async function analyticsCacheado(clave, calcular) {
  const enCache = analytics.get(clave);
  if (enCache !== undefined) return enCache;

  try {
    return analytics.set(clave, await calcular());
  } catch (err) {
    if (esFalloTransitorio(err)) {
      const vencido = analytics.getVencido(clave);
      if (vencido !== undefined) return vencido;
    }
    throw err;
  }
}

// Una campaña cambió (o sus menciones): su ficha y sus analytics dejan de valer.
function invalidarCampana(campaignId) {
  if (!campaignId) return;
  campanas.invalidar(campaignId);
  analytics.invalidarPrefijo(`${campaignId}|`);
}

module.exports = {
  crearCache, esFalloTransitorio,
  usuarios, campanas, analytics,
  leerCampana, analyticsCacheado, invalidarCampana,
};
