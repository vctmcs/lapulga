require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const { pool } = require('./src/config/db');
const flash = require('./src/middleware/flash');
const { cargarUsuario } = require('./src/middleware/auth');
const formato = require('./src/utils/formato');
const rutas = require('./src/routes');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const produccion = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
if (produccion) app.set('trust proxy', 1);

// Valores por defecto para las vistas (también sirven a la página de error)
app.use((req, res, next) => {
  res.locals.f = formato;
  res.locals.ruta = req.path;
  res.locals.query = req.query;
  res.locals.usuario = null;
  res.locals.flash = [];
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: produccion ? '7d' : 0 }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '30d' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

app.use(
  session({
    name: 'lapulga.sid',
    store: new PgSession({ pool, tableName: 'sesiones', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'solo-para-desarrollo',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax', // bloquea POST desde otros sitios
      secure: produccion,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(flash);
app.use(cargarUsuario);

app.use(rutas);

app.use((req, res) => {
  res.status(404).render('error', { titulo: 'No encontrado', codigo: 404, mensaje: 'La página que buscas no existe.' });
});

// Express 5 envía aquí también los errores de funciones async
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  if (res.headersSent) return;
  const status = err.status || 500;
  if (req.accepts(['html', 'json']) === 'json') return res.status(status).json({ error: 'Error del servidor.' });
  res.status(status).render('error', {
    titulo: 'Error',
    codigo: status,
    mensaje: produccion ? 'Algo salió mal. Intenta de nuevo en un momento.' : err.message,
  });
});

// Antes de abrir el puerto se comprueba la base de datos, para no servir páginas con error 500
async function comprobarBaseDeDatos() {
  try {
    await pool.query('SELECT 1 FROM usuarios LIMIT 1');
  } catch (err) {
    const causas = {
      '28P01': 'La contraseña de PostgreSQL es incorrecta. Revisa PGUSER y PGPASSWORD en el archivo .env.',
      '3D000': `La base de datos "${process.env.PGDATABASE || 'lapulga'}" no existe. Ejecuta: npm run db:setup`,
      '42P01': 'Faltan las tablas. Ejecuta: npm run db:setup',
      ECONNREFUSED: 'PostgreSQL no responde. Verifica que el servicio esté iniciado y que PGHOST/PGPORT sean correctos.',
    };
    console.error('\nNo se pudo conectar a la base de datos.');
    console.error('→ ' + (causas[err.code] || err.message) + '\n');
    process.exit(1);
  }
}

comprobarBaseDeDatos().then(() => {
  app.listen(PORT, () => console.log(`La Pulga corriendo en http://localhost:${PORT}`));
  require('./src/services/moderacion').precargar(); // carga los modelos de IA en segundo plano
});
