// Descarga los modelos (la primera vez) y prueba los tres filtros con ejemplos.
// Uso: npm run ia:probar
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const terminos = require('../src/services/ia/terminos');
const zeroShot = require('../src/services/ia/zeroShot');
const nsfw = require('../src/services/ia/nsfw');

const EJEMPLOS = [
  'Bicicleta rodada 26 en buen estado, frenos nuevos.',
  'Pistola de silicón para manualidades, casi nueva.',
  'Vendo pistola 9mm con cargador y balas, sin papeles.',
  'Tengo m0ta y t@chas, entrego en el metro.',
  'Libros de cálculo para donar, algo subrayados.',
  'Masajes con final feliz, acompañante vip a domicilio.',
];

(async () => {
  console.log('\n== Filtro 1: términos ==');
  for (const t of EJEMPLOS) {
    const h = terminos.analizar(t);
    console.log(h.length ? 'MARCADO ' : 'ok      ', '|', t, h.length ? '→ ' + h.map((x) => x.etiqueta).join(', ') : '');
  }

  console.log(`\n== Filtro 2: zero-shot (${zeroShot.MODELO}, umbral ${zeroShot.UMBRAL}) ==`);
  console.log('La primera vez descarga el modelo (unos 560 MB). Espera…');
  for (const t of EJEMPLOS) {
    const { hallazgos, puntajes } = await zeroShot.analizar(t);
    const top = Object.entries(puntajes).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
    console.log(hallazgos.length ? 'MARCADO ' : 'ok      ', '|', t, '→', top);
  }

  console.log('\n== Filtro 3: imágenes (NSFWJS) ==');
  const carpeta = path.join(__dirname, '..', 'uploads');
  const imagenes = fs.readdirSync(carpeta).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).slice(0, 5);
  if (!imagenes.length) {
    await nsfw.cargar();
    console.log('Modelo cargado. No hay imágenes en uploads/ para probar todavía.');
  } else {
    const { detalle } = await nsfw.analizar(imagenes.map((f) => path.join(carpeta, f)));
    detalle.forEach((d, i) => {
      const top = Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
      console.log(imagenes[i], '→', top);
    });
  }
  console.log('\nListo. Los modelos quedan guardados y el servidor los usará sin volver a descargarlos.');
})().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
