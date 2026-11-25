const db = require('../config/db');

module.exports = {
  async todas() {
    const { rows } = await db.query(
      `SELECT c.id, c.nombre, c.slug,
              COUNT(p.id) FILTER (WHERE p.estado = 'publicada')::int AS total
         FROM categorias c
         LEFT JOIN publicaciones p ON p.categoria_id = c.id
        GROUP BY c.id
        ORDER BY c.id`
    );
    return rows;
  },

  async porSlug(slug) {
    const { rows } = await db.query('SELECT * FROM categorias WHERE slug = $1', [slug]);
    return rows[0] || null;
  },

  async existe(id) {
    const { rowCount } = await db.query('SELECT 1 FROM categorias WHERE id = $1', [id]);
    return rowCount > 0;
  },
};
