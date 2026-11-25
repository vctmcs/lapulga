-- La Pulga · esquema PostgreSQL
-- Se puede ejecutar varias veces: solo crea lo que falta.

CREATE TABLE IF NOT EXISTS categorias (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60)  NOT NULL UNIQUE,
  slug    VARCHAR(60)  NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,
  telefono       VARCHAR(20),
  whatsapp       VARCHAR(20),
  rol            VARCHAR(12)  NOT NULL DEFAULT 'comprador'
                 CHECK (rol IN ('admin', 'vendedor', 'comprador')),
  strikes        SMALLINT     NOT NULL DEFAULT 0 CHECK (strikes >= 0),
  bloqueado      BOOLEAN      NOT NULL DEFAULT FALSE,
  puede_publicar BOOLEAN      NOT NULL DEFAULT TRUE,  -- se apaga mientras una publicación está en revisión
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS publicaciones (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_id   INTEGER      REFERENCES categorias(id) ON DELETE SET NULL,
  titulo         VARCHAR(120) NOT NULL,
  descripcion    TEXT         NOT NULL,
  precio         NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  es_donacion    BOOLEAN      GENERATED ALWAYS AS (precio = 0) STORED,
  estado         VARCHAR(12)  NOT NULL DEFAULT 'publicada'
                 CHECK (estado IN ('publicada', 'en_revision', 'rechazada', 'vendida', 'eliminada')),
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_publicaciones_estado ON publicaciones(estado);
CREATE INDEX IF NOT EXISTS idx_publicaciones_usuario ON publicaciones(usuario_id);

CREATE TABLE IF NOT EXISTS imagenes (
  id              SERIAL PRIMARY KEY,
  publicacion_id  INTEGER      NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  ruta            VARCHAR(255) NOT NULL,
  orden           SMALLINT     NOT NULL DEFAULT 0
);

-- Resultado de cada filtro de IA y reportes manuales (usuario/admin) para medir falsos negativos
CREATE TABLE IF NOT EXISTS reportes_ia (
  id              SERIAL PRIMARY KEY,
  publicacion_id  INTEGER      NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  filtro          VARCHAR(20)  NOT NULL CHECK (filtro IN ('terminos', 'texto_zero_shot', 'imagen_nsfw', 'usuario', 'manual')),
  etiqueta        VARCHAR(80)  NOT NULL,
  puntaje         NUMERIC(5,4) NOT NULL DEFAULT 0,
  decision_admin  VARCHAR(12)  CHECK (decision_admin IN ('confirmada', 'descartada')),
  admin_id        INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  fecha_decision  TIMESTAMPTZ
);

-- Cada vez que un usuario con sesión consulta el contacto de una publicación
CREATE TABLE IF NOT EXISTS vistas_contacto (
  id              SERIAL PRIMARY KEY,
  publicacion_id  INTEGER     NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  usuario_id      INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vistas_contacto_par ON vistas_contacto(publicacion_id, usuario_id);

-- Reseñas (se usa en la Entrega 3)
CREATE TABLE IF NOT EXISTS resenas (
  id              SERIAL PRIMARY KEY,
  autor_id        INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  receptor_id     INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  publicacion_id  INTEGER     NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  rol_receptor    VARCHAR(10) NOT NULL CHECK (rol_receptor IN ('vendedor', 'comprador')),
  calificacion    SMALLINT    NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentario      TEXT,
  oculta          BOOLEAN     NOT NULL DEFAULT FALSE,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  editada_en      TIMESTAMPTZ,
  CONSTRAINT resena_unica UNIQUE (autor_id, receptor_id, publicacion_id),
  CONSTRAINT resena_no_propia CHECK (autor_id <> receptor_id)
);

-- ===== Entrega 2: ajustes sobre bases creadas con la Entrega 1 =====
ALTER TABLE reportes_ia DROP CONSTRAINT IF EXISTS reportes_ia_filtro_check;
ALTER TABLE reportes_ia ADD CONSTRAINT reportes_ia_filtro_check
  CHECK (filtro IN ('terminos', 'texto_zero_shot', 'imagen_nsfw', 'usuario', 'manual'));
ALTER TABLE reportes_ia ADD COLUMN IF NOT EXISTS reportado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE reportes_ia ADD COLUMN IF NOT EXISTS motivo VARCHAR(300);
CREATE INDEX IF NOT EXISTS idx_reportes_pendientes ON reportes_ia(publicacion_id) WHERE decision_admin IS NULL;
