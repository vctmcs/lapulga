// Filtro 1: términos y sinónimos prohibidos.
// Es determinista (puntaje 1) y no necesita modelos. Las frases de "excepciones" se quitan antes
// de buscar para no marcar artículos legítimos como una pistola de silicón o una muñeca reborn.

const CATEGORIAS = {
  armas: [
    'arma de fuego', 'armas de fuego', 'pistola', 'pistolas', 'revolver', 'rifle', 'rifles', 'escopeta', 'escopetas',
    'subametralladora', 'ametralladora', 'cuerno de chivo', 'ak 47', 'ak47', 'ar 15', 'ar15', 'glock', 'beretta',
    'calibre 9', '9mm', 'calibre 22', 'calibre 38', 'calibre 45', '38 super', 'municion', 'municiones', 'balas',
    'cartuchos', 'cargador para pistola', 'silenciador', 'granada', 'granadas', 'explosivo', 'explosivos', 'dinamita',
    'polvora', 'arma blanca', 'navaja automatica', 'manopla', 'chaleco antibalas', 'fusca',
  ],
  drogas: [
    'cocaina', 'coca en polvo', 'perico', 'marihuana', 'mariguana', 'mota', 'weed', 'cannabis', 'thc', 'hachis',
    'crack', 'heroina', 'metanfetamina', 'cristal de meta', 'meth', 'fentanilo', 'mdma', 'extasis', 'tachas', 'lsd',
    'ketamina', 'hongos alucinogenos', 'psilocibina', 'popper', 'poppers', 'clonazepam', 'rivotril',
    'tafil', 'alprazolam', 'sin receta', 'opioides', 'oxicodona', 'tramadol', 'gallo de mota', 'grapa de coca',
  ],
  trata_de_personas: [
    'vendo bebe', 'vendo a mi bebe', 'venta de bebe', 'venta de bebes', 'bebe en venta', 'vendo nino', 'vendo nina',
    'vendo menor', 'venta de menores', 'venta de personas', 'se vende persona', 'vendo mujer', 'vendo mujeres',
    'venta de organos', 'vendo organo', 'vendo rinon', 'vendo mi rinon', 'compro rinon', 'renta de utero',
    'vientre de alquiler', 'trabajo en el extranjero sin papeles', 'adopcion por dinero',
  ],
  servicios_sexuales: [
    'servicio sexual', 'servicios sexuales', 'sexoservidora', 'sexoservidor', 'escort', 'escorts', 'scort',
    'acompanante vip', 'acompanantes vip', 'chica prepago', 'chicas prepago', 'final feliz', 'masaje con final feliz',
    'sexo por dinero', 'sexo casual', 'xxx', 'contenido para adultos', 'contenido +18', 'onlyfans', 'vendo packs', 'nudes',
    'webcam erotica',
  ],
  otros_ilicitos: [
    'robado', 'robada', 'robados', 'robadas', 'de dudosa procedencia', 'sin papeles', 'tarjeta clonada',
    'tarjetas clonadas', 'billetes falsos', 'dinero falso', 'documentos falsos', 'ine falsa', 'licencia falsa',
    'titulo falso', 'cedula falsa', 'pasaporte falso', 'receta medica en venta', 'recetas medicas', 'cuentas hackeadas',
    'hackeo de cuentas', 'placas falsas', 'auto chocolate', 'carro chocolate', 'huachicol', 'gasolina robada',
    'animal exotico', 'especie protegida', 'piel de jaguar', 'colmillo de elefante', 'cuerno de rinoceronte',
  ],
};

// Frases legítimas que contienen alguno de los términos
const EXCEPCIONES = [
  'pistola de silicon', 'pistola de silicona', 'pistola de calor', 'pistola para pintar', 'pistola de pintura',
  'pistola de aire', 'pistola de clavos', 'pistola de grapas', 'pistola de agua', 'pistola de juguete',
  'pistola de hidrogel', 'pistola de impacto', 'pistola de masaje', 'pistola masajeadora', 'pistola de riego',
  'pistola de soldar', 'pistola de lavado', 'pistola para lavar', 'pistola de gel', 'pistola nerf',
  'rifle de juguete', 'rifle de aire', 'escopeta de juguete', 'balas de goma eva', 'balas de hidrogel',
  'coca cola', 'cocacola', 'sexo femenino', 'sexo masculino', 'sexo del bebe', 'bebe reborn', 'muneca',
  'muneco', 'ropa de bebe', 'carriola de bebe', 'cuna de bebe', 'mota de algodon', 'motas de algodon',
  'mota para maquillaje', 'sin papeles de importacion', 'no es robado', 'no es robada', 'no robado', 'no robada',
  'nada robado', 'lentes sin receta', 'gafas sin receta', 'anteojos sin receta', 'polvora de colores',
];

// Quita acentos, pasa a minúsculas y deja solo letras, números y espacios
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+@$\s.\-_*]/g, ' ');
}

// Une palabras escritas letra por letra: "c.o.c.a.i.n.a" o "c o c a i n a" → "cocaina"
function unirDeletreadas(texto) {
  return texto.replace(/\b(?:[a-z0-9][\s.\-_*]){2,}[a-z0-9]\b/g, (m) => m.replace(/[\s.\-_*]/g, ''));
}

// Cambia sustituciones típicas para evadir filtros: c0ca1na, 3xtasis, $exo…
function sinLeet(texto) {
  return texto.replace(/[0134578@$]/g, (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' })[c]);
}

const limpiarSeparadores = (t) => t.replace(/[.\-_*]+/g, ' ').replace(/\s+/g, ' ').trim();
const escaparRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const REGLAS = Object.entries(CATEGORIAS).flatMap(([categoria, lista]) =>
  lista.map((termino) => ({
    categoria,
    termino,
    regex: new RegExp(`(^|[^a-z0-9])${escaparRegex(termino)}($|[^a-z0-9])`),
  }))
);

function quitarExcepciones(texto) {
  return EXCEPCIONES.reduce((t, frase) => t.split(frase).join(' '), texto);
}

/**
 * @param {string} texto
 * @returns {Array<{ filtro: 'terminos', etiqueta: string, puntaje: number }>}
 */
function analizar(texto) {
  const base = normalizar(texto);
  const variantes = new Set([
    limpiarSeparadores(base),
    limpiarSeparadores(unirDeletreadas(base)),
    limpiarSeparadores(sinLeet(base)),
    limpiarSeparadores(sinLeet(unirDeletreadas(base))),
  ].map(quitarExcepciones));

  const encontrados = new Map();
  for (const v of variantes) {
    for (const r of REGLAS) {
      if (!encontrados.has(r.termino) && r.regex.test(v)) encontrados.set(r.termino, r.categoria);
    }
  }

  return [...encontrados].map(([termino, categoria]) => ({
    filtro: 'terminos',
    etiqueta: `${categoria}: ${termino}`,
    puntaje: 1,
  }));
}

module.exports = { analizar, normalizar, CATEGORIAS };
