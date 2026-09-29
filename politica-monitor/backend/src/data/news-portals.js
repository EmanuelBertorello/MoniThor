// Base de datos de portales de noticias por provincia argentina
// Cada portal tiene: domain (para RSS/scraping), name (display)

const NEWS_PORTALS = {
  'Buenos Aires': [
    { domain: 'eldia.com', name: 'El Día' },
    { domain: 'lacapitalmdp.com', name: 'La Capital MDP' },
    { domain: 'lanueva.com', name: 'La Nueva' },
    { domain: 'eleco.com.ar', name: 'El Eco' },
    { domain: 'diariodemocracia.com', name: 'Democracia' },
    { domain: 'diarioeltiempo.com.ar', name: 'El Tiempo' },
    { domain: 'infocielo.com', name: 'InfoCielo' },
    { domain: '0221.com.ar', name: '0221' },
    { domain: '0223.com.ar', name: '0223' },
    { domain: 'laopinion.com.ar', name: 'La Opinión' },
  ],
  'CABA': [
    { domain: 'infobae.com', name: 'Infobae' },
    { domain: 'clarin.com', name: 'Clarín' },
    { domain: 'lanacion.com.ar', name: 'La Nación' },
    { domain: 'pagina12.com.ar', name: 'Página/12' },
    { domain: 'perfil.com', name: 'Perfil' },
    { domain: 'ambito.com', name: 'Ámbito' },
    { domain: 'cronista.com', name: 'El Cronista' },
    { domain: 'tn.com.ar', name: 'TN' },
    { domain: 'c5n.com', name: 'C5N' },
    { domain: 'diariopopular.com.ar', name: 'Diario Popular' },
  ],
  'Catamarca': [
    { domain: 'elancasti.com.ar', name: 'El Ancasti' },
    { domain: 'elesquiu.com', name: 'El Esquiú' },
    { domain: 'catamarcaactual.com.ar', name: 'Catamarca Actual' },
    { domain: 'launion.digital', name: 'La Unión' },
    { domain: 'catamarcaprovincia.com.ar', name: 'Catamarca Provincia' },
    { domain: 'catamarcadigital.com', name: 'Catamarca Digital' },
    { domain: 'elpucara.com', name: 'El Pucará' },
    { domain: 'inforama.com.ar', name: 'Inforama' },
  ],
  'Chaco': [
    { domain: 'diariochaco.com', name: 'Diario Chaco' },
    { domain: 'diarionorte.com', name: 'Diario Norte' },
    { domain: 'datachaco.com', name: 'DataChaco' },
    { domain: 'chacodiapordia.com', name: 'Chaco Día por Día' },
    { domain: 'alertaurbana.com.ar', name: 'Alerta Urbana' },
    { domain: 'agenciafoco.com.ar', name: 'Agencia FOCO' },
    { domain: 'diariotag.com', name: 'Diario Tag' },
    { domain: 'chacoon.com.ar', name: 'Chaco ON' },
  ],
  'Chubut': [
    { domain: 'elchubut.com.ar', name: 'El Chubut' },
    { domain: 'diariojornada.com.ar', name: 'Diario Jornada' },
    { domain: 'elpatagonico.com', name: 'El Patagónico' },
    { domain: 'adnsur.com.ar', name: 'ADNSUR' },
    { domain: 'eqsnotas.com', name: 'EQS Notas' },
    { domain: 'madrynahora.com', name: 'Madryn Ahora' },
    { domain: 'red43.com.ar', name: 'Red 43' },
    { domain: 'chubutdigital.com.ar', name: 'Chubut Digital' },
    { domain: 'eldiariodemadryn.com', name: 'El Diario de Madryn' },
  ],
  'Córdoba': [
    { domain: 'lavoz.com.ar', name: 'La Voz del Interior' },
    { domain: 'cadena3.com', name: 'Cadena 3' },
    { domain: 'eldoce.tv', name: 'El Doce' },
    { domain: 'puntal.com.ar', name: 'Puntal' },
    { domain: 'hoydia.com.ar', name: 'Hoy Día Córdoba' },
    { domain: 'cba24n.com.ar', name: 'Cba24n' },
    { domain: 'lmdiario.com.ar', name: 'La Nueva Mañana' },
    { domain: 'diarioalfil.com.ar', name: 'Diario Alfil' },
    { domain: 'villamariaya.com', name: 'Villa María Ya' },
    { domain: 'carlospazvivo.com', name: 'Carlos Paz Vivo' },
  ],
  'Corrientes': [
    { domain: 'diarioepoca.com', name: 'Diario Época' },
    { domain: 'ellitoral.com.ar', name: 'El Litoral' },
    { domain: 'corrienteshoy.com', name: 'Corrientes Hoy' },
    { domain: 'diarioellibertador.com.ar', name: 'El Libertador' },
    { domain: 'momarandu.com', name: 'Momarandu' },
    { domain: 'corrientesonline.com', name: 'Corrientes Online' },
  ],
  'Entre Ríos': [
    { domain: 'elonce.com', name: 'El Once' },
    { domain: 'unoentrerios.com.ar', name: 'Diario Uno ER' },
    { domain: 'analisisdigital.com.ar', name: 'Análisis Digital' },
    { domain: 'diarioelargentino.com.ar', name: 'El Argentino' },
    { domain: 'diarioriouruguay.com.ar', name: 'Diario Río Uruguay' },
    { domain: 'entreriosahora.com', name: 'Entre Ríos Ahora' },
  ],
  'Formosa': [
    { domain: 'diariolamanana.com.ar', name: 'La Mañana' },
    { domain: 'elcomercial.com.ar', name: 'El Comercial' },
    { domain: 'formosadiario.com.ar', name: 'Formosa Diario' },
    { domain: 'noticiasformosa.com.ar', name: 'Noticias Formosa' },
    { domain: 'formosaya.com.ar', name: 'Formosa Ya' },
  ],
  'Jujuy': [
    { domain: 'eltribuno.com', name: 'El Tribuno Jujuy' },
    { domain: 'somosjujuy.com.ar', name: 'Somos Jujuy' },
    { domain: 'jujuyaldia.com.ar', name: 'Jujuy al Día' },
    { domain: 'todojujuy.com', name: 'Todo Jujuy' },
    { domain: 'pregon.com.ar', name: 'Pregón' },
    { domain: 'jujuyonline.com.ar', name: 'Jujuy Online' },
    { domain: 'notinor.com', name: 'Notinor' },
  ],
  'La Pampa': [
    { domain: 'diariotextual.com', name: 'Diario Textual' },
    { domain: 'laarena.com.ar', name: 'La Arena' },
    { domain: 'eldiariodelapampa.com.ar', name: 'El Diario de La Pampa' },
    { domain: 'planbnoticias.com.ar', name: 'Plan B Noticias' },
    { domain: 'infopico.com', name: 'InfoPico' },
  ],
  'La Rioja': [
    { domain: 'elindependiente.com.ar', name: 'El Independiente' },
    { domain: 'nuevarioja.com.ar', name: 'Nueva Rioja' },
    { domain: 'riojavirtual.com.ar', name: 'Rioja Virtual' },
    { domain: 'datarioja.com.ar', name: 'Data Rioja' },
  ],
  'Mendoza': [
    { domain: 'losandes.com.ar', name: 'Los Andes' },
    { domain: 'diariouno.com.ar', name: 'Diario Uno' },
    { domain: 'mdzol.com', name: 'MDZ Online' },
    { domain: 'elsol.com.ar', name: 'El Sol' },
    { domain: 'sitioandino.com.ar', name: 'Sitio Andino' },
    { domain: 'mendozapost.com', name: 'Mendoza Post' },
    { domain: 'diariosanrafael.com.ar', name: 'San Rafael Diario' },
    { domain: 'mendozatoday.com.ar', name: 'Mendoza Today' },
  ],
  'Misiones': [
    { domain: 'elterritorio.com.ar', name: 'El Territorio' },
    { domain: 'misionesonline.net', name: 'Misiones Online' },
    { domain: 'primeraedicion.com.ar', name: 'Primera Edición' },
    { domain: 'lavozdemisiones.com', name: 'La Voz de Misiones' },
    { domain: 'enfoquemisiones.com', name: 'Enfoque Misiones' },
    { domain: 'canal12misiones.com', name: 'Canal 12' },
  ],
  'Neuquén': [
    { domain: 'lmneuquen.com', name: 'LM Neuquén' },
    { domain: 'rionegro.com.ar', name: 'Diario Río Negro' },
    { domain: 'mejorinformado.com', name: 'Mejor Informado' },
    { domain: 'neuquenalinstante.com.ar', name: 'Neuquén Al Instante' },
    { domain: 'minutoneuquen.com', name: 'Minuto Neuquén' },
    { domain: 'sanmartinadiario.com.ar', name: 'SMA Diario' },
  ],
  'Río Negro': [
    { domain: 'rionegro.com.ar', name: 'Diario Río Negro' },
    { domain: 'elcordillerano.com.ar', name: 'El Cordillerano' },
    { domain: 'bariloche2000.com', name: 'Bariloche 2000' },
    { domain: 'anbariloche.com.ar', name: 'ANB' },
    { domain: 'noticiasnet.com.ar', name: 'Noticias Net' },
    { domain: 'todoroca.com', name: 'Todo Roca' },
  ],
  'Salta': [
    { domain: 'eltribuno.com', name: 'El Tribuno Salta' },
    { domain: 'informatesalta.com.ar', name: 'Informate Salta' },
    { domain: 'quepasasalta.com.ar', name: 'Qué Pasa Salta' },
    { domain: 'nuevodiariodesalta.com.ar', name: 'Nuevo Diario' },
    { domain: 'cuartopodersalta.com.ar', name: 'Cuarto Poder' },
    { domain: 'vocescriticas.com', name: 'Voces Críticas' },
  ],
  'San Juan': [
    { domain: 'diariodecuyo.com.ar', name: 'Diario de Cuyo' },
    { domain: 'sanjuan8.com', name: 'San Juan 8' },
    { domain: 'tiempodesanjuan.com', name: 'Tiempo de SJ' },
    { domain: 'diariohuarpe.com', name: 'Diario Huarpe' },
    { domain: 'canal13sanjuan.com', name: 'Canal 13 SJ' },
  ],
  'San Luis': [
    { domain: 'eldiariodelarepublica.com', name: 'El Diario de la República' },
    { domain: 'sanluis24.com.ar', name: 'San Luis 24' },
    { domain: 'agenciasanluis.com', name: 'Agencia SL' },
    { domain: 'elchorillero.com', name: 'El Chorillero' },
    { domain: 'infomerlo.com', name: 'InfoMerlo' },
  ],
  'Santa Cruz': [
    { domain: 'laopinionaustral.com.ar', name: 'La Opinión Austral' },
    { domain: 'tiemposur.com.ar', name: 'Tiempo Sur' },
    { domain: 'opisantacruz.com.ar', name: 'OPI Santa Cruz' },
    { domain: 'eldiarionuevodia.com.ar', name: 'Nuevo Día' },
    { domain: 'ahoracalafate.com.ar', name: 'Ahora Calafate' },
  ],
  'Santa Fe': [
    { domain: 'lacapital.com.ar', name: 'La Capital' },
    { domain: 'ellitoral.com', name: 'El Litoral' },
    { domain: 'rosario3.com', name: 'Rosario3' },
    { domain: 'unosantafe.com.ar', name: 'Uno Santa Fe' },
    { domain: 'rafaelanoticias.com', name: 'Rafaela Noticias' },
    { domain: 'diariocastellanos.com.ar', name: 'Diario Castellanos' },
    { domain: 'reconquistahoy.com', name: 'Reconquista Hoy' },
    { domain: 'sinmordaza.com', name: 'Sin Mordaza' },
    { domain: 'rosarioplus.com', name: 'Rosario Plus' },
  ],
  'Santiago del Estero': [
    { domain: 'elliberal.com.ar', name: 'El Liberal' },
    { domain: 'diariopanorama.com', name: 'Diario Panorama' },
    { domain: 'nuevodiarioweb.com.ar', name: 'Nuevo Diario Web' },
    { domain: 'santiagodiapordia.com.ar', name: 'Santiago Día por Día' },
  ],
  'Tierra del Fuego': [
    { domain: 'eldiariodelfindelmundo.com', name: 'El Diario del Fin del Mundo' },
    { domain: 'surenio.com.ar', name: 'Sureño' },
    { domain: 'actualidadtdf.com.ar', name: 'Actualidad TDF' },
    { domain: 'criticasur.com.ar', name: 'Crítica Sur' },
    { domain: 'ushuaia24.com.ar', name: 'Ushuaia 24' },
    { domain: 'delfuegonoticias.com.ar', name: 'Del Fuego Noticias' },
    { domain: 'provincia23.com.ar', name: 'Provincia 23' },
    { domain: 'tdfaldia.com.ar', name: 'TDF al Día' },
  ],
  'Tucumán': [
    { domain: 'lagaceta.com.ar', name: 'La Gaceta' },
    { domain: 'contextotucuman.com', name: 'Contexto Tucumán' },
    { domain: 'tucumanalas7.com.ar', name: 'Tucumán a las 7' },
    { domain: 'eltucumano.com', name: 'El Tucumano' },
    { domain: 'primerafuente.com.ar', name: 'Primera Fuente' },
    { domain: 'losprimeros.tv', name: 'Los Primeros' },
    { domain: 'tucumannoticias.com.ar', name: 'Tucumán Noticias' },
    { domain: 'bajolalupa.com.ar', name: 'Bajo la Lupa' },
    { domain: 'lv12.com.ar', name: 'LV12' },
  ],
};

