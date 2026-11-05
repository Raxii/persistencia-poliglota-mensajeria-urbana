# Proyecto B — Persistencia políglota para mensajería urbana

> **Universidad de las Fuerzas Armadas ESPE**  
> **Asignatura:** Modelado avanzado de bases de datos  
> **Caso:** Registro de envíos, despacho y seguimiento  
> **Grupo:**01
> **Integrantes:** Byron Aguilar,Santiago Nogales, Mateo Chanataxi 
> **Docente:**  Magi Paul Díaz Zúñiga

## 1. Descripción

Aplicación web académica para simular la operación de una empresa de mensajería urbana. Permite registrar envíos con datos ficticios, aceptar solicitudes, asignar repartidores, controlar su capacidad, actualizar los estados del envío, consultar la trazabilidad y registrar una evidencia de entrega simulada.

La solución implementa persistencia políglota: utiliza PostgreSQL, MongoDB y Redis porque cada tecnología atiende un tipo de dato y un patrón de acceso diferente. El frontend se comunica exclusivamente con una API REST; el navegador no se conecta directamente a las bases de datos.

**Alcance académico:** los nombres, direcciones, destinatarios, coordenadas y evidencias son ficticios. No se integra GPS real, pagos ni fotografías reales.

## 2. Arquitectura

La solución está organizada en **cinco proyectos Docker Compose independientes**. No existe un único `docker-compose.yml` en la raíz: el script `INICIAR_TODO.ps1` coordina el arranque de los cinco proyectos.

| Componente       | Tecnología           | Contenedor          | Puerto local |
|:-----------------|:---------------------|:--------------------|-------------:|
| Base relacional  | PostgreSQL 16        | `proyecto-postgres` |       `5433` |
| Base documental  | MongoDB 7            | `proyecto-mongo`    |      `27018` |
| Datos temporales | Redis 7              | `proyecto-redis`    |       `6380` |
| API REST         | Node.js + Express    | `proyecto-api`      |       `3000` |
| Interfaz web     | React + Vite + Nginx | `proyecto-frontend` |       `8080` |

Los cinco contenedores se comunican mediante la red Docker externa `proyecto-red`. La API utiliza los nombres DNS internos `postgres-db`, `mongo-db` y `redis-db`, junto con los puertos internos de cada gestor.

``` text
Usuario
   |
   v
Frontend React / Nginx  (http://localhost:8080)
   |
   v
API REST Node.js / Express  (http://localhost:3000)
   |
   +-------------------+-------------------+
   |                   |                   |
   v                   v                   v
PostgreSQL           MongoDB             Redis
estado oficial       historial y         posición simulada
y transacciones      evidencia           con TTL de 120 s
```

### Responsabilidad y fuente oficial de cada dato

| Dominio                  | Gestor     | Responsabilidad                                                                            |
|:-------------------------|:-----------|:-------------------------------------------------------------------------------------------|
| Solicitudes y envíos     | PostgreSQL | Código, remitente, destinatario, direcciones ficticias, tipo de servicio y estado vigente. |
| Despacho y asignaciones  | PostgreSQL | Repartidores, disponibilidad, carga, capacidad y asignación activa.                        |
| Eventos de salida        | PostgreSQL | Registro transaccional de eventos pendientes de proyectar.                                 |
| Historial de seguimiento | MongoDB    | Proyección documental de los cambios de estado, ordenados por versión.                     |
| Evidencias de entrega    | MongoDB    | Receptor ficticio, observación y referencia simulada de evidencia.                         |
| Posición temporal        | Redis      | Última posición simulada del repartidor, con expiración de 120 segundos.                   |

**Source of Truth:** PostgreSQL es la fuente oficial del estado del envío y de las asignaciones. El historial de MongoDB es una proyección derivada; Redis contiene información temporal y su ausencia no cambia el estado oficial del envío.

### Sincronización con Transactional Outbox

Cuando una operación modifica el estado del envío, la API actualiza PostgreSQL e inserta el evento correspondiente en `eventos_salida` dentro de la misma transacción local. Un consumidor proyecta el evento en MongoDB de forma idempotente y marca `procesado_en` únicamente después de confirmar la escritura documental.

