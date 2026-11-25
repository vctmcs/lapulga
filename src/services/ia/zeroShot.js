// Filtro 2: clasificación de texto zero-shot con Transformers.js, en el servidor y sin API externa.
// El modelo se descarga una sola vez de Hugging Face a la carpeta .modelos/ del proyecto.
const path = require('path');

const MODELO = process.env.MODELO_ZERO_SHOT || 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7';
// fp16: la versión cuantizada (q8) de mDeBERTa pierde casi toda su precisión, por eso no se usa
const DTYPE = process.env.MODELO_DTYPE || 'fp16';
const UMBRAL = Number(process.env.UMBRAL_TEXTO || 0.97);
const PLANTILLA = 'Este anuncio trata sobre {}.';

// clave interna → frase que el modelo compara con el anuncio
const ETIQUETAS = {
  armas: 'la venta de armas o municiones',
  drogas: 'la venta de drogas o sustancias ilegales',
  servicios_sexuales: 'ofrecer servicios sexuales',
  trata_de_personas: 'la venta de personas o bebés',
  otros_ilicitos: 'la venta de artículos robados',
  normal: 'la venta o donación de un artículo usado común',
};
const PROHIBIDAS = Object.keys(ETIQUETAS).filter((k) => k !== 'normal');

let cargando = null;

function cargar() {
  if (!cargando) {
    cargando = (async () => {
      const { pipeline, env } = require('@huggingface/transformers');
      env.cacheDir = path.join(__dirname, '..', '..', '..', '.modelos');
      const t0 = Date.now();
      const clasificador = await pipeline('zero-shot-classification', MODELO, { dtype: DTYPE });
      console.log(`[IA] Modelo de texto listo (${MODELO}, ${DTYPE}) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      return clasificador;
    })().catch((err) => {
      cargando = null; // permite reintentar en la siguiente publicación
      throw err;
    });
  }
  return cargando;
}

/**
 * @param {string} texto
 * @returns {Promise<{ hallazgos: Array<{filtro:string, etiqueta:string, puntaje:number}>, puntajes: Record<string, number> }>}
 */
async function analizar(texto) {
  const clasificador = await cargar();
  const frases = Object.values(ETIQUETAS);
  const salida = await clasificador(String(texto).slice(0, 1200), frases, {
    hypothesis_template: PLANTILLA,
    multi_label: true, // cada etiqueta se evalúa por separado (0 a 1)
  });

  const puntajes = {};
  salida.labels.forEach((frase, i) => {
    const clave = Object.keys(ETIQUETAS).find((k) => ETIQUETAS[k] === frase);
    puntajes[clave] = salida.scores[i];
  });

  // Se marca solo si una categoría prohibida supera el umbral y además le gana a "artículo común"
  const hallazgos = PROHIBIDAS.filter((k) => puntajes[k] >= UMBRAL && puntajes[k] > puntajes.normal).map((k) => ({
    filtro: 'texto_zero_shot',
    etiqueta: k,
    puntaje: Number(puntajes[k].toFixed(4)),
  }));

  return { hallazgos, puntajes };
}

module.exports = { analizar, cargar, MODELO, UMBRAL };
