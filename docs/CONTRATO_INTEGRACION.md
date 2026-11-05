# Grupo 1 — Contrato técnico de integración entre personas

## Límite de módulos

**Persona 1 (entregado):** PostgreSQL 16 como **source of truth** de `envios.estado`, `asignaciones`, `repartidores.carga_actual`; API Express y `eventos_salida` transaccional para registrar cambios.

**Persona 2 (implementada en `src/persona2.js`):** consumidor del outbox que proyecta historial en MongoDB; evidencias ficticias en MongoDB; última posición simulada en Redis con TTL. Las rutas se montan en la misma API Express después de la autenticación común.

**Persona 3 (pendiente):** pantallas funcionales, integración de los endpoints, contenedores de MongoDB/Redis y sus volúmenes, diseño final Compose, pruebas desde la web y captura de evidencias.

## Contrato oficial sobre estado de envío

El frontend **no escribe directamente** ni en PostgreSQL, ni MongoDB, ni Redis: llama a la API REST.

1. El cliente crea envío mediante `POST /api/envios` con clave idempotente.
2. El operador acepta mediante `POST /api/envios/:codigo/aceptar` y después asigna con `POST /api/asignaciones` (control atómico del cupo).
3. El repartidor marca `PATCH /api/envios/:codigo/estado` con `{"estado":"retirado"}`, luego `en_transito`, opcionalmente `incidencia`, y por último `entregado`.
4. La API confirma transacción PostgreSQL, incluyendo un evento persistente en `eventos_salida`.
5. La Persona 2 lee eventos pendientes y los inserta idempotentemente en MongoDB.
6. Solo después de persistir en MongoDB, la Persona 2 marca el evento como procesado.
7. El frontend presenta `envios.estado` como vigente y la lista de MongoDB como historial derivado, señalando que puede existir retraso.

**Nunca asumir ACID distribuido** entre PostgreSQL y MongoDB. No marcar `procesado_en` antes de confirmar MongoDB.

## Esquema contractual del outbox

Tabla `eventos_salida`:

| Columna | Significado |
| --- | --- |
| `id` | UUID único de evento; usar como clave única en MongoDB |
| `envio_id` | ID numérico interno |
| `codigo_envio` | ID de negocio compartido `ENV-...` |
| `tipo` | Por ejemplo `envio.creado`, `envio.asignado`, `envio.estado_actualizado` |
| `datos` | JSONB con `codigo_envio`, `version`, `estado`, `actor` y `detalle` |
| `creado_en` | Timestamp del evento |
| `procesado_en` | NULL mientras falte proyectarlo |
| `intentos` | Contador reservado para el sincronizador |

**Ejemplo de documento derivado MongoDB (propuesta):**

```json
{
  "_id": "UUID_RECIBIDO_DEL_EVENTO",
  "codigo_envio": "ENV-ABCD1234",
  "version": 3,
  "tipo": "envio.estado_actualizado",
  "estado": "retirado",
  "actor": {"usuario": "repartidor_demo", "rol": "repartidor"},
  "detalle": {"anterior": "asignado", "nuevo": "retirado"},
  "creado_en": "2026-10-27T19:00:00.000Z"
}
```

**Lectura segura por versión:** dentro de cada envío, ordenar por `datos.version` (no por UUID). Si se reconstruye una colección `resumen_envios`, actualizar solo cuando `version` sea mayor que la versión ya proyectada. El historial es insert-only por `id` para tolerar reintentos.

**Consulta SQL sugerida para la Persona 2:**

```sql
SELECT id, codigo_envio, tipo, datos, creado_en
FROM eventos_salida
WHERE procesado_en IS NULL
ORDER BY creado_en, id
LIMIT 100;
```

Tras inserción confirmada en MongoDB:

```sql
UPDATE eventos_salida
SET procesado_en = NOW(), intentos = intentos + 1
WHERE id = $1 AND procesado_en IS NULL;
```

