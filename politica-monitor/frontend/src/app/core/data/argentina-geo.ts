// Provincias y ciudades principales de Argentina, para orientar geográficamente
// una campaña. La zona elegida define las búsquedas por provincia/ciudad, los
// aliases de zona y los portales locales que consulta el scraper, y el filtro
// `location` del actor de Facebook.
//
// No pretende ser un padrón completo: son las ciudades con prensa local propia,
// que es lo que el scraper puede aprovechar. El backend acepta cualquier
// string, así que sumar entradas acá alcanza.
export const ARGENTINA_GEO: Record<string, string[]> = {
  'Buenos Aires': ['La Plata', 'Mar del Plata', 'Bahía Blanca', 'Quilmes', 'Lanús', 'Lomas de Zamora'],
  'CABA': ['Ciudad Autónoma de Buenos Aires'],
  'Catamarca': ['San Fernando del Valle de Catamarca', 'Andalgalá'],
  'Chaco': ['Resistencia', 'Presidencia Roque Sáenz Peña', 'Villa Ángela'],
  'Chubut': ['Rawson', 'Comodoro Rivadavia', 'Trelew', 'Puerto Madryn'],
  'Corrientes': ['Corrientes Capital', 'Goya', 'Paso de los Libres'],
  'Córdoba': ['Córdoba Capital', 'Villa Carlos Paz', 'Río Cuarto', 'San Francisco', 'Villa María'],
  'Entre Ríos': ['Paraná', 'Concordia', 'Gualeguaychú', 'Concepción del Uruguay'],
  'Formosa': ['Formosa Capital', 'Clorinda', 'Pirané'],
  'Jujuy': ['San Salvador de Jujuy', 'Palpalá', 'San Pedro de Jujuy'],
  'La Pampa': ['Santa Rosa', 'General Pico', 'Toay'],
  'La Rioja': ['La Rioja Capital', 'Chilecito'],
  'Mendoza': ['Mendoza Capital', 'Godoy Cruz', 'San Rafael', 'Maipú', 'Luján de Cuyo'],
  'Misiones': ['Posadas', 'Oberá', 'Eldorado', 'Puerto Iguazú'],
  'Neuquén': ['Neuquén Capital', 'Cutral Co', 'Plaza Huincul', 'Zapala'],
  'Río Negro': ['Viedma', 'Bariloche', 'General Roca', 'Cipolletti'],
  'Salta': ['Salta Capital', 'Orán', 'Tartagal', 'San Ramón de la Nueva Orán'],
  'San Juan': ['San Juan Capital', 'Rivadavia', 'Chimbas', 'Rawson'],
  'San Luis': ['San Luis Capital', 'Villa Mercedes', 'Merlo'],
  'Santa Cruz': ['Río Gallegos', 'Caleta Olivia', 'El Calafate', 'Pico Truncado'],
  'Santa Fe': ['Rosario', 'Santa Fe Capital', 'Rafaela', 'Venado Tuerto', 'Villa Gobernador Gálvez'],
  'Santiago del Estero': ['Santiago del Estero Capital', 'La Banda', 'Termas de Río Hondo'],
  'Tierra del Fuego': ['Río Grande', 'Ushuaia', 'Tolhuin'],
  'Tucumán': ['San Miguel de Tucumán', 'Yerba Buena', 'Tafí Viejo', 'Banda del Río Salí'],
};

export const PROVINCIAS = Object.keys(ARGENTINA_GEO);

export function ciudadesDe(provincia: string): string[] {
  return ARGENTINA_GEO[provincia] ?? [];
}
