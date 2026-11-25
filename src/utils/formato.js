const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
const fechaLarga = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

function precio(valor) {
  const n = Number(valor);
  if (n === 0) return 'Donación / Gratis';
  return moneda.format(n).replace('.00', '');
}

function fecha(valor) {
  return fechaLarga.format(new Date(valor));
}

function hace(valor) {
  const seg = Math.round((Date.now() - new Date(valor).getTime()) / 1000);
  if (seg < 60) return 'hace un momento';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? 'ayer' : `hace ${d} días`;
  return fecha(valor);
}

// Teléfono mexicano de 10 dígitos → enlace wa.me con lada 52
function enlaceWhatsapp(numero, texto) {
  const digitos = String(numero || '').replace(/\D/g, '');
  if (!digitos) return null;
  const completo = digitos.length === 10 ? `52${digitos}` : digitos;
  const q = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return `https://wa.me/${completo}${q}`;
}

function telefonoBonito(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return numero;
}

function iniciales(nombre) {
  return String(nombre || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

const ESTADOS = {
  publicada: 'Publicada',
  en_revision: 'Oculta · en revisión',
  rechazada: 'Rechazada',
  vendida: 'Vendida / entregada',
  eliminada: 'Eliminada',
};

module.exports = { precio, fecha, hace, enlaceWhatsapp, telefonoBonito, iniciales, ESTADOS };
