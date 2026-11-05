# Grupo 1 — Personas 1 y 2: proyectos Docker independientes

## Arquitectura

Hay CUATRO proyectos Docker Compose independientes:

1. `PROYECTO_POSTGRES`: un contenedor PostgreSQL 16.
2. `PROYECTO_MONGO`: un contenedor MongoDB 7.
3. `PROYECTO_REDIS`: un contenedor Redis 7.
4. `PROYECTO_API`: un contenedor Node.js/Express.

Cada proyecto tiene su propio `docker-compose.yml`. Ningún gestor de base de datos comparte contenedor con otro. Los proyectos se comunican por una red Docker externa compartida llamada `proyecto-red`, usando los nombres DNS `postgres-db`, `mongo-db` y `redis-db`.

## Inicio en Windows

1. Descomprime todo el ZIP en una carpeta.
2. Abre Docker Desktop y espera a que indique que está iniciado.
3. Abre PowerShell en la carpeta raíz `Entrega_Grupo1_Personas1y2_INDEPENDIENTES`.
4. Ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\INICIAR_TODO.ps1
```

El script crea la red, levanta cada gestor desde su propio Compose, espera los healthchecks y finalmente levanta la API desde su propio Compose. La primera ejecución descarga imágenes y construye la API.

## Comprobar contenedores

```powershell
docker ps --filter "name=proyecto-"
```

Deben aparecer `proyecto-postgres`, `proyecto-mongo`, `proyecto-redis` y `proyecto-api` como contenedores separados.

## Probar servicios

En el navegador abre `http://localhost:3000/health`. La respuesta esperada incluye `api`, `postgres`, `mongodb` y `redis` con valor `ok`.

En PowerShell, desde la carpeta raíz:

```powershell
docker compose -f .\PROYECTO_API\docker-compose.yml exec api npm run seed
docker compose -f .\PROYECTO_API\docker-compose.yml exec api npm test
docker compose -f .\PROYECTO_API\docker-compose.yml exec api npm run smoke
```

## Conexión de herramientas gráficas

- MongoDB Compass: `mongodb://localhost:27018`
- PostgreSQL: host `localhost`, puerto `5433`, base `mensajeria`, usuario `mensajeria`, contraseña `clave_local_demo`.
- Redis: host `localhost`, puerto `6380`.

Los puertos publicados están enlazados a `127.0.0.1`, por lo que son accesibles desde el propio computador y no se exponen a la red local.

## Detener sin borrar datos

```powershell
.\DETENER_TODO.ps1
```

Esto detiene y elimina contenedores/redes de cada Compose, pero conserva los volúmenes de datos. NO uses `docker compose down -v` si quieres conservarlos.

## Reinicializar completamente (BORRA DATOS)

Solo si deseas borrar todos los datos de laboratorio, ejecuta `docker compose down -v` por separado en cada carpeta de proyecto. No es necesario para el uso normal.

## Notas técnicas

- PostgreSQL ejecuta `db/001_schema.sql` al inicializar por primera vez su volumen.
- Si el volumen PostgreSQL ya contiene datos, el script SQL de inicialización no se vuelve a ejecutar automáticamente.
- MongoDB no requiere usuario/contraseña en este laboratorio local; Compass se conecta por el puerto 27018.
- La API usa la red interna para conectarse a `postgres-db:5432`, `mongo-db:27017` y `redis-db:6379`; no debe usar `localhost` para estas conexiones desde el contenedor.
- Los servicios de datos se pueden levantar y probar individualmente, pero la API requiere que los tres estén conectados para que `/health` reporte los cuatro servicios.
