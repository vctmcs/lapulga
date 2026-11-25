const { Router } = require('express');
const auth = require('../controllers/authController');
const pubs = require('../controllers/publicacionesController');
const perfil = require('../controllers/perfilController');
const { requiereSesion, soloInvitados, requiereRol } = require('../middleware/auth');
const { imagenesPublicacion } = require('../middleware/upload');

const r = Router();

// Públicas
r.get('/', pubs.inicio);
r.get('/publicaciones/nueva', requiereRol('vendedor'), pubs.nueva); // antes de /:id
r.get('/publicaciones/:id', pubs.detalle);
r.get('/usuarios/:id', perfil.ver);

// Autenticación
r.get('/login', soloInvitados, auth.formLogin);
r.post('/login', soloInvitados, auth.login);
r.get('/registro', soloInvitados, auth.formRegistro);
r.post('/registro', soloInvitados, auth.registro);
r.post('/logout', auth.logout);

// Contacto protegido (cualquier usuario con sesión)
r.post('/publicaciones/:id/contacto', requiereSesion, pubs.contacto);

// Vendedor
r.get('/mis-publicaciones', requiereRol('vendedor'), pubs.mias);
r.post('/publicaciones', requiereRol('vendedor'), imagenesPublicacion, pubs.crear);
r.get('/publicaciones/:id/editar', requiereRol('vendedor'), pubs.editar);
r.post('/publicaciones/:id/editar', requiereRol('vendedor'), imagenesPublicacion, pubs.actualizar);
r.post('/publicaciones/:id/vendida', requiereRol('vendedor'), pubs.marcarVendida);
r.post('/publicaciones/:id/eliminar', requiereRol('vendedor'), pubs.eliminar);

// Cuenta
r.get('/cuenta', requiereSesion, perfil.formEditar);
r.post('/cuenta', requiereSesion, perfil.editar);
r.post('/cuenta/password', requiereSesion, perfil.cambiarPassword);
r.post('/cuenta/vender', requiereRol('comprador'), perfil.volverseVendedor);

// Administración (el panel completo llega en la Entrega 2)
r.get('/admin', requiereRol('admin'), (req, res) =>
  res.render('admin/pendiente', { titulo: 'Panel de moderación' })
);

module.exports = r;
