const Resena = require('../models/resenaModel');
const Usuario = require('../models/usuarioModel');
const Publicacion = require('../models/publicacionModel');
const { analizarTexto } = require('../services/moderacion');

const MOTIVOS = {
  ofensiva: 'Lenguaje ofensivo o acoso',
  falsa: 'Reseña falsa o sin relación con el trato',
  datos: 'Expone datos personales',
  ilicito: 'Menciona algo ilegal',
  otro: 'Otro motivo',
};

function validar(body) {
  const calificacion = Number(body.calificacion);
  const comentario = String(body.comentario || '').trim();
  const errores = {};
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) errores.calificacion = 'Elige de 1 a 5 estrellas.';
  if (comentario.length > 1000) errores.comentario = 'El comentario puede tener máximo 1000 caracteres.';
  if (comentario && comentario.length < 5) errores.comentario = 'Escribe al menos 5 caracteres o deja el comentario vacío.';
  return { datos: { calificacion, comentario }, errores };
}

const noEncontrada = (res) =>
  res.status(404).render('error', { titulo: 'No encontrada', codigo: 404, mensaje: 'Esa reseña no existe o no puedes modificarla.' });

async function moderarTexto(comentario) {
  if (!comentario) return [];
  return (await analizarTexto(comentario)).hallazgos;
}

function avisoGuardado(req, estado, nueva) {
  if (estado === 'en_revision') {
    req.flash('alerta', 'Tu reseña fue marcada por la revisión automática. Quedó oculta hasta que el administrador la revise.');
  } else {
    req.flash('ok', nueva ? 'Gracias, tu reseña ya es visible en el perfil.' : 'Reseña actualizada.');
  }
}

module.exports = {
  MOTIVOS,

  // GET /resenas  → a quién puedo reseñar y qué reseñas he escrito
  async index(req, res) {
    const [oportunidades, escritas] = await Promise.all([
      Resena.oportunidades(req.usuario.id),
      Resena.delAutor(req.usuario.id),
    ]);
    res.render('resenas/index', {
      titulo: 'Reseñas',
      oportunidades,
      escritas: escritas.map((r) => ({ ...r, editable: Resena.editable(r) })),
      dias: Resena.DIAS_EDICION,
    });
  },

  // GET /resenas/nueva?publicacion=ID&receptor=ID
  async formNueva(req, res) {
    const publicacionId = Number(req.query.publicacion);
    const receptorId = Number(req.query.receptor);
    const rol = await Resena.elegibilidad(req.usuario.id, receptorId, publicacionId);
    if (!rol) {
      req.flash('error', 'Solo puedes reseñar a alguien con quien tuviste contacto por una publicación.');
      return res.redirect('/resenas');
    }
    const existente = await Resena.existente(req.usuario.id, receptorId, publicacionId);
    if (existente) return res.redirect(`/resenas/${existente}/editar`);

    const [receptor, pub] = await Promise.all([Usuario.porId(receptorId), Publicacion.porId(publicacionId)]);
    res.render('resenas/form', {
      titulo: 'Escribir reseña',
      resena: null,
      contexto: { receptor: receptor.nombre, receptorId, publicacionId, titulo: pub.titulo, rol },
      valores: {},
      errores: {},
    });
  },

  // POST /resenas
  async crear(req, res) {
    const publicacionId = Number(req.body.publicacion_id);
    const receptorId = Number(req.body.receptor_id);
    const rol = await Resena.elegibilidad(req.usuario.id, receptorId, publicacionId);
    if (!rol) {
      req.flash('error', 'Solo puedes reseñar a alguien con quien tuviste contacto por una publicación.');
      return res.redirect('/resenas');
    }
    const existente = await Resena.existente(req.usuario.id, receptorId, publicacionId);
    if (existente) {
      req.flash('info', 'Ya habías reseñado a esta persona por esa publicación; aquí puedes editarla.');
      return res.redirect(`/resenas/${existente}/editar`);
    }

    const { datos, errores } = validar(req.body);
    if (Object.keys(errores).length) {
      const [receptor, pub] = await Promise.all([Usuario.porId(receptorId), Publicacion.porId(publicacionId)]);
      return res.status(422).render('resenas/form', {
        titulo: 'Escribir reseña',
        resena: null,
        contexto: { receptor: receptor.nombre, receptorId, publicacionId, titulo: pub.titulo, rol },
        valores: req.body,
        errores,
      });
    }

    const hallazgos = await moderarTexto(datos.comentario);
    const { estado } = await Resena.guardar(
      { autorId: req.usuario.id, receptorId, publicacionId, rolReceptor: rol, ...datos },
      hallazgos
    );
    avisoGuardado(req, estado, true);
    res.redirect(estado === 'visible' ? `/usuarios/${receptorId}` : '/resenas');
  },

  async formEditar(req, res) {
    const r = await Resena.porId(Number(req.params.id));
    if (!r || r.autor_id !== req.usuario.id) return noEncontrada(res);
    if (!Resena.editable(r)) {
      req.flash('error', `Las reseñas solo se pueden editar durante ${Resena.DIAS_EDICION} días.`);
      return res.redirect('/resenas');
    }
    res.render('resenas/form', {
      titulo: 'Editar reseña',
      resena: r,
      contexto: { receptor: r.receptor, receptorId: r.receptor_id, publicacionId: r.publicacion_id, titulo: r.titulo, rol: r.rol_receptor },
      valores: { calificacion: r.calificacion, comentario: r.comentario || '' },
      errores: {},
    });
  },

  async editar(req, res) {
    const r = await Resena.porId(Number(req.params.id));
    if (!r || r.autor_id !== req.usuario.id) return noEncontrada(res);
    if (!Resena.editable(r)) {
      req.flash('error', `Las reseñas solo se pueden editar durante ${Resena.DIAS_EDICION} días.`);
      return res.redirect('/resenas');
    }
    const { datos, errores } = validar(req.body);
    if (Object.keys(errores).length) {
      return res.status(422).render('resenas/form', {
        titulo: 'Editar reseña',
        resena: r,
        contexto: { receptor: r.receptor, receptorId: r.receptor_id, publicacionId: r.publicacion_id, titulo: r.titulo, rol: r.rol_receptor },
        valores: req.body,
        errores,
      });
    }
    const hallazgos = await moderarTexto(datos.comentario);
    const { estado } = await Resena.guardar({ id: r.id, ...datos }, hallazgos);
    avisoGuardado(req, estado, false);
    res.redirect(estado === 'visible' ? `/usuarios/${r.receptor_id}` : '/resenas');
  },

  // POST /resenas/:id/reportar
  async reportar(req, res) {
    const r = await Resena.porId(Number(req.params.id));
    if (!r || r.estado !== 'visible') return noEncontrada(res);
    if (r.autor_id === req.usuario.id) return res.redirect(`/usuarios/${r.receptor_id}`);
    const clave = MOTIVOS[req.body.motivo] ? req.body.motivo : 'otro';
    const nuevo = await Resena.reportarPorUsuario(r.id, req.usuario.id, {
      etiqueta: clave,
      texto: String(req.body.detalle || '').trim().slice(0, 300),
    });
    req.flash(nuevo ? 'ok' : 'info', nuevo ? 'Gracias, el administrador revisará la reseña.' : 'Ya habías reportado esta reseña.');
    res.redirect(`/usuarios/${r.receptor_id}`);
  },
};
