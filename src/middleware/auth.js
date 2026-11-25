const Usuario = require('../models/usuarioModel');
const Moderacion = require('../models/moderacionModel');
const Resena = require('../models/resenaModel');

// Carga el usuario de la sesión en cada petición (si cambió su rol o fue bloqueado, se refleja al instante)
async function cargarUsuario(req, res, next) {
  res.locals.usuario = null;
  if (req.session.usuarioId) {
    const u = await Usuario.porId(req.session.usuarioId);
    if (!u || u.bloqueado) {
      const bloqueado = u && u.bloqueado;
      req.session.usuarioId = null;
      if (bloqueado) req.flash('error', 'Tu cuenta está bloqueada por acumular 3 strikes.');
    } else {
      req.usuario = u;
      res.locals.usuario = u;
      if (u.rol === 'admin') {
        const [pubs, resenas] = await Promise.all([Moderacion.pendientes(), Resena.pendientes()]);
        res.locals.pendientes = pubs + resenas;
      } else {
        res.locals.porResenar = await Resena.pendientesDe(u.id);
      }
    }
  }
  next();
}

function requiereSesion(req, res, next) {
  if (req.usuario) return next();
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  }
  req.session.volverA = req.originalUrl;
  req.flash('info', 'Inicia sesión para continuar.');
  return res.redirect('/login');
}

function soloInvitados(req, res, next) {
  if (req.usuario) return res.redirect('/');
  next();
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return requiereSesion(req, res, next);
    if (roles.includes(req.usuario.rol)) return next();
    res.status(403);
    return res.render('error', {
      titulo: 'Sin permiso',
      codigo: 403,
      mensaje: 'Tu tipo de cuenta no tiene acceso a esta sección.',
    });
  };
}

module.exports = { cargarUsuario, requiereSesion, soloInvitados, requiereRol };
