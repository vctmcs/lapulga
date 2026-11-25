const bcrypt = require('bcryptjs');
const Usuario = require('../models/usuarioModel');
const Publicacion = require('../models/publicacionModel');
const validar = require('../utils/validacion');

module.exports = {
  // Perfil público de cualquier usuario
  async ver(req, res) {
    const id = Number(req.params.id);
    const perfil = Number.isInteger(id) ? await Usuario.perfilPublico(id) : null;
    if (!perfil || perfil.bloqueado || perfil.rol === 'admin') {
      return res.status(404).render('error', { titulo: 'No encontrado', codigo: 404, mensaje: 'Este perfil no existe.' });
    }
    const publicaciones = perfil.rol === 'vendedor' ? await Publicacion.delUsuario(id, { soloPublicadas: true }) : [];
    res.render('perfil/ver', {
      titulo: perfil.nombre,
      perfil,
      publicaciones,
      esPropio: req.usuario && req.usuario.id === perfil.id,
    });
  },

  formEditar(req, res) {
    const u = req.usuario;
    res.render('perfil/editar', {
      titulo: 'Mi cuenta',
      valores: {
        nombre: u.nombre,
        telefono: u.telefono || '',
        whatsapp: u.whatsapp || '',
        mismo_whatsapp: u.telefono && u.telefono === u.whatsapp,
      },
      errores: {},
      erroresPass: {},
    });
  },

  async editar(req, res) {
    const { datos, errores } = validar.perfil(req.body, req.usuario.rol);
    if (validar.hayErrores(errores)) {
      return res.status(422).render('perfil/editar', { titulo: 'Mi cuenta', valores: req.body, errores, erroresPass: {} });
    }
    await Usuario.actualizarPerfil(req.usuario.id, datos);
    req.flash('ok', 'Datos actualizados.');
    res.redirect('/cuenta');
  },

  async cambiarPassword(req, res) {
    const { actual = '', nueva = '', confirmar = '' } = req.body;
    const erroresPass = {};
    const u = await Usuario.conHash(req.usuario.id);

    if (!(await bcrypt.compare(String(actual), u.password_hash))) erroresPass.actual = 'La contraseña actual no es correcta.';
    if (String(nueva).length < 8 || !/\d/.test(nueva) || !/[a-zA-Z]/.test(nueva))
      erroresPass.nueva = 'Mínimo 8 caracteres, con letras y números.';
    if (nueva !== confirmar) erroresPass.confirmar = 'Las contraseñas no coinciden.';

    if (validar.hayErrores(erroresPass)) {
      return res.status(422).render('perfil/editar', {
        titulo: 'Mi cuenta',
        valores: { ...req.usuario, mismo_whatsapp: req.usuario.telefono === req.usuario.whatsapp },
        errores: {},
        erroresPass,
        abrirPass: true,
      });
    }
    await Usuario.cambiarPassword(u.id, await bcrypt.hash(nueva, 10));
    req.flash('ok', 'Contraseña actualizada.');
    res.redirect('/cuenta');
  },

  // Un comprador puede pasar a vendedor si tiene un medio de contacto
  async volverseVendedor(req, res) {
    if (req.usuario.rol !== 'comprador') return res.redirect('/cuenta');
    if (!req.usuario.telefono && !req.usuario.whatsapp) {
      req.flash('error', 'Agrega un teléfono o WhatsApp antes de empezar a vender.');
      return res.redirect('/cuenta');
    }
    await Usuario.cambiarRol(req.usuario.id, 'vendedor');
    req.flash('ok', 'Ahora tu cuenta es de vendedor. ¡Publica tu primer artículo!');
    res.redirect('/publicaciones/nueva');
  },
};