Si falla MongoDB, se dejan los eventos pendientes para posterior reintento. Para varios consumidores simultáneos se debe implementar un **mecanismo de reclamación** (por ejemplo `FOR UPDATE SKIP LOCKED` más estados de procesamiento); el SQL simple anterior solo es apropiado para **un** consumidor. Conviene incorporar políticas de reintento, errores permanentes y monitorización.

## Evidencias de entrega (Persona 2)

La confirmación oficial `entregado` la realiza PostgreSQL. La evidencia simulada se asocia por `codigo_envio` en MongoDB y debe mantener su estado de disponibilidad. No garantizar atomicidad interbase: permitir estado `evidencia_pendiente` y reintento. No usar fotos reales ni datos personales.

## Endpoints a incorporar

| Propietario | Endpoint propuesto | Estado |
| --- | --- | --- |
| Persona 1 | `POST /api/envios`, `GET /api/envios`, `GET /api/envios/:codigo` | Implementado |
| Persona 1 | `POST /api/envios/:codigo/aceptar` | Implementado |
| Persona 1 | `POST /api/asignaciones`, reasignar, liberar, cancelar | Implementado |
| Persona 1 | `PATCH /api/envios/:codigo/estado` | Implementado: mutación oficial + outbox |
| Persona 2 | `GET /api/envios/:codigo/historial` | Implementado en `src/persona2.js` |
| Persona 2 | `POST /api/envios/:codigo/evidencia`, `GET /api/envios/:codigo/evidencia` | Implementado en `src/persona2.js` |
| Persona 2 | `POST/GET /api/repartidores/:id/posicion-temporal` | Implementado en `src/persona2.js` |
| Persona 3 | Formularios/paneles web | Pendiente |

## Docker Compose

El Compose incluido solo levanta PostgreSQL + API para pruebas de la parte 1. Agregar MongoDB y Redis en la misma red `interna`, con volúmenes según su durabilidad. No abrir sus puertos al exterior. La Persona 3 puede actualizar el `Dockerfile` y `docker-compose.yml`, conservando variables seguras en `.env`.

## Reglas de respuesta compartidas
- `200`: lectura, repetición válida o cambio realizado.
- `201`: recurso creado.
- `400`: solicitud mal formada.
- `401`: token ausente/inválido.
- `403`: permiso insuficiente.
- `404`: recurso no encontrado.
- `409`: conflicto de estado, duplicado, idempotencia o capacidad.
- `500`: error interno.

Todos los cuerpos de error tienen `{"error":"mensaje"}`. No mostrar mensajes internos SQL al navegador.


## Implementación Persona 2

- Colección MongoDB `historial_envios`: `_id` es el UUID de `eventos_salida`; `codigo_envio`, `version`, `tipo`, `estado`, `actor`, `detalle`, `creado_en`.
- Colección MongoDB `evidencias_entrega`: una evidencia ficticia por envío, con receptor, observación, referencia simulada, actor, fecha y clave idempotente.
- Índices: único `{codigo_envio, version}` para historial; `{codigo_envio, creado_en}` para lectura; único `{codigo_envio}` para evidencia.
- Redis: clave `repartidor:<id>:posicion`, JSON con coordenadas ficticias, estado y fecha; TTL de 120 segundos. La ausencia/expiración devuelve 404 y no afecta a PostgreSQL.
- El consumidor inserta con `upsert` idempotente y marca `procesado_en` solo después de confirmar MongoDB. Si MongoDB falla, aumenta `intentos` y deja el evento pendiente.
- El consumidor incluido se ejecuta dentro de una instancia de API. Para esta entrega debe existir una sola instancia activa del consumidor; el upsert protege reintentos, pero no se configura un sistema de leases multiworker.
- `POST /api/envios/:codigo/evidencia` solo admite envíos cuyo estado oficial en PostgreSQL sea `entregado`. Requiere `Idempotency-Key`; la referencia es simulada, no se carga una fotografía real.
- La API activa Persona 2 únicamente cuando están definidas `MONGODB_URI` y `REDIS_URL`. Sin estas variables, Persona 1 puede ejecutarse aislada.
