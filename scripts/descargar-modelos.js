// Descarga los modelos candidatos para el filtro de texto en .modelos/
// Uso: node scripts/descargar-modelos.js
const path = require('path');
const { pipeline, env } = require('@huggingface/transformers');
env.cacheDir = path.join(__dirname, '..', '.modelos');

const CANDIDATOS = [
  ['Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7', 'fp16'],
  ['onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX', 'q8'],
  ['onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX', 'fp32'],
];

(async () => {
  for (const [modelo, dtype] of CANDIDATOS) {
    process.stdout.write(`Descargando ${modelo} (${dtype})... `);
    try {
      const t0 = Date.now();
      const c = await pipeline('zero-shot-classification', modelo, { dtype });
      await c('prueba', ['a', 'b']);
      console.log(`listo en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } catch (e) {
      console.log('FALLÓ: ' + e.message);
    }
  }
  console.log('\nTerminado. Avísale a Claude para que compare los modelos.');
})();
