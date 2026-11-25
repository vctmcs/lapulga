const Moderacion = require('../models/moderacionModel');
const Resena = require('../models/resenaModel');
const { MOTIVOS: MOTIVOS_RESENA } = require('./resenasController');

const NOMBRES_FILTRO = {
  terminos: 'Términos prohibidos',
  texto_zero_shot: 'Texto (zero-shot)',
  imagen_nsfw: 'Imagen (NSFWJS)',
  usuario: 'Reporte de usuario',
  manual: 'Ocultada por admin',
};

module.exports = {
  NOMBRES_FILTRO,

  async cola(req, res) {
    const [casos, resenas] = await Promise.all([Moderacion.cola(), Resena.cola()]);
    res.render('admin/cola', { titulo: 'Cola de revisión', casos, resenas, motivosResena: MOTIVOS_RESENA, filtros: NOMBRES_FILTRO, seccion: 'cola' });
  },

  async decidir(req, res) {
    const id = Number(req.params.id);
    const decision = req.body.decision === 'confirmar' ? 'confirmada' : req.body.decision === 'descartar' ? 'descartada' : null;
    if (!Number.isInteger(id) || !decision) return res.redirect('/admin');

    const u = await Moderacion.decidir(id, req.usuario.id, decision);
    if (!u) {
      req.flash('info', 'Ese caso ya había sido resuelto.');
    } else if (decision === 'confirmada') {
      req.flash(
        u.bloqueado ? 'alerta' : 'ok',
        u.bloqueado
          ? `Detección confirmada. ${u.nombre} llegó a ${u.strikes} strikes y su cuenta quedó bloqueada.`
          : `Detección confirmada. ${u.nombre} tiene ahora ${u.strikes} de 3 strikes.`
      );
    } else {
      req.flash('ok', 'Detección descartada. La publicación quedó aprobada y el usuario puede volver a publicar.');
    }
    res.redirect('/admin');
  },

  async decidirResena(req, res) {
    const id = Number(req.params.id);
    const decision = req.body.decision === 'confirmar' ? 'confirmada' : req.body.decision === 'descartar' ? 'descartada' : null;
    if (!Number.isInteger(id) || !decision) return res.redirect('/admin');
    const u = await Resena.decidir(id, req.usuario.id, decision);
    if (!u) req.flash('info', 'Esa reseña ya había sido resuelta.');
    else if (decision === 'confirmada')
      req.flash(u.bloqueado ? 'alerta' : 'ok', `Reseña eliminada. ${u.nombre} tiene ${u.strikes} de 3 strikes${u.bloqueado ? ' y su cuenta quedó bloqueada' : ''}.`);
    else req.flash('ok', 'Reporte descartado. La reseña queda visible.');
    res.redirect('/admin');
  },

  async historial(req, res) {
    const decisiones = await Moderacion.historial(150);
    res.render('admin/historial', { titulo: 'Historial de decisiones', decisiones, seccion: 'historial' });
  },

  async metricas(req, res) {
    const [m, mResenas] = await Promise.all([Moderacion.metricas(), Resena.metricas()]);
    res.render('admin/metricas', { titulo: 'Precisión de la IA', m, mResenas, filtros: NOMBRES_FILTRO, seccion: 'metricas' });
  },

  async usuarios(req, res) {
    const usuarios = await Moderacion.usuarios();
    res.render('admin/usuarios', { titulo: 'Usuarios', usuarios, seccion: 'usuarios' });
  },

  async desbloquear(req, res) {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) {
      await Moderacion.desbloquear(id);
      req.flash('ok', 'Usuario desbloqueado y strikes reiniciados.');
    }
    res.redirect('/admin/usuarios');
  },
};
