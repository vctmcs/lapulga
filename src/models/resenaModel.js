const db = require('../config/db');

const DIAS_EDICION = 7;

async function enTransaccion(fn) {
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

// Pares (receptor, publicación) que un usuario puede reseñar:
//  - como comprador: dueños de publicaciones cuyo contacto consultó  → rol_receptor = 'vendedor'
//  - como vendedor: usuarios que consultaron el contacto de sus publicaciones → rol_receptor = 'comprador'
const SQL_PARES = `
  SELECT p.id AS publicacion_id, p.titulo, p.usuario_id AS receptor_id, 'vendedor' AS rol_receptor, MAX(v.fecha) AS consulta
    FROM vistas_contacto v JOIN publicaciones p ON p.id = v.publicacion_id
   WHERE v.usuario_id = $1 AND p.usuario_id <> $1
   GROUP BY p.id
  UNION ALL
  SELECT p.id, p.titulo, v.usuario_id, 'comprador', MAX(v.fecha)
    FROM vistas_contacto v JOIN publicaciones p ON p.id = v.publicacion_id
   WHERE p.usuario_id = $1 AND v.usuario_id <> $1
   GROUP BY p.id, v.usuario_id`;

module.exports = {
  DIAS_EDICION,

  editable(r) {
    return r.estado !== 'eliminada' && Date.now() - new Date(r.fecha).getTime() < DIAS_EDICION * 86400000;
  },

  async oportunidades(usuarioId) {
    const { rows } = await db.query(
      `SELECT x.*, u.nombre AS receptor, u.bloqueado,
              r.id AS resena_id, r.calificacion, r.estado AS resena_estado, r.fecha AS resena_fecha
         FROM (${SQL_PARES}) x
         JOIN usuarios u ON u.id = x.receptor_id
         LEFT JOIN resenas r ON r.autor_id = $1 AND r.receptor_id = x.receptor_id AND r.publicacion_id = x.publicacion_id
        ORDER BY (r.id IS NULL) DESC, x.consulta DESC`,
      [usuarioId]
    );
    return rows;
  },

  async pendientesDe(usuarioId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM (${SQL_PARES}) x
        WHERE NOT EXISTS (SELECT 1 FROM resenas r WHERE r.autor_id = $1 AND r.receptor_id = x.receptor_id AND r.publicacion_id = x.publicacion_id)`,
      [usuarioId]
    );
    return rows[0].n;
  },

  // Devuelve el rol del receptor si el autor puede reseñarlo por esa publicación; null si no
  async elegibilidad(autorId, receptorId, publicacionId) {
    if (autorId === receptorId) return null;
    const { rows } = await db.query(
      `SELECT rol_receptor FROM (${SQL_PARES}) x WHERE x.receptor_id = $2 AND x.publicacion_id = $3 LIMIT 1`,
      [autorId, receptorId, publicacionId]
    );
    return rows[0] ? rows[0].rol_receptor : null;
  },

  async porId(id) {
    const { rows } = await db.query(
      `SELECT r.*, a.nombre AS autor, d.nombre AS receptor, p.titulo
         FROM resenas r
         JOIN usuarios a ON a.id = r.autor_id
         JOIN usuarios d ON d.id = r.receptor_id
         JOIN publicaciones p ON p.id = r.publicacion_id
        WHERE r.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async existente(autorId, receptorId, publicacionId) {
    const { rows } = await db.query(
      'SELECT id FROM resenas WHERE autor_id = $1 AND receptor_id = $2 AND publicacion_id = $3',
      [autorId, receptorId, publicacionId]
    );
    return rows[0] ? rows[0].id : null;
  },

  // Crea o actualiza la reseña y, si el filtro de texto la marcó, la deja en revisión con sus hallazgos
  async guardar({ id, autorId, receptorId, publicacionId, rolReceptor, calificacion, comentario }, hallazgos) {
    return enTransaccion(async (c) => {
      const estado = hallazgos.length ? 'en_revision' : 'visible';
      let resenaId = id;
      if (id) {
        await c.query(
          `UPDATE resenas SET calificacion = $2, comentario = $3, estado = $4, editada_en = NOW() WHERE id = $1`,
          [id, calificacion, comentario || null, estado]
        );
        // Los hallazgos viejos sin decidir ya no aplican al texto nuevo
        await c.query(`DELETE FROM reportes_resenas WHERE resena_id = $1 AND decision_admin IS NULL AND filtro <> 'usuario'`, [id]);
      } else {
        const { rows } = await c.query(
          `INSERT INTO resenas (autor_id, receptor_id, publicacion_id, rol_receptor, calificacion, comentario, estado)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [autorId, receptorId, publicacionId, rolReceptor, calificacion, comentario || null, estado]
        );
        resenaId = rows[0].id;
      }
      for (const h of hallazgos) {
        await c.query(
          'INSERT INTO reportes_resenas (resena_id, filtro, etiqueta, puntaje) VALUES ($1, $2, $3, $4)',
          [resenaId, h.filtro, h.etiqueta.slice(0, 80), h.puntaje]
        );
      }
      return { id: resenaId, estado };
    });
  },

  async delReceptor(receptorId) {
    const { rows } = await db.query(
      `SELECT r.id, r.calificacion, r.comentario, r.rol_receptor, r.fecha, r.editada_en,
              a.id AS autor_id, a.nombre AS autor, p.id AS publicacion_id, p.titulo
         FROM resenas r
         JOIN usuarios a ON a.id = r.autor_id
         JOIN publicaciones p ON p.id = r.publicacion_id
        WHERE r.receptor_id = $1 AND r.estado = 'visible' AND a.bloqueado = FALSE
        ORDER BY r.fecha DESC`,
      [receptorId]
    );
    return rows;
  },

  async delAutor(autorId) {
    const { rows } = await db.query(
      `SELECT r.*, d.nombre AS receptor, p.titulo
         FROM resenas r JOIN usuarios d ON d.id = r.receptor_id JOIN publicaciones p ON p.id = r.publicacion_id
        WHERE r.autor_id = $1 ORDER BY r.fecha DESC`,
      [autorId]
    );
    return rows;
  },

  // Promedio y número de reseñas visibles, separados por rol
  async promedios(receptorId) {
    const { rows } = await db.query(
      `SELECT r.rol_receptor, ROUND(AVG(r.calificacion), 1)::float AS promedio, COUNT(*)::int AS total
         FROM resenas r JOIN usuarios a ON a.id = r.autor_id
        WHERE r.receptor_id = $1 AND r.estado = 'visible' AND a.bloqueado = FALSE
        GROUP BY r.rol_receptor`,
      [receptorId]
    );
    const vacio = { promedio: null, total: 0 };
    return {
      vendedor: rows.find((r) => r.rol_receptor === 'vendedor') || vacio,
      comprador: rows.find((r) => r.rol_receptor === 'comprador') || vacio,
    };
  },

  // ---------- Moderación ----------
  async reportarPorUsuario(resenaId, usuarioId, motivo) {
    const { rowCount } = await db.query(
      'SELECT 1 FROM reportes_resenas WHERE resena_id = $1 AND reportado_por = $2 AND decision_admin IS NULL',
      [resenaId, usuarioId]
    );
    if (rowCount) return false;
    await db.query(
      `INSERT INTO reportes_resenas (resena_id, filtro, etiqueta, puntaje, reportado_por, motivo)
       VALUES ($1, 'usuario', $2, 1, $3, $4)`,
      [resenaId, motivo.etiqueta, usuarioId, motivo.texto || null]
    );
    return true;
  },

  async cola() {
    const { rows } = await db.query(
      `SELECT r.id, r.calificacion, r.comentario, r.estado, r.rol_receptor, r.fecha,
              a.id AS autor_id, a.nombre AS autor, a.strikes, d.id AS receptor_id, d.nombre AS receptor,
              p.id AS publicacion_id, p.titulo,
              json_agg(json_build_object('filtro', x.filtro, 'etiqueta', x.etiqueta, 'puntaje', x.puntaje,
                       'motivo', x.motivo, 'por', ru.nombre) ORDER BY x.fecha) AS reportes
         FROM reportes_resenas x
         JOIN resenas r ON r.id = x.resena_id
         JOIN usuarios a ON a.id = r.autor_id
         JOIN usuarios d ON d.id = r.receptor_id
         JOIN publicaciones p ON p.id = r.publicacion_id
         LEFT JOIN usuarios ru ON ru.id = x.reportado_por
        WHERE x.decision_admin IS NULL AND r.estado <> 'eliminada'
        GROUP BY r.id, a.id, d.id, p.id
        ORDER BY (r.estado = 'en_revision') DESC, MIN(x.fecha)`
    );
    return rows;
  },

  async pendientes() {
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT x.resena_id)::int AS n FROM reportes_resenas x JOIN resenas r ON r.id = x.resena_id
        WHERE x.decision_admin IS NULL AND r.estado <> 'eliminada'`
    );
    return rows[0].n;
  },

  // confirmada → la reseña se elimina y su autor recibe un strike; descartada → la reseña queda visible
  async decidir(resenaId, adminId, decision) {
    return enTransaccion(async (c) => {
      const { rows } = await c.query('SELECT id, autor_id FROM resenas WHERE id = $1 FOR UPDATE', [resenaId]);
      if (!rows[0]) return null;
      const upd = await c.query(
        `UPDATE reportes_resenas SET decision_admin = $2, admin_id = $3, fecha_decision = NOW()
          WHERE resena_id = $1 AND decision_admin IS NULL`,
        [resenaId, decision, adminId]
      );
      if (!upd.rowCount) return null;
      if (decision === 'confirmada') {
        await c.query(`UPDATE resenas SET estado = 'eliminada' WHERE id = $1`, [resenaId]);
        return (
          await c.query(
            `UPDATE usuarios SET strikes = strikes + 1, bloqueado = (strikes + 1 >= 3)
              WHERE id = $1 RETURNING nombre, strikes, bloqueado`,
            [rows[0].autor_id]
          )
        ).rows[0];
      }
      await c.query(`UPDATE resenas SET estado = 'visible' WHERE id = $1`, [resenaId]);
      return (await c.query('SELECT nombre, strikes, bloqueado FROM usuarios WHERE id = $1', [rows[0].autor_id])).rows[0];
    });
  },

  async metricas() {
    const { rows } = await db.query(
      `SELECT filtro,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE decision_admin = 'confirmada')::int AS confirmadas,
              COUNT(*) FILTER (WHERE decision_admin = 'descartada')::int AS descartadas,
              COUNT(*) FILTER (WHERE decision_admin IS NULL)::int AS pendientes
         FROM reportes_resenas GROUP BY filtro`
    );
    return rows;
  },
};
