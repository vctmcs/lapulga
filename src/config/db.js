const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'lapulga',
  max: 10,
});

pool.on('error', (err) => console.error('PostgreSQL:', err.message));

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
