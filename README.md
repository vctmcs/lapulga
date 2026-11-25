# La Pulga

Marketplace web de artículos usados y donaciones con moderación asistida por IA. Los usuarios publican lo que venden o regalan; el contacto se hace por teléfono o WhatsApp (sin chat interno) y solo es visible para usuarios registrados.

## Stack

- Node.js 20+ con Express 5
- PostgreSQL
- EJS como motor de vistas, CSS y JavaScript propios (sin frameworks de interfaz), con un diseño simple al estilo de las páginas de los 90
- Multer para la subida de imágenes
- express-session con sesiones guardadas en PostgreSQL (connect-pg-simple)
- IA gratuita y local: lista de términos prohibidos, Transformers.js (zero-shot) y NSFWJS con TensorFlow.js + sharp

## Roles

| Rol           | Qué puede hacer                                                                  |
|---------------|----------------------------------------------------------------------------------|
| Visitante     | Navega y busca publicaciones. No ve datos de contacto.                           |
| Comprador     | Tiene perfil y ve teléfono/WhatsApp de los vendedores. Puede volverse vendedor.  |
| Vendedor      | Publica, edita, marca como vendida/entregada y elimina sus publicaciones.        |
| Administrador | Revisa lo que marca la IA, confirma o descarta y aplica strikes (Entrega 2).     |

## Reglas de negocio

- **Precio obligatorio.** El campo no puede quedar vacío; si vale 0 la publicación se muestra como «Donación / Gratis».
- **Contacto protegido.** Teléfono y WhatsApp solo se entregan a usuarios con sesión iniciada, y cada consulta se guarda en `vistas_contacto`. El vendedor ve quién consultó cada publicación.
- **Moderación con revisión humana.** La IA no bloquea por sí sola: marca, oculta y envía a revisión. Con 3 strikes la cuenta se bloquea.

## Instalación

Requisitos: Node.js 20 o superior y PostgreSQL en ejecución.

```bash
git clone https://github.com/vctrestrada/lapulga.git
cd lapulga
npm install
cp .env.example .env      # en PowerShell: Copy-Item .env.example .env
```

Edita `.env` con tu usuario y contraseña de PostgreSQL. Después:

```bash
npm run db:setup   # crea la base "lapulga", las tablas, las categorías y el administrador
npm run db:demo    # opcional: usuarios, publicaciones con fotos, reseñas y casos de moderación de prueba
npm run ia:probar  # opcional: descarga el modelo de texto (~560 MB, solo la primera vez) y prueba los filtros
npm run dev        # http://localhost:3000
```

Si el servidor no arranca, el mensaje en consola indica la causa: contraseña de PostgreSQL incorrecta en `.env`, base de datos sin crear o servicio detenido.

El administrador inicial usa `ADMIN_EMAIL` y `ADMIN_PASSWORD` del archivo `.env`.

Los datos de prueba crean seis cuentas con la contraseña `demo1234`: `lucia`, `jorge`, `marisol` y `beto` (vendedores) y `daniel` y `karla` (compradores), todas con el dominio `@demo.lapulga.mx`. `npm run db:demo -- --reset` los borra y los vuelve a crear sin tocar los datos reales.

## Moderación con IA

Cada publicación nueva o editada pasa por tres filtros antes de mostrarse:

| Filtro | Herramienta | Marca cuando |
|---|---|---|
| 1. Términos prohibidos | Lista propia (`src/services/ia/terminos.js`) | Aparece un término o sinónimo de armas, drogas, trata de personas, servicios sexuales u otros ilícitos. Detecta acentos, mayúsculas, l3tr4s cambiadas y palabras deletreadas, e ignora frases legítimas como "pistola de silicón". |
| 2. Texto zero-shot | Transformers.js con `Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` en fp16 (la versión q8 pierde casi toda su precisión) | Una categoría prohibida supera `UMBRAL_TEXTO` y además le gana a "artículo usado común". |
| 3. Imágenes | NSFWJS (MobileNetV2) | Porn + Hentai supera `UMBRAL_NSFW`, o Sexy supera `UMBRAL_SEXY`. |

