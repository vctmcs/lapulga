const fs = require('fs/promises');
const path = require('path');
const Publicacion = require('../models/publicacionModel');
const Categoria = require('../models/categoriaModel');
const validar = require('../utils/validacion');
const formato = require('../utils/formato');
const Moderacion = require('../models/moderacionModel');
const { analizarPublicacion } = require('../services/moderacion');
const { MAX_IMAGENES } = require('../middleware/upload');

const CARPETA_UPLOADS = path.join(__dirname, '..', '..', 'uploads');

async function borrarArchivos(nombres) {
  await Promise.all(
    nombres.map((n) => fs.unlink(path.join(CARPETA_UPLOADS, path.basename(n))).catch(() => {}))
  );
}

const nombresSubidos = (req) => (req.files || []).map((f) => f.filename);

function noEncontrada(res) {
  return res.status(404).render('error', {
    titulo: 'No encontrada',
    codigo: 404,
    mensaje: 'Esta publicación no existe o ya no está disponible.',
  });
}

// Carga la publicación y comprueba que sea del usuario en sesión
async function propiaOFalla(req, res) {
  const id = Number(req.params.id);
  const pub = Number.isInteger(id) ? await Publicacion.porId(id) : null;
  if (!pub || pub.estado === 'eliminada' || pub.usuario_id !== req.usuario.id) {
    noEncontrada(res);
    return null;
  }
  return pub;
}

async function renderForm(res, { pub = null, valores, errores = {}, imagenes = [], status = 200 }) {
  res.status(status).render('publicaciones/form', {
    titulo: pub ? 'Editar publicación' : 'Publicar artículo',
    pub,
    valores,
    errores,
    imagenes,
    categorias: await Categoria.todas(),
    maxImagenes: MAX_IMAGENES,
  });
}

// Pasa la publicación por los filtros de IA; si queda marcada se guarda el reporte,
// se oculta y el usuario no puede publicar hasta que el administrador decida.
async function moderar(pub) {
  const imagenes = (await Publicacion.imagenes(pub.id)).map((i) => i.ruta);
  const resultado = await analizarPublicacion({ titulo: pub.titulo, descripcion: pub.descripcion, imagenes });
  if (resultado.marcada) {
    await Moderacion.marcarPorIA(pub.id, pub.usuario_id, resultado.hallazgos);
  }
  return resultado;
}

const MOTIVOS = {
  armas: 'Armas o municiones',
  drogas: 'Drogas o medicamentos controlados',
  servicios_sexuales: 'Contenido o servicios sexuales',
  trata_de_personas: 'Venta de personas u órganos',
  otros_ilicitos: 'Robado, falsificado u otro ilícito',
  fraude: 'Parece fraude o precio falso',
  otro: 'Otro motivo',
};

