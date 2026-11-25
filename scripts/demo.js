// Carga datos de prueba: usuarios, publicaciones con fotos dibujadas, consultas de contacto,
// reseñas y algunos casos para la cola de moderación.
// Uso:  npm run db:demo            (agrega los datos si no existen)
//       npm run db:demo -- --reset (borra los datos de prueba y los vuelve a crear)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const { pool } = require('../src/config/db');

const DOMINIO = '@demo.lapulga.mx';
const PASSWORD = 'demo1234';
const UPLOADS = path.join(__dirname, '..', 'uploads');

const USUARIOS = [
  { clave: 'lucia', nombre: 'Lucía Hernández', rol: 'vendedor', tel: '5523456781' },
  { clave: 'jorge', nombre: 'Jorge Ramírez', rol: 'vendedor', tel: '5534567812' },
  { clave: 'marisol', nombre: 'Marisol Pérez', rol: 'vendedor', tel: '5545678123' },
  { clave: 'daniel', nombre: 'Daniel Ortiz', rol: 'comprador', tel: '5556781234' },
  { clave: 'karla', nombre: 'Karla Mendoza', rol: 'comprador', tel: null },
  { clave: 'beto', nombre: 'Roberto Silva', rol: 'vendedor', tel: '5567812345', strikes: 1 },
];

// [vendedor, categoría, título, descripción, precio, dibujo, color, díasAtrás, estado]
const PUBLICACIONES = [
  ['lucia', 'deportes', 'Bicicleta de montaña rodada 26', 'Bicicleta de montaña con 21 velocidades, frenos de disco delanteros y llantas nuevas. Tiene detalles de pintura en el cuadro. Entrego en Ciudad Nezahualcóyotl.', 2200, 'bici', '#3b6ea5', 1],
  ['lucia', 'hogar', 'Sala de tres piezas color gris', 'Sala de tres piezas (3-2-1) tapizada en tela gris, sin manchas ni rasgaduras. Se entrega desarmada; el comprador pone el flete.', 4500, 'sofa', '#8a8f98', 3],
  ['lucia', 'ropa', 'Ropa de bebé niña 0 a 6 meses', 'Paquete con 15 prendas: mamelucos, pantalones y cobijita. Todo lavado y en buen estado. Las regalo a quien las necesite.', 0, 'ropa', '#e6a5b8', 2],
  ['lucia', 'libros', 'Libros de cálculo diferencial e integral', 'Tres libros de cálculo (Stewart, Larson y Purcell) para universidad. Algo subrayados con lápiz. Los dono a algún estudiante.', 0, 'libros', '#c0703a', 5],
  ['jorge', 'herramientas', 'Taladro inalámbrico 20 V con dos baterías', 'Taladro atornillador inalámbrico de 20 V, incluye dos baterías, cargador y estuche. Funciona perfecto, poco uso.', 1100, 'taladro', '#d8a31a', 1],
  ['jorge', 'electronica', 'Monitor de 24 pulgadas Full HD', 'Monitor de 24" 1080p con entrada HDMI y VGA. Sin pixeles muertos. Incluye cable de corriente y HDMI.', 1600, 'monitor', '#2f3640', 4],
  ['jorge', 'electronica', 'Bocina bluetooth portátil', 'Bocina bluetooth con batería de unas 8 horas. Suena bien, el botón de volumen está un poco duro.', 350, 'bocina', '#1f5f8b', 9],
  ['jorge', 'vehiculos', 'Casco de motociclista talla M', 'Casco cerrado talla M con visor transparente. Nunca ha tenido golpes. Incluye bolsa para guardarlo.', 650, 'casco', '#b33a3a', 6, 'vendida'],
  ['marisol', 'juguetes', 'Juguetes de bloques para armar', 'Caja con más de 300 bloques de construcción de varios colores. Completa y limpia. Ideal para niños de 4 años en adelante.', 280, 'bloques', '#4c9a4c', 2],
  ['marisol', 'hogar', 'Lámpara de pie con pantalla de tela', 'Lámpara de pie de 1.60 m con pantalla de tela beige. Usa foco E27 (no incluido).', 300, 'lampara', '#c9b27c', 7],
  ['marisol', 'mascotas', 'Transportadora para perro mediano', 'Transportadora de plástico para perro o gato mediano, con puerta metálica. La regalo, ya no la usamos.', 0, 'caja', '#6d8a96', 3],
  ['marisol', 'otros', 'Guitarra acústica para principiante', 'Guitarra acústica de tamaño estándar con funda. Le cambié las cuerdas hace un mes. Ideal para empezar a aprender.', 900, 'guitarra', '#8b5a2b', 12],
  ['beto', 'deportes', 'Balón de futbol número 5', 'Balón de futbol número 5, cosido, bien inflado. Se usó una temporada.', 150, 'balon', '#ffffff', 2],
  ['beto', 'hogar', 'Silla de madera de pino', 'Silla de madera de pino, firme, solo necesita barniz. Tengo dos iguales; precio por pieza.', 250, 'silla', '#a0743c', 8],
  ['beto', 'ropa', 'Chamarra de mezclilla talla grande', 'Chamarra de mezclilla talla G, sin roturas. Se la regalo a quien le sirva para el frío.', 0, 'ropa', '#4a6fa5', 1],
];

