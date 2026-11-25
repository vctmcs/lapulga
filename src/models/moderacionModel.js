const db = require('../config/db');

const FILTROS_IA = ['terminos', 'texto_zero_shot', 'imagen_nsfw'];

// Recalcula si el usuario puede publicar: solo si no tiene publicaciones ocultas en revisión
async function recalcularPermiso(cliente, usuarioId) {
  await cliente.query(
    `UPDATE usuarios SET puede_publicar = NOT EXISTS (
       SELECT 1 FROM publicaciones WHERE usuario_id = $1 AND estado = 'en_revision')
     WHERE id = $1`,
    [usuarioId]
  );
}

async function enTransaccion(fn) {
  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = {
  FILTROS_IA,

  // La IA marcó la publicación: se guardan los hallazgos, se oculta y se suspende el permiso de publicar
  async marcarPorIA(publicacionId, usuarioId, hallazgos) {
    return enTransaccion(async (c) => {
      for (const h of hallazgos) {
        await c.query(
          'INSERT INTO reportes_ia (publicacion_id, filtro, etiqueta, puntaje) VALUES ($1, $2, $3, $4)',
          [publicacionId, h.filtro, h.etiqueta.slice(0, 80), h.puntaje]
        );
      }
      await c.query(`UPDATE publicaciones SET estado = 'en_revision', actualizado_en = NOW() WHERE id = $1`, [publicacionId]);
      await recalcularPermiso(c, usuarioId);
    });
  },

  // Un usuario reporta una publicación visible (no se oculta; solo entra a la cola)
  async reportarPorUsuario(publicacionId, usuarioId, motivo) {
    const { rowCount } = await db.query(
      `SELECT 1 FROM reportes_ia WHERE publicacion_id = $1 AND reportado_por = $2 AND decision_admin IS NULL`,
      [publicacionId, usuarioId]
    );
    if (rowCount) return false;
    await db.query(
      `INSERT INTO reportes_ia (publicacion_id, filtro, etiqueta, puntaje, reportado_por, motivo)
       VALUES ($1, 'usuario', $2, 1, $3, $4)`,
      [publicacionId, motivo.etiqueta, usuarioId, motivo.texto || null]
    );
    return true;
  },

  // El administrador oculta algo que la IA dejó pasar (sirve para medir falsos negativos)
  async ocultarPorAdmin(publicacionId, adminId, motivo) {
    return enTransaccion(async (c) => {
      const { rows } = await c.query('SELECT usuario_id FROM publicaciones WHERE id = $1', [publicacionId]);
      if (!rows[0]) return;
      await c.query(
        `INSERT INTO reportes_ia (publicacion_id, filtro, etiqueta, puntaje, reportado_por, motivo)
         VALUES ($1, 'manual', 'ocultada por admin', 1, $2, $3)`,
        [publicacionId, adminId, motivo || null]
      );
      await c.query(`UPDATE publicaciones SET estado = 'en_revision', actualizado_en = NOW() WHERE id = $1`, [publicacionId]);
      await recalcularPermiso(c, rows[0].usuario_id);
    });
  },

  // Cola de revisión: publicaciones con reportes sin decidir
  async cola() {
    const { rows } = await db.query(
      `SELECT p.id, p.titulo, p.descripcion, p.precio, p.es_donacion, p.estado, p.creado_en,
              u.id AS usuario_id, u.nombre AS usuario, u.email, u.strikes,
              (SELECT json_agg(json_build_object('id', i.id, 'ruta', i.ruta) ORDER BY i.orden, i.id)
                 FROM imagenes i WHERE i.publicacion_id = p.id) AS imagenes,
              json_agg(json_build_object('filtro', r.filtro, 'etiqueta', r.etiqueta, 'puntaje', r.puntaje,
                       'motivo', r.motivo, 'fecha', r.fecha, 'por', ru.nombre) ORDER BY r.fecha) AS reportes,
              MIN(r.fecha) AS primer_reporte
         FROM reportes_ia r
         JOIN publicaciones p ON p.id = r.publicacion_id
         JOIN usuarios u ON u.id = p.usuario_id
         LEFT JOIN usuarios ru ON ru.id = r.reportado_por
        WHERE r.decision_admin IS NULL AND p.estado <> 'eliminada'
        GROUP BY p.id, u.id
        ORDER BY (p.estado = 'en_revision') DESC, MIN(r.fecha)`
    );
    return rows.map((r) => ({ ...r, imagenes: r.imagenes || [] }));
  },

  async pendientes() {
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT publicacion_id)::int AS n FROM reportes_ia WHERE decision_admin IS NULL`
    );
    return rows[0].n;
  },

  /**
   * confirmada → publicación rechazada + 1 strike (3 = bloqueo)
   * descartada → la publicación vuelve a estar publicada y se restablece el permiso de publicar
   */
  async decidir(publicacionId, adminId, decision) {
    return enTransaccion(async (c) => {
      const { rows } = await c.query('SELECT id, usuario_id, estado FROM publicaciones WHERE id = $1 FOR UPDATE', [publicacionId]);
      const pub = rows[0];
      if (!pub) return null;

      const upd = await c.query(
        `UPDATE reportes_ia SET decision_admin = $2, admin_id = $3, fecha_decision = NOW()
          WHERE publicacion_id = $1 AND decision_admin IS NULL`,
        [publicacionId, decision, adminId]
      );
      if (upd.rowCount === 0) return null;

      let usuario;
      if (decision === 'confirmada') {
        await c.query(`UPDATE publicaciones SET estado = 'rechazada', actualizado_en = NOW() WHERE id = $1`, [pub.id]);
        usuario = (
          await c.query(
            `UPDATE usuarios SET strikes = strikes + 1, bloqueado = (strikes + 1 >= 3)
              WHERE id = $1 RETURNING nombre, strikes, bloqueado`,
            [pub.usuario_id]
          )
        ).rows[0];
      } else {
        if (pub.estado === 'en_revision') {
          await c.query(`UPDATE publicaciones SET estado = 'publicada', actualizado_en = NOW() WHERE id = $1`, [pub.id]);
        }
        usuario = (await c.query('SELECT nombre, strikes, bloqueado FROM usuarios WHERE id = $1', [pub.usuario_id])).rows[0];
      }
      await recalcularPermiso(c, pub.usuario_id);
      return usuario;
    });
  },

  async historial(limite = 100) {
    const { rows } = await db.query(
      `SELECT p.id, p.titulo, u.nombre AS usuario, r.decision_admin, r.fecha_decision, a.nombre AS admin,
              string_agg(DISTINCT r.filtro, ', ') AS filtros,
              string_agg(r.etiqueta, ' · ' ORDER BY r.id) AS etiquetas
         FROM reportes_ia r
         JOIN publicaciones p ON p.id = r.publicacion_id
         JOIN usuarios u ON u.id = p.usuario_id
         LEFT JOIN usuarios a ON a.id = r.admin_id
        WHERE r.decision_admin IS NOT NULL
        GROUP BY p.id, u.nombre, r.decision_admin, r.fecha_decision, a.nombre
        ORDER BY r.fecha_decision DESC
        LIMIT $1`,
      [limite]
    );
    return rows;
  },

  // Precisión de la IA a partir de las decisiones del administrador
  async metricas() {
    const porFiltro = (
      await db.query(
        `SELECT filtro,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE decision_admin = 'confirmada')::int AS confirmadas,
                COUNT(*) FILTER (WHERE decision_admin = 'descartada')::int AS descartadas,
                COUNT(*) FILTER (WHERE decision_admin IS NULL)::int AS pendientes
           FROM reportes_ia GROUP BY filtro`
      )
    ).rows;

    // Un "caso" es una publicación revisada en una decisión concreta
    const casos = (
      await db.query(
        `WITH casos AS (
           SELECT publicacion_id, fecha_decision, decision_admin,
                  bool_or(filtro = ANY($1::text[])) AS por_ia
             FROM reportes_ia WHERE decision_admin IS NOT NULL
            GROUP BY publicacion_id, fecha_decision, decision_admin)
         SELECT COUNT(*) FILTER (WHERE por_ia AND decision_admin = 'confirmada')::int AS vp,
                COUNT(*) FILTER (WHERE por_ia AND decision_admin = 'descartada')::int AS fp,
                COUNT(*) FILTER (WHERE NOT por_ia AND decision_admin = 'confirmada')::int AS fn,
                COUNT(*) FILTER (WHERE NOT por_ia AND decision_admin = 'descartada')::int AS reportes_infundados
           FROM casos`,
        [FILTROS_IA]
      )
    ).rows[0];

    const usuarios = (
      await db.query(
        `SELECT COUNT(*) FILTER (WHERE bloqueado)::int AS bloqueados,
                COUNT(*) FILTER (WHERE strikes > 0 AND NOT bloqueado)::int AS con_strikes,
                COUNT(*) FILTER (WHERE NOT puede_publicar)::int AS sin_permiso
           FROM usuarios WHERE rol <> 'admin'`
      )
    ).rows[0];

    const div = (a, b) => (b ? a / b : null);
    return {
      porFiltro,
      casos,
      precision: div(casos.vp, casos.vp + casos.fp),
      exhaustividad: div(casos.vp, casos.vp + casos.fn),
      usuarios,
    };
  },

  async usuarios() {
    const { rows } = await db.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.strikes, u.bloqueado, u.puede_publicar, u.creado_en,
              COUNT(p.id) FILTER (WHERE p.estado = 'publicada')::int AS activas,
              COUNT(p.id) FILTER (WHERE p.estado = 'rechazada')::int AS rechazadas
         FROM usuarios u LEFT JOIN publicaciones p ON p.usuario_id = u.id
        WHERE u.rol <> 'admin'
        GROUP BY u.id
        ORDER BY u.bloqueado DESC, u.strikes DESC, u.creado_en DESC`
    );
    return rows;
  },

  async desbloquear(usuarioId) {
    await db.query(`UPDATE usuarios SET bloqueado = FALSE, strikes = 0 WHERE id = $1 AND rol <> 'admin'`, [usuarioId]);
  },
};
