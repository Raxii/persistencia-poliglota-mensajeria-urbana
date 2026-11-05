# Entrega a Persona 3: integración Docker Compose

Persona 3 debe conservar el servicio `postgres` existente y agregar MongoDB y Redis a la misma red interna. La API necesita recibir las siguientes variables dentro del contenedor:

```yaml
MONGODB_URI: mongodb://mongo:27017/mensajeria
MONGODB_DB: mensajeria
REDIS_URL: redis://redis:6379
```

Servicios mínimos que debe agregar al `docker-compose.yml`:

```yaml
  mongo:
    image: mongo:7
    volumes:
      - datos_mongo:/data/db
    networks:
      - interna
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 5s
      timeout: 5s
      retries: 15

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - datos_redis:/data
    networks:
      - interna
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 15
```

Agregar a `volumes`:

```yaml
  datos_mongo:
  datos_redis:
```

En `api.environment`, agregar las tres variables indicadas y en `api.depends_on` esperar a que `mongo` y `redis` estén `service_healthy`. No publicar `27017` ni `6379` al host. La API ya inicia Persona 2 automáticamente cuando existen `MONGODB_URI` y `REDIS_URL`.

**Importante:** no ejecutar varias réplicas de la API con el sincronizador activo en esta entrega; se asume un único consumidor. Para una arquitectura multiinstancia se deberá añadir reclamación/lease de eventos en PostgreSQL.

## Infraestructura Docker independiente (actualizada)

Los gestores y la API se ejecutan como cuatro proyectos Docker Compose distintos. Cada Compose se encuentra en su carpeta `PROYECTO_POSTGRES`, `PROYECTO_MONGO`, `PROYECTO_REDIS` y `PROYECTO_API`. Los cuatro se conectan a la red externa `proyecto-red`.

Desde el contenedor de API, usar estos hosts y puertos internos (no `localhost`):

- PostgreSQL: `postgres-db:5432`, base `mensajeria`, usuario `mensajeria`.
- MongoDB: `mongo-db:27017`, base `mensajeria`.
- Redis: `redis-db:6379`.

Para herramientas instaladas en Windows, los puertos publicados son PostgreSQL `localhost:5433`, MongoDB `localhost:27018` y Redis `localhost:6380`; API `localhost:3000`.