Si MongoDB no está disponible, el evento permanece pendiente en PostgreSQL para su posterior reintento. No se presupone una transacción ACID distribuida entre PostgreSQL y MongoDB.

## 3. Funcionalidades

- Inicio de sesión con roles de cliente, operador, repartidor y administrador.
- Registro de solicitudes de envío con código único.
- Consulta de envíos y seguimiento por código.
- Aceptación de solicitudes por el operador.
- Asignación, reasignación y liberación de repartidores.
- Control de capacidad del repartidor.
- Actualización de estados: `creado`, `asignado`, `retirado`, `en_transito`, `incidencia`, `entregado` y `cancelado`, de acuerdo con las reglas de negocio.
- Historial documental de eventos.
- Registro y consulta de evidencia de entrega ficticia.
- Actualización y consulta de posición simulada con TTL de 120 segundos.
- Validación de permisos en la API y mensajes de error en la interfaz.

## 4. Requisitos previos

Para ejecutar el proyecto en Windows se requiere:

- Windows 10/11.
- Docker Desktop iniciado y con Docker Engine disponible.
- Docker Compose v2 (incluido en Docker Desktop).
- PowerShell.
- Navegador web actualizado.

Para ejecutar las pruebas end-to-end desde el frontend también se requiere Node.js 20 o superior y Google Chrome instalado. MongoDB Compass y un cliente PostgreSQL son opcionales para inspeccionar los datos.

## 5. Inicio rápido en Windows

### 5.1 Obtener el proyecto

Clona el repositorio o descarga el ZIP y extrae su contenido. La carpeta raíz debe contener directamente:

``` text
PROYECTO_POSTGRES/
PROYECTO_MONGO/
PROYECTO_REDIS/
PROYECTO_API/
PROYECTO_FRONTEND/
docs/
INICIAR_TODO.ps1
DETENER_TODO.ps1
ESTADO.ps1
README.md
```

### 5.2 Iniciar los cinco proyectos

1.  Abre Docker Desktop y espera a que Docker Engine esté iniciado.
2.  Abre PowerShell en la carpeta raíz del proyecto.
3.  Ejecuta:

``` powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
Unblock-File .\INICIAR_TODO.ps1
.\INICIAR_TODO.ps1
```

El script crea o reutiliza la red `proyecto-red`, prepara `PROYECTO_API/.env` si no existe, genera un secreto JWT aleatorio, inicia los cinco Compose por separado, espera los healthchecks, aplica el esquema SQL, carga las cuentas ficticias y levanta el frontend.

El script **no elimina los volúmenes ni los datos existentes**.

### 5.3 Comprobar el estado

``` powershell
docker ps --filter "name=proyecto-"
.\ESTADO.ps1
```

Deben aparecer los cinco contenedores:

- `proyecto-postgres`
- `proyecto-mongo`
- `proyecto-redis`
- `proyecto-api`
- `proyecto-frontend`

Comprobar la salud de la API desde el navegador:

<http://localhost:3000/health>

La respuesta debe incluir los componentes disponibles (`api`, `postgres`, `mongodb` y `redis`) con estado `ok`.

### 5.4 Acceder a la aplicación

- **Frontend:** <http://localhost:8080>
- **API:** <http://localhost:3000>
- **Salud de la API:** <http://localhost:3000/health>

## 6. Cuentas y credenciales ficticias

Las cuentas de demostración se cargan mediante el script de semilla de la API.

| Usuario           | Rol           | Contraseña de laboratorio |
|:------------------|:--------------|:--------------------------|
| `cliente_demo`    | Cliente       | `Demo2026!`               |
| `operador_demo`   | Operador      | `Demo2026!`               |
| `repartidor_demo` | Repartidor    | `Demo2026!`               |
| `admin_demo`      | Administrador | `Demo2026!`               |

Conexión local de PostgreSQL:

| Parámetro                 | Valor              |
|:--------------------------|:-------------------|
| Host                      | `localhost`        |
| Puerto                    | `5433`             |
| Base de datos             | `mensajeria`       |
| Usuario                   | `mensajeria`       |
| Contraseña de laboratorio | `clave_local_demo` |

MongoDB Compass:

``` text
mongodb://localhost:27018
```

Redis:

``` text
localhost:6380
```

