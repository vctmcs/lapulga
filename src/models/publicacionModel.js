const db = require('../config/db');

const POR_PAGINA = 12;

// Subconsulta de la portada (primera imagen) reutilizada en los listados
const PORTADA = `(SELECT i.ruta FROM imagenes i WHERE i.publicacion_id = p.id ORDER BY i.orden, i.id LIMIT 1) AS portada`;

module.exports = {
  POR_PAGINA,

  // Listado público: solo publicadas y de usuarios no bloqueados
  async listarPublicas({ q, categoria, donacion, orden, pagina = 1 }) {
    const where = [`p.estado = 'publicada'`, 'u.bloqueado = FALSE'];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      where.push(`(p.titulo ILIKE $${params.length} OR p.descripcion ILIKE $${params.length})`);
    }
    if (categoria) {
      params.push(categoria);
      where.push(`c.slug = $${params.length}`);
    }
    if (donacion === 'si') where.push('p.es_donacion = TRUE');
    if (donacion === 'no') where.push('p.es_donacion = FALSE');

    const ordenes = {
      recientes: 'p.creado_en DESC',
      precio_asc: 'p.precio ASC, p.creado_en DESC',
      precio_desc: 'p.precio DESC, p.creado_en DESC',
    };
    const orderBy = ordenes[orden] || ordenes.recientes;

    const filtro = `FROM publicaciones p
                    JOIN usuarios u ON u.id = p.usuario_id
                    LEFT JOIN categorias c ON c.id = p.categoria_id
                   WHERE ${where.join(' AND ')}`;

    const total = (await db.query(`SELECT COUNT(*)::int AS n ${filtro}`, params)).rows[0].n;

    const offset = (Math.max(1, pagina) - 1) * POR_PAGINA;
    const { rows } = await db.query(
      `SELECT p.id, p.titulo, p.precio, p.es_donacion, p.creado_en,
              c.nombre AS categoria, c.slug AS categoria_slug,
              u.id AS usuario_id, u.nombre AS vendedor, ${PORTADA}
         ${filtro}
        ORDER BY ${orderBy}
        LIMIT ${POR_PAGINA} OFFSET ${offset}`,
      params
    );
    return { items: rows, total, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
  },

  async porId(id) {
    const { rows } = await db.query(
      `SELECT p.*, c.nombre AS categoria, c.slug AS categoria_slug,
              u.nombre AS vendedor, u.creado_en AS vendedor_desde, u.bloqueado AS vendedor_bloqueado
         FROM publicaciones p
         JOIN usuarios u ON u.id = p.usuario_id
         LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async delUsuario(usuarioId, { soloPublicadas = false } = {}) {
    const cond = soloPublicadas ? `AND p.estado = 'publicada'` : `AND p.estado <> 'eliminada'`;
    const { rows } = await db.query(
      `SELECT p.id, p.titulo, p.precio, p.es_donacion, p.estado, p.creado_en, p.actualizado_en,
              c.nombre AS categoria, ${PORTADA},
              (SELECT COUNT(*)::int FROM vistas_contacto v WHERE v.publicacion_id = p.id) AS consultas
         FROM publicaciones p
         LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.usuario_id = $1 ${cond}
        ORDER BY p.creado_en DESC`,
      [usuarioId]
    );
    return rows;
  },

  async crear({ usuarioId, categoriaId, titulo, descripcion, precio, estado = 'publicada' }) {
    const { rows } = await db.query(
      `INSERT INTO publicaciones (usuario_id, categoria_id, titulo, descripcion, precio, estado)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [usuarioId, categoriaId, titulo, descripcion, precio, estado]
    );
    return rows[0];
  },

  async actualizar(id, { categoriaId, titulo, descripcion, precio }) {
    const { rows } = await db.query(
      `UPDATE publicaciones
          SET categoria_id = $2, titulo = $3, descripcion = $4, precio = $5, actualizado_en = NOW()
        WHERE id = $1 RETURNING *`,
      [id, categoriaId, titulo, descripcion, precio]
    );
    return rows[0];
  },

  async cambiarEstado(id, estado) {
    await db.query('UPDATE publicaciones SET estado = $2, actualizado_en = NOW() WHERE id = $1', [id, estado]);
  },

  // ---- Imágenes ----
  async imagenes(publicacionId) {
    const { rows } = await db.query(
      'SELECT id, ruta, orden FROM imagenes WHERE publicacion_id = $1 ORDER BY orden, id',
      [publicacionId]
    );
    return rows;
  },

  async agregarImagenes(publicacionId, rutas) {
    if (!rutas.length) return;
    const { rows } = await db.query(
      'SELECT COALESCE(MAX(orden), -1)::int AS m FROM imagenes WHERE publicacion_id = $1',
      [publicacionId]
    );
    let orden = rows[0].m + 1;
    for (const ruta of rutas) {
      await db.query('INSERT INTO imagenes (publicacion_id, ruta, orden) VALUES ($1, $2, $3)', [
        publicacionId,
        ruta,
        orden++,
      ]);
    }
  },

  // Borra solo las imágenes indicadas que pertenezcan a la publicación; devuelve sus rutas
  async borrarImagenes(publicacionId, ids) {
    if (!ids.length) return [];
    const { rows } = await db.query(
      'DELETE FROM imagenes WHERE publicacion_id = $1 AND id = ANY($2::int[]) RETURNING ruta',
      [publicacionId, ids]
    );
    return rows.map((r) => r.ruta);
  },

  async contarImagenes(publicacionId) {
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM imagenes WHERE publicacion_id = $1', [
      publicacionId,
    ]);
    return rows[0].n;
  },

  // ---- Contacto ----
  async registrarVistaContacto(publicacionId, usuarioId) {
    await db.query('INSERT INTO vistas_contacto (publicacion_id, usuario_id) VALUES ($1, $2)', [
      publicacionId,
      usuarioId,
    ]);
  },

  async contactoDelVendedor(publicacionId) {
    const { rows } = await db.query(
      `SELECT u.nombre, u.telefono, u.whatsapp
         FROM publicaciones p JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.id = $1`,
      [publicacionId]
    );
    return rows[0] || null;
  },

  // Quién consultó el contacto de una publicación (lo ve solo su dueño)
  async consultas(publicacionId, duenoId) {
    const { rows } = await db.query(
      `SELECT u.id, u.nombre, COUNT(*)::int AS veces, MIN(v.fecha) AS primera, MAX(v.fecha) AS ultima,
              EXISTS (SELECT 1 FROM resenas r WHERE r.autor_id = $2 AND r.receptor_id = u.id AND r.publicacion_id = $1) AS resenado
         FROM vistas_contacto v JOIN usuarios u ON u.id = v.usuario_id
        WHERE v.publicacion_id = $1
        GROUP BY u.id
        ORDER BY MAX(v.fecha) DESC`,
      [publicacionId, duenoId]
    );
    return rows;
  },

  async yaConsulto(publicacionId, usuarioId) {
    const { rowCount } = await db.query(
      'SELECT 1 FROM vistas_contacto WHERE publicacion_id = $1 AND usuario_id = $2 LIMIT 1',
      [publicacionId, usuarioId]
    );
    return rowCount > 0;
  },
};
