const { Router } = require('express');
const auth = require('../controllers/authController');
const pubs = require('../controllers/publicacionesController');
const perfil = require('../controllers/perfilController');
const admin = require('../controllers/adminController');
const resenas = require('../controllers/resenasController');
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

// Contacto protegido y reportes (cualquier usuario con sesión)
r.post('/publicaciones/:id/contacto', requiereSesion, pubs.contacto);
r.post('/publicaciones/:id/reportar', requiereSesion, pubs.reportar);

// Vendedor
r.get('/mis-publicaciones', requiereRol('vendedor'), pubs.mias);
r.post('/publicaciones', requiereRol('vendedor'), imagenesPublicacion, pubs.crear);
r.get('/publicaciones/:id/editar', requiereRol('vendedor'), pubs.editar);
r.post('/publicaciones/:id/editar', requiereRol('vendedor'), imagenesPublicacion, pubs.actualizar);
r.post('/publicaciones/:id/vendida', requiereRol('vendedor'), pubs.marcarVendida);
r.post('/publicaciones/:id/eliminar', requiereRol('vendedor'), pubs.eliminar);

// Reseñas (cualquier usuario registrado que no sea admin)
const conPerfil = requiereRol('vendedor', 'comprador');
r.get('/resenas', conPerfil, resenas.index);
r.get('/resenas/nueva', conPerfil, resenas.formNueva);
r.post('/resenas', conPerfil, resenas.crear);
r.get('/resenas/:id/editar', conPerfil, resenas.formEditar);
r.post('/resenas/:id/editar', conPerfil, resenas.editar);
r.post('/resenas/:id/reportar', requiereSesion, resenas.reportar);

// Reglas
r.get('/ayuda', (req, res) => res.render('ayuda', { titulo: 'Reglas' }));

// Cuenta
r.get('/cuenta', requiereSesion, perfil.formEditar);
r.post('/cuenta', requiereSesion, perfil.editar);
r.post('/cuenta/password', requiereSesion, perfil.cambiarPassword);
r.post('/cuenta/vender', requiereRol('comprador'), perfil.volverseVendedor);

// Administración
const soloAdmin = requiereRol('admin');
r.get('/admin', soloAdmin, admin.cola);
r.post('/admin/publicaciones/:id/decidir', soloAdmin, admin.decidir);
r.post('/admin/resenas/:id/decidir', soloAdmin, admin.decidirResena);
r.post('/publicaciones/:id/ocultar', soloAdmin, pubs.ocultar);
r.get('/admin/historial', soloAdmin, admin.historial);
r.get('/admin/metricas', soloAdmin, admin.metricas);
r.get('/admin/usuarios', soloAdmin, admin.usuarios);
r.post('/admin/usuarios/:id/desbloquear', soloAdmin, admin.desbloquear);

module.exports = r;
