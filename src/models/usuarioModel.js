const db = require('../config/db');

const CAMPOS_PUBLICOS = 'id, nombre, email, telefono, whatsapp, rol, strikes, bloqueado, puede_publicar, creado_en';

module.exports = {
  async porEmail(email) {
    const { rows } = await db.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase()]);
    return rows[0] || null;
  },

  async porId(id) {
    const { rows } = await db.query(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async conHash(id) {
    const { rows } = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async crear({ nombre, email, passwordHash, telefono, whatsapp, rol }) {
    const { rows } = await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash, telefono, whatsapp, rol)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${CAMPOS_PUBLICOS}`,
      [nombre, email.toLowerCase(), passwordHash, telefono || null, whatsapp || null, rol]
    );
    return rows[0];
  },

  async actualizarPerfil(id, { nombre, telefono, whatsapp }) {
    const { rows } = await db.query(
      `UPDATE usuarios SET nombre = $2, telefono = $3, whatsapp = $4
       WHERE id = $1 RETURNING ${CAMPOS_PUBLICOS}`,
      [id, nombre, telefono || null, whatsapp || null]
    );
    return rows[0];
  },

  async cambiarPassword(id, passwordHash) {
    await db.query('UPDATE usuarios SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
  },

  async cambiarRol(id, rol) {
    const { rows } = await db.query(
      `UPDATE usuarios SET rol = $2 WHERE id = $1 RETURNING ${CAMPOS_PUBLICOS}`,
      [id, rol]
    );
    return rows[0];
  },

  // Datos visibles en el perfil público (sin email ni teléfonos)
  async perfilPublico(id) {
    const { rows } = await db.query(
      `SELECT u.id, u.nombre, u.rol, u.creado_en, u.bloqueado,
              COUNT(p.id) FILTER (WHERE p.estado = 'publicada')::int AS activas,
              COUNT(p.id) FILTER (WHERE p.estado = 'publicada' AND p.es_donacion)::int AS donaciones
         FROM usuarios u
         LEFT JOIN publicaciones p ON p.usuario_id = u.id
        WHERE u.id = $1
        GROUP BY u.id`,
      [id]
    );
    return rows[0] || null;
  },
};