Si algún filtro marca la publicación, se guarda en `reportes_ia`, la publicación queda «oculta – en revisión» y el usuario no puede publicar hasta que el administrador decida:

- **Confirmar:** la publicación queda rechazada y el usuario recibe un strike. Con 3 strikes la cuenta se bloquea.
- **Descartar:** la publicación se aprueba y se restablece el permiso de publicar.

Los usuarios también pueden reportar publicaciones visibles, y el administrador puede ocultar algo que la IA dejó pasar. Esos casos, si se confirman, cuentan como falsos negativos. En `/admin/metricas` se calculan la precisión (VP / (VP + FP)) y la exhaustividad (VP / (VP + FN)) de la IA a partir de cada decisión.

Los filtros 2 y 3 se pueden apagar con `IA_TEXTO=0` o `IA_IMAGEN=0` en `.env`. Si un modelo falla, el error se registra en consola y la lista de términos sigue funcionando.

## Reseñas

- Calificación de 1 a 5 estrellas y comentario opcional.
- Solo se puede reseñar a alguien con quien hubo contacto: el comprador califica al vendedor cuyo teléfono consultó, y el vendedor al comprador que consultó el suyo (`vistas_contacto`).
- Una reseña por par de usuarios y publicación, editable durante 7 días.
- El perfil muestra el promedio y el número de reseñas por separado: como vendedor y como comprador.
- El comentario pasa por los mismos filtros de texto que las publicaciones; si se marca, queda oculto en revisión. Cualquier usuario puede reportar una reseña. Si el administrador confirma, la reseña se elimina y su autor recibe un strike.

## Estructura

```
lapulga/
├── database/          schema.sql y script de instalación
├── public/            css, js e imágenes estáticas
├── scripts/           prueba de los filtros de IA
├── src/
│   ├── config/        conexión a PostgreSQL
│   ├── controllers/   lógica de cada sección
│   ├── middleware/    sesión, roles, avisos y subida de imágenes
│   ├── models/        consultas SQL
│   ├── routes/        definición de rutas
│   ├── services/      moderación y filtros de IA (ia/)
│   └── utils/         validaciones y formato
├── uploads/           imágenes subidas (no se versionan)
├── views/             plantillas EJS
└── server.js
```

## Modelo de datos

| Tabla             | Campos clave                                                                              |
|-------------------|-------------------------------------------------------------------------------------------|
| usuarios          | id, nombre, email, password_hash, telefono, whatsapp, rol, strikes, bloqueado, puede_publicar |
| categorias        | id, nombre, slug                                                                          |
| publicaciones     | id, usuario_id, categoria_id, titulo, descripcion, precio, es_donacion, estado            |
| imagenes          | id, publicacion_id, ruta, orden                                                           |
| reportes_ia       | id, publicacion_id, filtro, etiqueta, puntaje, decision_admin, admin_id, fecha, reportado_por, motivo |
| vistas_contacto   | id, publicacion_id, usuario_id, fecha                                                     |
| resenas           | id, autor_id, receptor_id, publicacion_id, rol_receptor, calificacion, comentario, estado, fecha |
| reportes_resenas  | id, resena_id, filtro, etiqueta, puntaje, reportado_por, motivo, decision_admin, admin_id, fecha |

`es_donacion` es una columna calculada (`precio = 0`), así nunca puede quedar desincronizada del precio.

## Avance por entregas

- [x] **Entrega 1.** Estructura MVC, esquema completo, registro e inicio de sesión con roles, publicaciones con hasta 5 imágenes, búsqueda y filtros, regla de precio/donación, contacto protegido con registro de consultas, perfiles públicos y cuenta.
- [x] **Entrega 2.** Moderación por IA (términos prohibidos, Transformers.js zero-shot, NSFWJS), cola de revisión, strikes y bloqueo, reportes de usuarios, historial, métricas de precisión y gestión de usuarios. Estilo visual simplificado.
- [x] **Entrega 3.** Reseñas entre usuarios (1 a 5 estrellas, solo tras consultar el contacto, editables 7 días, promedio como vendedor y como comprador), moderación de reseñas, página de reglas y nuevo diseño.
