// Quién puede ver una campaña y lo que cuelga de ella (menciones, keywords,
// fuentes, reportes, analytics).
//
// Hasta acá cada ruta comparaba `recurso.userId !== req.user.id` a mano, con lo
// que un ADMIN no veía las campañas de nadie más: el panel de Usuarios le
// dejaba administrar cuentas pero el dashboard le salía vacío. Para una
// herramienta de monitoreo eso no tiene sentido, y además hace imposible que
// alguien pruebe el sistema sin cargarle datos propios primero.
function puedeAcceder(user, recurso) {
  if (!user || !recurso) return false;
  if (user.role === 'ADMIN') return true;
  return recurso.userId === user.id;
}

// Aplica el filtro por dueño a una consulta de Firestore, salvo que sea ADMIN.
function filtrarPorDueno(query, user, campo = 'userId') {
  if (user?.role === 'ADMIN') return query;
  return query.where(campo, '==', user?.id ?? '__sin_usuario__');
}

module.exports = { puedeAcceder, filtrarPorDueno };