module.exports = {
  // ---------- Públicas ----------
  async inicio(req, res) {
    const filtros = {
      q: String(req.query.q || '').trim().slice(0, 80),
      categoria: String(req.query.cat || ''),
      donacion: ['si', 'no'].includes(req.query.donacion) ? req.query.donacion : '',
      orden: String(req.query.orden || 'recientes'),
      pagina: Math.max(1, parseInt(req.query.pagina, 10) || 1),
    };
    const [resultado, categorias] = await Promise.all([
      Publicacion.listarPublicas(filtros),
      Categoria.todas(),
    ]);
    const hayFiltros = Boolean(filtros.q || filtros.categoria || filtros.donacion);
    res.render('home', { titulo: '', filtros, categorias, hayFiltros, esPortada: !hayFiltros && filtros.pagina === 1, ...resultado });
  },

  async detalle(req, res) {
    const id = Number(req.params.id);
    const pub = Number.isInteger(id) ? await Publicacion.porId(id) : null;
    if (!pub || pub.estado === 'eliminada') return noEncontrada(res);

    const esDueno = req.usuario && req.usuario.id === pub.usuario_id;
    const esAdmin = req.usuario && req.usuario.rol === 'admin';
    const visible = pub.estado === 'publicada' || pub.estado === 'vendida';
    if ((!visible || pub.vendedor_bloqueado) && !esDueno && !esAdmin) return noEncontrada(res);

    const [imagenes, otras] = await Promise.all([
      Publicacion.imagenes(pub.id),
      Publicacion.delUsuario(pub.usuario_id, { soloPublicadas: true }),
    ]);
    const yaConsulto = req.usuario && !esDueno ? await Publicacion.yaConsulto(pub.id, req.usuario.id) : false;

    res.render('publicaciones/detalle', {
      titulo: pub.titulo,
      pub,
      imagenes,
      otras: otras.filter((o) => o.id !== pub.id).slice(0, 4),
      esDueno,
      yaConsulto,
      motivos: MOTIVOS,
    });
  },

  // POST /publicaciones/:id/contacto → JSON con teléfono y WhatsApp; registra la consulta
  async contacto(req, res) {
    const id = Number(req.params.id);
    const pub = Number.isInteger(id) ? await Publicacion.porId(id) : null;
    if (!pub || pub.estado !== 'publicada' || pub.vendedor_bloqueado) {
      return res.status(404).json({ error: 'La publicación no está disponible.' });
    }
    const esDueno = req.usuario.id === pub.usuario_id;
    if (!esDueno) await Publicacion.registrarVistaContacto(pub.id, req.usuario.id);

    const c = await Publicacion.contactoDelVendedor(pub.id);
    const mensaje = `Hola ${c.nombre.split(' ')[0]}, vi tu publicación "${pub.titulo}" en La Pulga. ¿Sigue disponible?`;
    res.json({
      nombre: c.nombre,
      telefono: c.telefono ? formato.telefonoBonito(c.telefono) : null,
      telLink: c.telefono ? `tel:${c.telefono}` : null,
      whatsapp: c.whatsapp ? formato.telefonoBonito(c.whatsapp) : null,
      waLink: formato.enlaceWhatsapp(c.whatsapp, mensaje),
    });
  },

  // ---------- Vendedor ----------
  async mias(req, res) {
    const publicaciones = await Publicacion.delUsuario(req.usuario.id);
    res.render('publicaciones/mias', { titulo: 'Mis publicaciones', publicaciones });
  },

  async nueva(req, res) {
    if (!req.usuario.puede_publicar) {
      req.flash('error', 'Tienes una publicación en revisión. Podrás publicar cuando el administrador la revise.');
      return res.redirect('/mis-publicaciones');
    }
    await renderForm(res, { valores: {} });
  },

  async crear(req, res) {
    const subidas = nombresSubidos(req);
    if (!req.usuario.puede_publicar) {
      await borrarArchivos(subidas);
      req.flash('error', 'Tienes una publicación en revisión. Podrás publicar cuando el administrador la revise.');
      return res.redirect('/mis-publicaciones');
    }

    const { datos, errores } = validar.publicacion(req.body);
    if (req.errorSubida) errores.imagenes = req.errorSubida;
    else if (subidas.length === 0) errores.imagenes = 'Sube al menos una foto del artículo.';
    if (datos.categoriaId && !(await Categoria.existe(datos.categoriaId))) errores.categoria_id = 'Elige una categoría.';

    if (validar.hayErrores(errores)) {
      await borrarArchivos(subidas);
      return renderForm(res, { valores: req.body, errores, status: 422 });
    }

    const pub = await Publicacion.crear({ ...datos, usuarioId: req.usuario.id });
    await Publicacion.agregarImagenes(pub.id, subidas);
    const mod = await moderar(pub);

    if (mod.marcada) {
      req.flash('alerta', 'Tu publicación fue reportada por el sistema y quedó oculta en revisión. No podrás publicar hasta que el administrador la revise.');
      return res.redirect('/mis-publicaciones');
    }
    req.flash('ok', datos.precio === 0 ? '¡Gracias! Tu donación ya está publicada.' : '¡Listo! Tu artículo ya está publicado.');
    res.redirect(`/publicaciones/${pub.id}`);
  },

  async editar(req, res) {
    const pub = await propiaOFalla(req, res);
    if (!pub) return;
    if (pub.estado === 'en_revision' || pub.estado === 'rechazada') {
      req.flash('error', pub.estado === 'rechazada'
        ? 'Esta publicación fue rechazada por moderación y ya no se puede editar.'
        : 'No puedes editar una publicación mientras está en revisión.');
      return res.redirect('/mis-publicaciones');
    }
    await renderForm(res, {
      pub,
      valores: {
        titulo: pub.titulo,
        descripcion: pub.descripcion,
        categoria_id: pub.categoria_id,
        precio: Number(pub.precio).toString(),
      },
      imagenes: await Publicacion.imagenes(pub.id),
    });
  },

  async actualizar(req, res) {
    const subidas = nombresSubidos(req);
    const pub = await propiaOFalla(req, res);
    if (!pub) return borrarArchivos(subidas);
    if (pub.estado === 'en_revision' || pub.estado === 'rechazada') {
      await borrarArchivos(subidas);
      req.flash('error', 'Esta publicación no se puede editar en su estado actual.');
      return res.redirect('/mis-publicaciones');
    }

    const { datos, errores } = validar.publicacion(req.body);
    const actuales = await Publicacion.imagenes(pub.id);
    const quitar = [].concat(req.body.quitar_imagen || []).map(Number).filter((n) => actuales.some((i) => i.id === n));
    const quedarian = actuales.length - quitar.length + subidas.length;

    if (req.errorSubida) errores.imagenes = req.errorSubida;
    else if (quedarian < 1) errores.imagenes = 'La publicación debe conservar al menos una foto.';
    else if (quedarian > MAX_IMAGENES) errores.imagenes = `Máximo ${MAX_IMAGENES} fotos en total (tendrías ${quedarian}).`;

    if (validar.hayErrores(errores)) {
      await borrarArchivos(subidas);
      return renderForm(res, { pub, valores: req.body, errores, imagenes: actuales, status: 422 });
    }

    const actualizada = await Publicacion.actualizar(pub.id, datos);
    const borradas = await Publicacion.borrarImagenes(pub.id, quitar);
    await borrarArchivos(borradas);
    await Publicacion.agregarImagenes(pub.id, subidas);

    // Toda edición vuelve a pasar por la moderación
    const mod = await moderar(actualizada);
    if (mod.marcada) {
      req.flash('alerta', 'Tu publicación fue reportada por el sistema y quedó oculta en revisión.');
      return res.redirect('/mis-publicaciones');
    }

    req.flash('ok', 'Cambios guardados.');
    res.redirect(`/publicaciones/${pub.id}`);
  },

  async marcarVendida(req, res) {
    const pub = await propiaOFalla(req, res);
    if (!pub) return;
    if (pub.estado === 'publicada') {
      await Publicacion.cambiarEstado(pub.id, 'vendida');
      req.flash('ok', pub.es_donacion ? 'Marcada como entregada. ¡Gracias por donar!' : 'Marcada como vendida.');
    } else if (pub.estado === 'vendida') {
      await Publicacion.cambiarEstado(pub.id, 'publicada');
      req.flash('ok', 'La publicación vuelve a estar disponible.');
    }
    res.redirect('/mis-publicaciones');
  },

  async eliminar(req, res) {
    const pub = await propiaOFalla(req, res);
    if (!pub) return;
    if (pub.estado === 'en_revision') {
      req.flash('error', 'No puedes eliminar una publicación mientras está en revisión.');
      return res.redirect('/mis-publicaciones');
    }
    await Publicacion.cambiarEstado(pub.id, 'eliminada');
    req.flash('ok', 'Publicación eliminada.');
    res.redirect('/mis-publicaciones');
  },

  // ---------- Reportes ----------
  // Cualquier usuario con sesión puede reportar; la publicación sigue visible hasta que el admin decida
  async reportar(req, res) {
    const id = Number(req.params.id);
    const pub = Number.isInteger(id) ? await Publicacion.porId(id) : null;
    if (!pub || pub.estado !== 'publicada') return noEncontrada(res);
    if (pub.usuario_id === req.usuario.id) return res.redirect(`/publicaciones/${id}`);

    const clave = MOTIVOS[req.body.motivo] ? req.body.motivo : 'otro';
    const texto = String(req.body.detalle || '').trim().slice(0, 300);
    const nuevo = await Moderacion.reportarPorUsuario(id, req.usuario.id, { etiqueta: clave, texto });
    req.flash(nuevo ? 'ok' : 'info', nuevo ? 'Gracias. El administrador revisará la publicación.' : 'Ya habías reportado esta publicación.');
    res.redirect(`/publicaciones/${id}`);
  },

  // El administrador oculta y manda a revisión algo que la IA no detectó
  async ocultar(req, res) {
    const id = Number(req.params.id);
    const pub = Number.isInteger(id) ? await Publicacion.porId(id) : null;
    if (!pub || pub.estado !== 'publicada') return noEncontrada(res);
    await Moderacion.ocultarPorAdmin(id, req.usuario.id, String(req.body.detalle || '').trim().slice(0, 300));
    req.flash('ok', 'Publicación ocultada y enviada a la cola de revisión.');
    res.redirect('/admin');
  },
};