// Casos que llegan a la cola de moderación
const SOSPECHOSAS = [
  ['beto', 'otros', 'Vendo gallo de mota', 'Gallo de mota y unas t@chas de la buena, entrego en el metro.', 200, 'caja', '#7a7a7a', 0,
    [['terminos', 'drogas: mota', 1], ['terminos', 'drogas: gallo de mota', 1], ['terminos', 'drogas: tachas', 1]]],
];

// ---------- Dibujos sencillos para las fotos ----------
const DIBUJOS = {
  bici: '<circle cx="270" cy="370" r="95" fill="none" stroke="#222" stroke-width="16"/><circle cx="530" cy="370" r="95" fill="none" stroke="#222" stroke-width="16"/><path d="M270 370 L360 230 L500 230 L530 370 M360 230 L410 370 L500 230 M340 205 L390 205 M490 230 L470 190 L520 185" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>',
  sofa: '<rect x="170" y="210" width="460" height="120" rx="20" fill="#fff"/><rect x="130" y="260" width="80" height="140" rx="18" fill="#eee"/><rect x="590" y="260" width="80" height="140" rx="18" fill="#eee"/><rect x="190" y="320" width="420" height="80" rx="12" fill="#ddd"/><rect x="170" y="400" width="20" height="40" fill="#333"/><rect x="610" y="400" width="20" height="40" fill="#333"/>',
  ropa: '<path d="M300 170 L250 190 L170 260 L215 320 L260 290 L260 450 L540 450 L540 290 L585 320 L630 260 L550 190 L500 170 Q400 230 300 170 Z" fill="#fff" stroke="#333" stroke-width="6"/>',
  libros: '<rect x="230" y="380" width="340" height="60" fill="#fff" stroke="#333" stroke-width="5"/><rect x="250" y="320" width="300" height="60" fill="#f1e4c8" stroke="#333" stroke-width="5"/><rect x="220" y="260" width="330" height="60" fill="#fff" stroke="#333" stroke-width="5"/><rect x="270" y="200" width="280" height="60" fill="#e8d0a0" stroke="#333" stroke-width="5"/>',
  taladro: '<rect x="220" y="200" width="300" height="110" rx="30" fill="#222"/><rect x="520" y="235" width="110" height="40" fill="#888"/><rect x="630" y="248" width="60" height="14" fill="#555"/><rect x="300" y="300" width="90" height="130" rx="10" fill="#333"/><rect x="270" y="420" width="160" height="60" rx="12" fill="#111"/>',
  monitor: '<rect x="170" y="150" width="460" height="280" rx="10" fill="#111" stroke="#bbb" stroke-width="6"/><rect x="190" y="170" width="420" height="240" fill="#3a6ea5"/><rect x="380" y="430" width="40" height="50" fill="#bbb"/><rect x="310" y="475" width="180" height="18" rx="6" fill="#bbb"/>',
  bocina: '<rect x="290" y="160" width="220" height="320" rx="40" fill="#222"/><circle cx="400" cy="380" r="70" fill="#444" stroke="#999" stroke-width="8"/><circle cx="400" cy="240" r="35" fill="#444" stroke="#999" stroke-width="6"/>',
  casco: '<path d="M240 380 Q240 180 420 180 Q580 180 580 360 L580 410 L260 410 Z" fill="#fff" stroke="#222" stroke-width="8"/><path d="M380 270 L580 270 L580 360 L400 360 Z" fill="#9ec5e6" stroke="#222" stroke-width="6"/>',
  bloques: '<rect x="220" y="320" width="120" height="100" fill="#e74c3c" stroke="#222" stroke-width="5"/><rect x="340" y="320" width="120" height="100" fill="#3498db" stroke="#222" stroke-width="5"/><rect x="460" y="320" width="120" height="100" fill="#f1c40f" stroke="#222" stroke-width="5"/><rect x="280" y="220" width="120" height="100" fill="#fff" stroke="#222" stroke-width="5"/><rect x="400" y="220" width="120" height="100" fill="#e67e22" stroke="#222" stroke-width="5"/><rect x="340" y="120" width="120" height="100" fill="#9b59b6" stroke="#222" stroke-width="5"/>',
  lampara: '<path d="M310 150 L490 150 L540 260 L260 260 Z" fill="#fff6dc" stroke="#333" stroke-width="6"/><rect x="392" y="260" width="16" height="200" fill="#333"/><rect x="330" y="455" width="140" height="20" rx="8" fill="#333"/>',
  caja: '<rect x="230" y="200" width="340" height="240" rx="18" fill="#eee" stroke="#333" stroke-width="7"/><rect x="290" y="250" width="140" height="140" fill="none" stroke="#333" stroke-width="6"/><path d="M310 250 V390 M340 250 V390 M370 250 V390 M400 250 V390" stroke="#333" stroke-width="4"/>',
  guitarra: '<circle cx="340" cy="380" r="95" fill="#d9a35b" stroke="#222" stroke-width="6"/><circle cx="420" cy="290" r="75" fill="#d9a35b" stroke="#222" stroke-width="6"/><circle cx="370" cy="345" r="26" fill="#222"/><rect x="430" y="140" width="26" height="170" fill="#4a2f15" transform="rotate(35 443 225)"/>',
  balon: '<circle cx="400" cy="300" r="150" fill="#fff" stroke="#222" stroke-width="8"/><polygon points="400,240 448,275 430,330 370,330 352,275" fill="#222"/><path d="M400 240 L400 160 M448 275 L530 250 M430 330 L480 400 M370 330 L320 400 M352 275 L270 250" stroke="#222" stroke-width="6"/>',
  silla: '<rect x="320" y="140" width="22" height="330" fill="#5c3b1a"/><rect x="458" y="140" width="22" height="330" fill="#5c3b1a"/><rect x="320" y="160" width="160" height="22" fill="#7a5124"/><rect x="320" y="215" width="160" height="22" fill="#7a5124"/><rect x="290" y="300" width="220" height="34" fill="#8b5e2b"/><rect x="290" y="334" width="20" height="140" fill="#5c3b1a"/>',
};