// Portales nacionales que siempre se incluyen
const NATIONAL_PORTALS = [
  { domain: 'infobae.com', name: 'Infobae' },
  { domain: 'clarin.com', name: 'Clarín' },
  { domain: 'lanacion.com.ar', name: 'La Nación' },
  { domain: 'pagina12.com.ar', name: 'Página/12' },
  { domain: 'perfil.com', name: 'Perfil' },
  { domain: 'ambito.com', name: 'Ámbito' },
  { domain: 'tn.com.ar', name: 'TN' },
  { domain: 'c5n.com', name: 'C5N' },
  { domain: 'cronista.com', name: 'El Cronista' },
];

function getPortalsByProvince(provincia) {
  if (!provincia) return NATIONAL_PORTALS;

  const p = provincia.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  for (const [key, portals] of Object.entries(NEWS_PORTALS)) {
    const normKey = key.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (p.includes(normKey) || normKey.includes(p)) {
      return [...portals, ...NATIONAL_PORTALS];
    }
  }

  return NATIONAL_PORTALS;
}

function getDomainsByProvince(provincia) {
  return getPortalsByProvince(provincia).map(p => p.domain);
}

module.exports = { NEWS_PORTALS, NATIONAL_PORTALS, getPortalsByProvince, getDomainsByProvince };
