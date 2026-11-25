const bcrypt = require('bcryptjs');
const Usuario = require('../models/usuarioModel');
const validar = require('../utils/validacion');

function regenerar(req) {
  return new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
}

async function iniciarSesion(req, usuario, volverA) {
  await regenerar(req); // evita fijación de sesión
  req.session.usuarioId = usuario.id;
  return volverA && volverA.startsWith('/') && !volverA.startsWith('//') ? volverA : '/';
}

module.exports = {
  formLogin(req, res) {
    res.render('auth/login', { titulo: 'Iniciar sesión', valores: {}, error: null });
  },

  async login(req, res) {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const usuario = email ? await Usuario.porEmail(email) : null;
    const valido = usuario && (await bcrypt.compare(password, usuario.password_hash));

    if (!valido) {
      return res.status(401).render('auth/login', {
        titulo: 'Iniciar sesión',
        valores: { email },
        error: 'Correo o contraseña incorrectos.',
      });
    }
    if (usuario.bloqueado) {
      return res.status(403).render('auth/login', {
        titulo: 'Iniciar sesión',
        valores: { email },
        error: 'Tu cuenta está bloqueada por acumular 3 strikes de moderación.',
      });
    }

    const destino = await iniciarSesion(req, usuario, req.session.volverA);
    req.flash('ok', `Hola de nuevo, ${usuario.nombre.split(' ')[0]}.`);
    res.redirect(usuario.rol === 'admin' && destino === '/' ? '/admin' : destino);
  },

  formRegistro(req, res) {
    const rol = req.query.rol === 'vendedor' ? 'vendedor' : 'comprador';
    res.render('auth/registro', { titulo: 'Crear cuenta', valores: { rol }, errores: {} });
  },

  async registro(req, res) {
    const { datos, errores } = validar.registro(req.body);

    if (!errores.email && (await Usuario.porEmail(datos.email))) {
      errores.email = 'Ya existe una cuenta con este correo.';
    }
    if (validar.hayErrores(errores)) {
      return res.status(422).render('auth/registro', {
        titulo: 'Crear cuenta',
        valores: { ...req.body, rol: datos.rol },
        errores,
      });
    }

    const passwordHash = await bcrypt.hash(datos.password, 10);
    const usuario = await Usuario.crear({ ...datos, passwordHash });
    const destino = await iniciarSesion(req, usuario, null);
    req.flash(
      'ok',
      usuario.rol === 'vendedor'
        ? '¡Cuenta creada! Ya puedes publicar tu primer artículo.'
        : '¡Cuenta creada! Ya puedes ver los datos de contacto de los vendedores.'
    );
    res.redirect(usuario.rol === 'vendedor' ? '/publicaciones/nueva' : destino);
  },

  logout(req, res) {
    req.session.destroy(() => {
      res.clearCookie('lapulga.sid');
      res.redirect('/');
    });
  },
};