Estas credenciales son exclusivamente ficticias y para el laboratorio local. No deben reutilizarse en producción. El script de inicio genera el `JWT_SECRET` de la API cuando crea por primera vez el archivo `.env`.

**Seguridad del repositorio:** se debe subir `.env.example`, pero no los archivos `.env` reales. El `.gitignore` del proyecto excluye esos archivos. No publicar tokens, contraseñas personales ni datos reales.

## 7. Puertos y configuración

Los puertos publicados están enlazados a `127.0.0.1`, por lo que los servicios de datos se exponen únicamente en el equipo local.

| Servicio   | Dirección local         |
|:-----------|:------------------------|
| Frontend   | `http://localhost:8080` |
| API        | `http://localhost:3000` |
| PostgreSQL | `localhost:5433`        |
| MongoDB    | `localhost:27018`       |
| Redis      | `localhost:6380`        |

La configuración de la API se documenta en `PROYECTO_API/.env.example`. El frontend utiliza `PROYECTO_FRONTEND/.env.example`. El script de inicio crea el `.env` de la API si no existe. Si se modifica la configuración, se debe reiniciar el servicio correspondiente.

## 8. API REST

Todas las operaciones de negocio se realizan a través de la API. Las rutas `/api` requieren autenticación Bearer, salvo el endpoint de salud y el inicio de sesión.

| Método  | Endpoint                                  | Propósito                              |
|:--------|:------------------------------------------|:---------------------------------------|
| `GET`   | `/health`                                 | Estado de la API y sus dependencias.   |
| `POST`  | `/api/auth/login`                         | Inicio de sesión.                      |
| `GET`   | `/api/zonas`                              | Consultar zonas.                       |
| `GET`   | `/api/repartidores`                       | Consultar repartidores.                |
| `POST`  | `/api/repartidores`                       | Registrar repartidor.                  |
| `PATCH` | `/api/repartidores/:id`                   | Actualizar disponibilidad o capacidad. |
| `POST`  | `/api/envios`                             | Registrar envío.                       |
| `GET`   | `/api/envios`                             | Consultar envíos.                      |
| `GET`   | `/api/envios/:codigo`                     | Consultar un envío.                    |
| `POST`  | `/api/envios/:codigo/aceptar`             | Aceptar solicitud.                     |
| `POST`  | `/api/asignaciones`                       | Crear asignación.                      |
| `PATCH` | `/api/asignaciones/:id/reasignar`         | Reasignar envío.                       |
| `POST`  | `/api/asignaciones/:id/liberar`           | Liberar asignación.                    |
| `PATCH` | `/api/envios/:codigo/estado`              | Actualizar estado del envío.           |
| `POST`  | `/api/envios/:codigo/cancelar`            | Cancelar envío según reglas.           |
| `GET`   | `/api/envios/:codigo/historial`           | Consultar historial documental.        |
| `POST`  | `/api/envios/:codigo/evidencia`           | Registrar evidencia ficticia.          |
| `GET`   | `/api/envios/:codigo/evidencia`           | Consultar evidencia.                   |
| `POST`  | `/api/repartidores/:id/posicion-temporal` | Actualizar posición simulada.          |
| `GET`   | `/api/repartidores/:id/posicion-temporal` | Consultar posición temporal.           |

La API valida autenticación, roles, estados, capacidad e idempotencia. Los códigos HTTP utilizados incluyen `200`, `201`, `400`, `401`, `403`, `404`, `409` y `500`; la indisponibilidad del servicio temporal Redis se comunica como `503`.

## 9. Pruebas

Las pruebas se deben ejecutar con los contenedores iniciados.

### 9.1 Pruebas unitarias de la API

Desde PowerShell, en la raíz:

``` powershell
docker compose -f .\PROYECTO_API\docker-compose.yml exec -T api npm test
```

### 9.2 Prueba funcional (smoke)

``` powershell
docker compose -f .\PROYECTO_API\docker-compose.yml exec -T api npm run smoke
```

### 9.3 Prueba end-to-end desde el frontend

Desde PowerShell:

``` powershell
cd .\PROYECTO_FRONTEND
npm install
$env:BASE_URL="http://localhost:8080"
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run e2e
```

Si Chrome está instalado en otra ubicación, ajustar `CHROME_PATH`. La prueba recorre el flujo de cliente, operador y repartidor y genera capturas en la carpeta `capturas/`.

