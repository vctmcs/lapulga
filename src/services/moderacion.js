// Punto único de moderación de publicaciones.
// Entrega 1: no analiza nada y deja pasar todo.
// Entrega 2: aquí se conectan los tres filtros (términos prohibidos, Transformers.js zero-shot y NSFWJS).

/**
 * @param {{ titulo: string, descripcion: string, imagenes: string[] }} publicacion
 * @returns {Promise<{ marcada: boolean, hallazgos: Array<{ filtro: string, etiqueta: string, puntaje: number }> }>}
 */
async function analizarPublicacion(publicacion) { // eslint-disable-line no-unused-vars
  return { marcada: false, hallazgos: [] };
}

module.exports = { analizarPublicacion };
