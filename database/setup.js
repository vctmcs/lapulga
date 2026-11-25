// Crea la base de datos (si no existe), aplica el esquema y siembra datos iniciales.
// Uso: npm run db:setup
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const base = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
};
const dbName = process.env.PGDATABASE || 'lapulga';

const CATEGORIAS = [
  ['Electrónica', 'electronica'],
  ['Hogar y muebles', 'hogar'],
  ['Ropa y calzado', 'ropa'],
  ['Libros y papelería', 'libros'],
  ['Juguetes y bebés', 'juguetes'],
  ['Deportes', 'deportes'],
  ['Herramientas', 'herramientas'],
  ['Vehículos y refacciones', 'vehiculos'],
  ['Mascotas', 'mascotas'],
  ['Otros', 'otros'],
];

async function crearBaseSiFalta() {
  const admin = new Client({ ...base, database: 'postgres' });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (rowCount === 0) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(dbName)) throw new Error('PGDATABASE solo admite letras, números y guion bajo');
    await admin.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8'`);
    console.log(`Base de datos "${dbName}" creada.`);
  } else {
    console.log(`Base de datos "${dbName}" ya existía.`);
  }
  await admin.end();
}

async function main() {
  await crearBaseSiFalta();

  const db = new Client({ ...base, database: dbName });
  await db.connect();

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schema);
  console.log('Esquema aplicado.');

  for (const [nombre, slug] of CATEGORIAS) {
    await db.query(
      'INSERT INTO categorias (nombre, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING',
      [nombre, slug]
    );
  }
  console.log(`Categorías listas (${CATEGORIAS.length}).`);

  const email = (process.env.ADMIN_EMAIL || 'admin@lapulga.local').toLowerCase();
  const existe = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existe.rowCount === 0) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin123!', 10);
    await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, 'admin')`,
      [process.env.ADMIN_NOMBRE || 'Administrador', email, hash]
    );
    console.log(`Administrador creado: ${email}`);
  } else {
    console.log(`Administrador ya existía: ${email}`);
  }

  await db.end();
  console.log('Listo.');
}

main().catch((err) => {
  console.error('Error en db:setup →', err.message);
  process.exit(1);
});
