// Punto único de moderación: aplica los tres filtros y decide si la publicación va a revisión.
// La IA nunca bloquea por sí sola: solo marca. La decisión final la toma el administrador.
const path = require('path');
const terminos = require('./ia/terminos');
const zeroShot = require('./ia/zeroShot');
const nsfw = require('./ia/nsfw');

const CARPETA_UPLOADS = path.join(__dirname, '..', '..', 'uploads');
const activo = (variable) => process.env[variable] !== '0';

/**
 * Analiza solo texto (también lo usarán las reseñas en la Entrega 3).
 */
async function analizarTexto(texto) {
  const hallazgos = [...terminos.analizar(texto)];
  const errores = [];
  if (activo('IA_TEXTO')) {
    try {
      hallazgos.push(...(await zeroShot.analizar(texto)).hallazgos);
    } catch (err) {
      errores.push(`texto: ${err.message}`);
      console.warn('[IA] El filtro de texto no se pudo ejecutar:', err.message);
    }
  }
  return { hallazgos, errores };
}

/**
 * @param {{ titulo: string, descripcion: string, imagenes: string[] }} publicacion  imagenes = nombres de archivo en /uploads
 * @returns {Promise<{ marcada: boolean, hallazgos: Array<{filtro:string, etiqueta:string, puntaje:number}>, errores: string[] }>}
 */
async function analizarPublicacion({ titulo, descripcion, imagenes = [] }) {
  const t0 = Date.now();
  const { hallazgos, errores } = await analizarTexto(`${titulo}. ${descripcion}`);

  if (activo('IA_IMAGEN') && imagenes.length) {
    try {
      const rutas = imagenes.map((n) => path.join(CARPETA_UPLOADS, path.basename(n)));
      hallazgos.push(...(await nsfw.analizar(rutas)).hallazgos);
    } catch (err) {
      errores.push(`imagen: ${err.message}`);
      console.warn('[IA] El filtro de imágenes no se pudo ejecutar:', err.message);
    }
  }

  const marcada = hallazgos.length > 0;
  console.log(`[IA] "${titulo.slice(0, 40)}" → ${marcada ? 'MARCADA' : 'ok'} (${hallazgos.length} hallazgos, ${Date.now() - t0} ms)`);
  return { marcada, hallazgos, errores };
}

// Carga los modelos al iniciar el servidor para que la primera publicación no tarde tanto
function precargar() {
  if (activo('IA_TEXTO')) zeroShot.cargar().catch((e) => console.warn('[IA] No se cargó el modelo de texto:', e.message));
  if (activo('IA_IMAGEN')) nsfw.cargar().catch((e) => console.warn('[IA] No se cargó el modelo de imágenes:', e.message));
}

module.exports = { analizarPublicacion, analizarTexto, precargar };
