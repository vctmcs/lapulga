# La Pulga

Marketplace web de artículos usados y donaciones con moderación asistida por IA. Los usuarios publican lo que venden o regalan; el contacto se hace por teléfono o WhatsApp (sin chat interno) y solo es visible para usuarios registrados.

## Stack

- Node.js 20+ con Express 5
- PostgreSQL
- EJS como motor de vistas, CSS y JavaScript propios (sin frameworks de interfaz)
- Multer para la subida de imágenes
- express-session con sesiones guardadas en PostgreSQL (connect-pg-simple)
- IA gratuita y local (Entrega 2): lista de términos prohibidos, Transformers.js (zero-shot) y NSFWJS

## Roles

| Rol           | Qué puede hacer                                                                  |
|---------------|----------------------------------------------------------------------------------|
| Visitante     | Navega y busca publicaciones. No ve datos de contacto.                           |
| Comprador     | Tiene perfil y ve teléfono/WhatsApp de los vendedores. Puede volverse vendedor.  |
| Vendedor      | Publica, edita, marca como vendida/entregada y elimina sus publicaciones.        |
| Administrador | Revisa lo que marca la IA, confirma o descarta y aplica strikes (Entrega 2).     |

## Reglas de negocio

- **Precio obligatorio.** El campo no puede quedar vacío; si vale 0 la publicación se muestra como «Donación / Gratis».
- **Contacto protegido.** Teléfono y WhatsApp solo se entregan a usuarios con sesión iniciada, y cada consulta se guarda en `vistas_contacto`.
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
npm run dev        # http://localhost:3000
```

El administrador inicial usa `ADMIN_EMAIL` y `ADMIN_PASSWORD` del archivo `.env`.

## Estructura

```
lapulga/
├── database/          schema.sql y script de instalación
├── public/            css, js e imágenes estáticas
├── src/
│   ├── config/        conexión a PostgreSQL
│   ├── controllers/   lógica de cada sección
│   ├── middleware/    sesión, roles, avisos y subida de imágenes
│   ├── models/        consultas SQL
│   ├── routes/        definición de rutas
│   ├── services/      moderación (filtros de IA)
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
| reportes_ia       | id, publicacion_id, filtro, etiqueta, puntaje, decision_admin, admin_id, fecha            |
| vistas_contacto   | id, publicacion_id, usuario_id, fecha                                                     |
| resenas           | id, autor_id, receptor_id, publicacion_id, rol_receptor, calificacion, comentario, fecha  |

`es_donacion` es una columna calculada (`precio = 0`), así nunca puede quedar desincronizada del precio.

## Avance por entregas

- [x] **Entrega 1.** Estructura MVC, esquema completo, registro e inicio de sesión con roles, publicaciones con hasta 5 imágenes, búsqueda y filtros, regla de precio/donación, contacto protegido con registro de consultas, perfiles públicos y cuenta.
- [ ] **Entrega 2.** Moderación por IA (términos prohibidos, Transformers.js zero-shot, NSFWJS), panel del administrador, strikes, bloqueo y métricas de precisión.
- [ ] **Entrega 3.** Reseñas entre usuarios (1 a 5 estrellas, solo tras consultar el contacto, editables 7 días, promedio como vendedor y como comprador).
