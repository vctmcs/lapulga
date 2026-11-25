const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_IMAGENES = 5;
const MAX_MB = 5;
const TIPOS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const nombre = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${TIPOS[file.mimetype]}`;
    cb(null, nombre);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: MAX_IMAGENES },
  fileFilter: (req, file, cb) => {
    if (TIPOS[file.mimetype]) return cb(null, true);
    const err = new Error('Solo se aceptan imágenes JPG, PNG o WEBP.');
    err.code = 'TIPO_INVALIDO';
    cb(err);
  },
});

// Envuelve multer para convertir sus errores en un mensaje para el formulario
function imagenesPublicacion(req, res, next) {
  upload.array('imagenes', MAX_IMAGENES)(req, res, (err) => {
    if (!err) return next();
    const mensajes = {
      LIMIT_FILE_SIZE: `Cada imagen puede pesar como máximo ${MAX_MB} MB.`,
      LIMIT_FILE_COUNT: `Puedes subir hasta ${MAX_IMAGENES} imágenes.`,
      LIMIT_UNEXPECTED_FILE: `Puedes subir hasta ${MAX_IMAGENES} imágenes.`,
      TIPO_INVALIDO: err.message,
    };
    req.errorSubida = mensajes[err.code] || 'No se pudieron subir las imágenes.';
    req.files = [];
    next();
  });
}

module.exports = { imagenesPublicacion, MAX_IMAGENES, MAX_MB };
