const limpiar = (v) => (typeof v === 'string' ? v.trim() : '');
const soloDigitos = (v) => limpiar(v).replace(/[\s\-().]/g, '');

function telefono(valor) {
  const d = soloDigitos(valor);
  if (!d) return { valor: null };
  if (!/^\+?\d{10,13}$/.test(d)) return { error: 'Escribe un número de 10 dígitos (puedes incluir lada).' };
  return { valor: d };
}

// Regla de negocio: el precio es obligatorio; 0 significa donación
function precio(valor) {
  const texto = limpiar(String(valor ?? '')).replace(/[$,\s]/g, '');
  if (texto === '') return { error: 'El precio es obligatorio. Escribe 0 si es una donación.' };
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) return { error: 'Escribe un precio válido, sin letras (ej. 350 o 99.50).' };
  const n = Number(texto);
  if (n > 9999999) return { error: 'El precio es demasiado alto.' };
  return { valor: n };
}

function registro(body) {
  const datos = {
    nombre: limpiar(body.nombre),
    email: limpiar(body.email).toLowerCase(),
    password: typeof body.password === 'string' ? body.password : '',
    confirmar: typeof body.confirmar === 'string' ? body.confirmar : '',
    rol: body.rol === 'vendedor' ? 'vendedor' : 'comprador',
  };
  const errores = {};

  if (datos.nombre.length < 3) errores.nombre = 'Escribe tu nombre (mínimo 3 letras).';
  if (datos.nombre.length > 100) errores.nombre = 'El nombre es demasiado largo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) errores.email = 'Escribe un correo válido.';
  if (datos.password.length < 8) errores.password = 'La contraseña debe tener al menos 8 caracteres.';
  else if (!/\d/.test(datos.password) || !/[a-zA-Z]/.test(datos.password))
    errores.password = 'Usa letras y números en la contraseña.';
  if (datos.password !== datos.confirmar) errores.confirmar = 'Las contraseñas no coinciden.';

  const tel = telefono(body.telefono);
  const wa = body.mismo_whatsapp ? tel : telefono(body.whatsapp);
  if (tel.error) errores.telefono = tel.error;
  if (wa.error) errores.whatsapp = wa.error;
  datos.telefono = tel.valor || null;
  datos.whatsapp = wa.valor || null;

  if (datos.rol === 'vendedor' && !datos.telefono && !datos.whatsapp)
    errores.telefono = 'Como vendedor necesitas al menos un teléfono o WhatsApp para que te contacten.';

  return { datos, errores };
}

function perfil(body, rol) {
  const datos = { nombre: limpiar(body.nombre) };
  const errores = {};
  if (datos.nombre.length < 3) errores.nombre = 'Escribe tu nombre (mínimo 3 letras).';
  const tel = telefono(body.telefono);
  const wa = body.mismo_whatsapp ? tel : telefono(body.whatsapp);
  if (tel.error) errores.telefono = tel.error;
  if (wa.error) errores.whatsapp = wa.error;
  datos.telefono = tel.valor || null;
  datos.whatsapp = wa.valor || null;
  if (rol === 'vendedor' && !datos.telefono && !datos.whatsapp)
    errores.telefono = 'Como vendedor necesitas al menos un teléfono o WhatsApp.';
  return { datos, errores };
}

function publicacion(body) {
  const datos = {
    titulo: limpiar(body.titulo),
    descripcion: limpiar(body.descripcion),
    categoriaId: Number(body.categoria_id) || null,
    precioTexto: limpiar(String(body.precio ?? '')),
  };
  const errores = {};

  if (datos.titulo.length < 5) errores.titulo = 'El título debe tener al menos 5 caracteres.';
  if (datos.titulo.length > 120) errores.titulo = 'El título puede tener máximo 120 caracteres.';
  if (datos.descripcion.length < 20) errores.descripcion = 'Describe el artículo con al menos 20 caracteres.';
  if (datos.descripcion.length > 3000) errores.descripcion = 'La descripción puede tener máximo 3000 caracteres.';
  if (!datos.categoriaId) errores.categoria_id = 'Elige una categoría.';

  const p = precio(body.precio);
  if (p.error) errores.precio = p.error;
  datos.precio = p.valor;

  return { datos, errores };
}

const hayErrores = (e) => Object.keys(e).length > 0;

module.exports = { registro, perfil, publicacion, precio, telefono, hayErrores };
