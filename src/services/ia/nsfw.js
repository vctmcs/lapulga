// Filtro 3: contenido explícito en imágenes con NSFWJS.
// Usa @tensorflow/tfjs (JavaScript puro, sin compilar nada) y sharp para leer JPG/PNG/WEBP.
// El modelo MobileNetV2 viene incluido en el paquete nsfwjs: no se descarga nada.

const UMBRAL_EXPLICITO = Number(process.env.UMBRAL_NSFW || 0.7); // Porn + Hentai
const UMBRAL_SUGERENTE = Number(process.env.UMBRAL_SEXY || 0.9); // Sexy

let cargando = null;
let tf = null;
let sharp = null;

function cargar() {
  if (!cargando) {
    cargando = (async () => {
      tf = require('@tensorflow/tfjs');
      sharp = require('sharp');
      const nsfwjs = require('nsfwjs');
      tf.enableProdMode();
      const t0 = Date.now();
      const modelo = await nsfwjs.load('MobileNetV2');
      console.log(`[IA] Modelo de imágenes listo (NSFWJS MobileNetV2) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      return modelo;
    })().catch((err) => {
      cargando = null;
      throw err;
    });
  }
  return cargando;
}

async function clasificarArchivo(modelo, ruta) {
  const { data, info } = await sharp(ruta)
    .rotate()
    .resize(224, 224, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
  try {
    const predicciones = await modelo.classify(tensor, 5);
    return Object.fromEntries(predicciones.map((p) => [p.className, p.probability]));
  } finally {
    tensor.dispose();
  }
}

/**
 * @param {string[]} rutas rutas absolutas de las imágenes
 */
async function analizar(rutas) {
  const modelo = await cargar();
  const hallazgos = [];
  const detalle = [];

  for (const ruta of rutas) {
    const p = await clasificarArchivo(modelo, ruta);
    detalle.push(p);
    const explicito = (p.Porn || 0) + (p.Hentai || 0);
    const archivo = require('path').basename(ruta);
    if (explicito >= UMBRAL_EXPLICITO) {
      hallazgos.push({ filtro: 'imagen_nsfw', etiqueta: `explícito (${archivo})`, puntaje: Number(explicito.toFixed(4)) });
    } else if ((p.Sexy || 0) >= UMBRAL_SUGERENTE) {
      hallazgos.push({ filtro: 'imagen_nsfw', etiqueta: `sugerente (${archivo})`, puntaje: Number(p.Sexy.toFixed(4)) });
    }
  }
  return { hallazgos, detalle };
}

module.exports = { analizar, cargar };