async function foto(dibujo, color, titulo) {
  const texto = titulo.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).slice(0, 38);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="${color}"/>
    <rect x="0" y="520" width="800" height="80" fill="rgba(0,0,0,0.55)"/>
    ${DIBUJOS[dibujo] || DIBUJOS.caja}
    <text x="400" y="572" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#fff" text-anchor="middle">${texto}</text>
  </svg>`;
  const nombre = `demo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(path.join(UPLOADS, nombre));
  return nombre;
}

async function borrarDemo(db) {
  const { rows } = await db.query(
    `SELECT i.ruta FROM imagenes i JOIN publicaciones p ON p.id = i.publicacion_id
       JOIN usuarios u ON u.id = p.usuario_id WHERE u.email LIKE $1`,
    ['%' + DOMINIO]
  );
  rows.forEach((r) => fs.rmSync(path.join(UPLOADS, r.ruta), { force: true }));
  const del = await db.query('DELETE FROM usuarios WHERE email LIKE $1', ['%' + DOMINIO]);
  console.log(`Datos de prueba anteriores borrados (${del.rowCount} usuarios, ${rows.length} fotos).`);
}

async function main() {
  const db = await pool.connect();
  try {
    if (process.argv.includes('--reset')) await borrarDemo(db);

    const ya = await db.query('SELECT 1 FROM usuarios WHERE email LIKE $1 LIMIT 1', ['%' + DOMINIO]);
    if (ya.rowCount) {
      console.log('Los datos de prueba ya existen. Usa "npm run db:demo -- --reset" para volver a crearlos.');
      return;
    }

    const cats = Object.fromEntries((await db.query('SELECT slug, id FROM categorias')).rows.map((r) => [r.slug, r.id]));
    const hash = await bcrypt.hash(PASSWORD, 10);
    const ids = {};
    const dias = (n) => `NOW() - INTERVAL '${Number(n)} days' - INTERVAL '${Math.floor(Math.random() * 600)} minutes'`;

    for (const u of USUARIOS) {
      const { rows } = await db.query(
        `INSERT INTO usuarios (nombre, email, password_hash, telefono, whatsapp, rol, strikes, creado_en)
         VALUES ($1, $2, $3, $4, $4, $5, $6, NOW() - INTERVAL '40 days') RETURNING id`,
        [u.nombre, u.clave + DOMINIO, hash, u.tel, u.rol, u.strikes || 0]
      );
      ids[u.clave] = rows[0].id;
    }
    console.log(`Usuarios: ${USUARIOS.length} (contraseña de todos: ${PASSWORD})`);

    const pubs = {};
    for (const [vend, cat, titulo, desc, precio, dibujo, color, d, estado = 'publicada'] of PUBLICACIONES) {
      const { rows } = await db.query(
        `INSERT INTO publicaciones (usuario_id, categoria_id, titulo, descripcion, precio, estado, creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, ${dias(d)}, NOW()) RETURNING id`,
        [ids[vend], cats[cat], titulo, desc, precio, estado]
      );
      pubs[titulo] = { id: rows[0].id, vend };
      await db.query('INSERT INTO imagenes (publicacion_id, ruta, orden) VALUES ($1, $2, 0)', [rows[0].id, await foto(dibujo, color, titulo)]);
    }

    for (const [vend, cat, titulo, desc, precio, dibujo, color, d, hallazgos] of SOSPECHOSAS) {
      const { rows } = await db.query(
        `INSERT INTO publicaciones (usuario_id, categoria_id, titulo, descripcion, precio, estado, creado_en)
         VALUES ($1, $2, $3, $4, $5, 'en_revision', ${dias(d)}) RETURNING id`,
        [ids[vend], cats[cat], titulo, desc, precio]
      );
      await db.query('INSERT INTO imagenes (publicacion_id, ruta, orden) VALUES ($1, $2, 0)', [rows[0].id, await foto(dibujo, color, titulo)]);
      for (const [filtro, etiqueta, puntaje] of hallazgos) {
        await db.query('INSERT INTO reportes_ia (publicacion_id, filtro, etiqueta, puntaje) VALUES ($1, $2, $3, $4)', [rows[0].id, filtro, etiqueta, puntaje]);
      }
      await db.query('UPDATE usuarios SET puede_publicar = FALSE WHERE id = $1', [ids[vend]]);
    }
    console.log(`Publicaciones: ${PUBLICACIONES.length} + ${SOSPECHOSAS.length} en revisión`);

    // Consultas de contacto: [quién consulta, publicación, días atrás]
    const CONSULTAS = [
      ['daniel', 'Bicicleta de montaña rodada 26', 1], ['daniel', 'Taladro inalámbrico 20 V con dos baterías', 1],
      ['daniel', 'Casco de motociclista talla M', 5], ['karla', 'Ropa de bebé niña 0 a 6 meses', 1],
      ['karla', 'Juguetes de bloques para armar', 2], ['karla', 'Sala de tres piezas color gris', 2],
      ['jorge', 'Libros de cálculo diferencial e integral', 4], ['lucia', 'Guitarra acústica para principiante', 6],
      ['marisol', 'Monitor de 24 pulgadas Full HD', 3], ['daniel', 'Guitarra acústica para principiante', 10],
    ];
    for (const [quien, titulo, d] of CONSULTAS) {
      await db.query(`INSERT INTO vistas_contacto (publicacion_id, usuario_id, fecha) VALUES ($1, $2, ${dias(d)})`, [pubs[titulo].id, ids[quien]]);
    }
    console.log(`Consultas de contacto: ${CONSULTAS.length}`);

    // Reseñas: [autor, receptor, publicación, rol del receptor, estrellas, comentario, días atrás]
    const RESENAS = [
      ['daniel', 'jorge', 'Casco de motociclista talla M', 'vendedor', 5, 'Muy puntual y el casco estaba tal como en la foto. Recomendado.', 4],
      ['jorge', 'daniel', 'Casco de motociclista talla M', 'comprador', 5, 'Llegó a la hora acordada y pagó sin regatear.', 4],
      ['lucia', 'marisol', 'Guitarra acústica para principiante', 'vendedor', 4, 'Buena guitarra, solo tardó un poco en contestar.', 5],
      ['daniel', 'marisol', 'Guitarra acústica para principiante', 'vendedor', 5, 'Amable y me explicó cómo afinarla.', 9],
      ['marisol', 'jorge', 'Monitor de 24 pulgadas Full HD', 'vendedor', 3, 'El monitor funciona, pero no traía el cable HDMI que decía.', 2],
      ['jorge', 'lucia', 'Libros de cálculo diferencial e integral', 'vendedor', 5, 'Me regaló los libros y además me dio unos apuntes. Muchas gracias.', 3],
    ];
    for (const [a, r, titulo, rol, cal, com, d] of RESENAS) {
      await db.query(
        `INSERT INTO resenas (autor_id, receptor_id, publicacion_id, rol_receptor, calificacion, comentario, estado, fecha)
         VALUES ($1, $2, $3, $4, $5, $6, 'visible', ${dias(d)})`,
        [ids[a], ids[r], pubs[titulo].id, rol, cal, com]
      );
    }
    // Una reseña reportada por el usuario para probar la cola
    const { rows: rr } = await db.query(`SELECT id FROM resenas WHERE autor_id = $1 AND receptor_id = $2`, [ids.marisol, ids.jorge]);
    await db.query(
      `INSERT INTO reportes_resenas (resena_id, filtro, etiqueta, puntaje, reportado_por, motivo) VALUES ($1, 'usuario', 'falsa', 1, $2, 'Sí le di el cable, está en las fotos.')`,
      [rr[0].id, ids.jorge]
    );
    // Un reporte de usuario sobre una publicación visible
    await db.query(
      `INSERT INTO reportes_ia (publicacion_id, filtro, etiqueta, puntaje, reportado_por, motivo) VALUES ($1, 'usuario', 'fraude', 1, $2, 'El precio se me hace muy bajo para una sala.')`,
      [pubs['Sala de tres piezas color gris'].id, ids.karla]
    );
    console.log(`Reseñas: ${RESENAS.length}. Casos en la cola de moderación: 3`);

    console.log('\nListo. Cuentas de prueba (contraseña ' + PASSWORD + '):');
    USUARIOS.forEach((u) => console.log(`  ${(u.clave + DOMINIO).padEnd(28)} ${u.rol}`));
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error en db:demo →', err.message);
  process.exit(1);
});
