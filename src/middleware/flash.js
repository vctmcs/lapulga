// Mensajes de una sola lectura guardados en la sesión
module.exports = function flash(req, res, next) {
  req.flash = (tipo, mensaje) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ tipo, mensaje });
  };
  res.locals.flash = req.session.flash || [];
  delete req.session.flash;
  next();
};