Los comandos anteriores describen cómo ejecutar las pruebas; los resultados deben reportarse según la ejecución real en el equipo de entrega.

### 9.4 Pruebas de fallos y recuperación para la defensa

El enunciado solicita demostrar una situación de fallo o concurrencia y explicar consistencia y recuperación. Para esta solución se pueden documentar y ejecutar, en un entorno local de demostración:

- Indisponibilidad de Redis y recuperación del servicio; comprobar el comportamiento de la posición temporal y su TTL.
- Indisponibilidad de MongoDB; verificar que el evento permanece pendiente en `eventos_salida` de PostgreSQL y que se proyecta después de recuperar MongoDB.
- Persistencia de MongoDB tras recrear el contenedor sin eliminar el volumen.

No declarar estas pruebas como satisfactorias hasta ejecutarlas y guardar las evidencias correspondientes.

## 10. Detener, reiniciar y conservar datos

### Detener sin borrar los datos

Desde la raíz:

``` powershell
.\DETENER_TODO.ps1
```

También se puede detener cada Compose por separado con `docker compose down`. El comando `down` sin `-v` elimina contenedores y redes administradas por Compose, pero conserva los volúmenes nombrados.

### Reiniciar

Para volver a levantar los servicios:

``` powershell
.\INICIAR_TODO.ps1
```

### Advertencia sobre la eliminación de datos

**No utilizar `docker compose down -v` si se desea conservar la información.** La opción `-v` elimina los volúmenes asociados y puede borrar permanentemente los datos de PostgreSQL, MongoDB y Redis.

Los volúmenes persistentes utilizados son:

- `proyecto_postgres_data`
- `proyecto_mongo_data`
- `proyecto_redis_data`

## 11. Estructura del repositorio

``` text
.
├── PROYECTO_POSTGRES/
│   ├── Dockerfile
│   └── docker-compose.yml
├── PROYECTO_MONGO/
│   ├── Dockerfile
│   └── docker-compose.yml
├── PROYECTO_REDIS/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── redis.conf
├── PROYECTO_API/
│   ├── db/
│   ├── scripts/
│   ├── src/
│   ├── tests/
│   ├── .env.example
│   ├── Dockerfile
│   └── docker-compose.yml
├── PROYECTO_FRONTEND/
│   ├── capturas/
│   ├── e2e/
│   ├── src/
│   ├── .env.example
│   ├── Dockerfile
│   └── docker-compose.yml
├── docs/
│   ├── CONTRATO_INTEGRACION.md
│   ├── GUIA_PERSONA3.md
│   ├── INTEGRACION_PERSONA3.md
│   └── PRUEBAS_PERSONA*.http
├── INICIAR_TODO.ps1
├── DETENER_TODO.ps1
├── ESTADO.ps1
├── ESTRUCTURA_SERVICIOS.txt
└── README.md
```

Se recomienda incorporar en `docs/` la memoria técnica final, diagramas de arquitectura y flujos, especificación de API y evidencias de pruebas solicitadas por el docente.

## 12. Limitaciones y consideraciones

- Los datos de personas, direcciones, destinatarios, coordenadas y evidencias son ficticios.
- La posición del repartidor es simulada y expira después de 120 segundos; no representa GPS real ni prueba de entrega.
- La evidencia de entrega es una referencia simulada, no una fotografía real.
- PostgreSQL conserva el estado oficial; MongoDB mantiene una proyección histórica que puede presentar retraso de sincronización.
- Redis almacena información temporal; su indisponibilidad no debe cambiar el estado oficial del envío.
- La configuración de credenciales y puertos está diseñada para un laboratorio local, no para un despliegue productivo.

## 13. Relación con los entregables académicos

Este repositorio reúne el código fuente, los Dockerfiles, los cinco archivos Compose independientes, la configuración de ejemplo, los datos semilla, las pruebas y la documentación de integración. Para completar la entrega académica, se deben conservar también la memoria técnica, los diagramas, la especificación de API y el registro de evidencias de las operaciones y pruebas de fallos.

------------------------------------------------------------------------

**Proyecto B — Persistencia políglota \| Empresa de mensajería urbana**  
**Universidad de las Fuerzas Armadas ESPE**
