-- PROYECTO B - GRUPO 1 / PERSONA 1
-- Ejecutar al inicializar PostgreSQL 16. Todas las personas y direcciones son ficticias.
CREATE TABLE IF NOT EXISTS zonas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  habilitada BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS repartidores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  zona_id BIGINT REFERENCES zonas(id),
  capacidad_maxima INTEGER NOT NULL CHECK (capacidad_maxima > 0),
  carga_actual INTEGER NOT NULL DEFAULT 0 CHECK (carga_actual >= 0),
  disponible BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_capacidad CHECK (carga_actual <= capacidad_maxima)
);

CREATE TABLE IF NOT EXISTS envios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  remitente VARCHAR(120) NOT NULL,
  destinatario VARCHAR(120) NOT NULL,
  direccion_origen VARCHAR(250) NOT NULL,
  direccion_destino VARCHAR(250) NOT NULL,
  zona_origen_id BIGINT NOT NULL REFERENCES zonas(id),
  zona_destino_id BIGINT NOT NULL REFERENCES zonas(id),
  tipo_servicio VARCHAR(20) NOT NULL CHECK (tipo_servicio IN ('estandar', 'express')),
  creado_por_usuario VARCHAR(60) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  aceptado BOOLEAN NOT NULL DEFAULT FALSE,
  aceptado_en TIMESTAMPTZ,
  aceptado_por VARCHAR(60),
  estado VARCHAR(20) NOT NULL DEFAULT 'creado'
    CHECK (estado IN ('creado','asignado','retirado','en_transito','incidencia','entregado','cancelado')),
  clave_idempotencia VARCHAR(120) UNIQUE,
  solicitud_hash CHAR(64),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asignaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  envio_id BIGINT NOT NULL REFERENCES envios(id),
  repartidor_id BIGINT NOT NULL REFERENCES repartidores(id),
  estado VARCHAR(20) NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa','reasignada','liberada','finalizada','cancelada')),
  asignada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cerrada_en TIMESTAMPTZ
);

-- Invariante adicional: un mismo envío tiene a lo sumo una asignación activa.
CREATE UNIQUE INDEX IF NOT EXISTS ux_asignacion_activa_por_envio
  ON asignaciones (envio_id) WHERE estado = 'activa';
CREATE INDEX IF NOT EXISTS ix_asignaciones_repartidor_estado
  ON asignaciones (repartidor_id, estado);
CREATE INDEX IF NOT EXISTS ix_envios_estado_fecha
  ON envios (estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_envios_zona_estado
  ON envios (zona_destino_id, estado);

-- Tabla de salida transaccional para proyecciones en MongoDB (persona 2).
CREATE TABLE IF NOT EXISTS eventos_salida (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envio_id BIGINT NOT NULL REFERENCES envios(id),
  codigo_envio VARCHAR(30) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  datos JSONB NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  procesado_en TIMESTAMPTZ,
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0)
);
CREATE INDEX IF NOT EXISTS ix_eventos_pendientes
  ON eventos_salida (creado_en, id) WHERE procesado_en IS NULL;

CREATE TABLE IF NOT EXISTS usuarios_demo (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario VARCHAR(60) NOT NULL UNIQUE,
  clave_hash VARCHAR(100) NOT NULL,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('cliente','operador','repartidor','administrador')),
  repartidor_id BIGINT REFERENCES repartidores(id),
  CONSTRAINT ck_usuario_repartidor CHECK (rol <> 'repartidor' OR repartidor_id IS NOT NULL)
);
