# Frontend · Persona 3 (Grupo 1)

Interfaz web del sistema de mensajería con persistencia políglota. Consume **solo** la API REST en `http://localhost:3000`; no se conecta a PostgreSQL, MongoDB ni Redis.

**Stack:** React 18 + Vite + React Router. Estilos CSS propios y responsivos, sin dependencias de UI.

## Requisitos cubiertos

| # | Requisito | Dónde está | Endpoints de la API |
| --- | --- | --- | --- |
| 1 | Pantalla de inicio de sesión | `src/paginas/Login.jsx` | `POST /api/auth/login` |
| 2 | Panel principal según el rol | `src/paginas/Panel.jsx` | `GET /api/envios` |
| 3 | Formulario para registrar envíos | `src/paginas/RegistrarEnvio.jsx` | `GET /api/zonas`, `POST /api/envios` (con `Idempotency-Key`) |
| 4 | Administración de zonas y repartidores | `src/paginas/Administracion.jsx` | `GET /api/zonas`, `GET/POST /api/repartidores`, `PATCH /api/repartidores/:id` |
| 5 | Despacho y asignación | `src/paginas/Despacho.jsx` | `POST /api/envios/:codigo/aceptar`, `POST /api/asignaciones`, `PATCH …/reasignar`, `POST …/liberar` |
| 6 | Vista del repartidor (estados) | `src/paginas/Reparto.jsx` | `PATCH /api/envios/:codigo/estado`, `POST /api/repartidores/:id/posicion-temporal` |
| 7 | Seguimiento por código | `src/paginas/Seguimiento.jsx` | `GET /api/envios/:codigo`, `POST …/cancelar` |
| 8 | Línea de tiempo e historial | `src/paginas/Historial.jsx` | `GET /api/envios/:codigo/historial` |
| 9 | Evidencias de entrega | `src/paginas/Evidencia.jsx` | `GET/POST /api/envios/:codigo/evidencia` |
| 10 | Diseño responsivo y navegación | `src/Layout.jsx`, `src/styles.css` | — |

### Permisos por rol (espejo de la API)

- **Cliente:** registra envíos, consulta los suyos, cancela antes del retiro.
- **Operador:** registra, acepta solicitudes, asigna/reasigna/libera, cancela, registra evidencia.
- **Repartidor:** ve solo sus asignaciones activas, avanza estados, registra evidencia y su posición temporal.
- **Administrador:** todo lo anterior más zonas (lectura) y gestión de repartidores.

La navegación oculta lo que no corresponde al rol, pero **la autorización real la hace siempre la API**.

## Ejecutar en desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
```

La API debe estar levantada en `http://localhost:3000` y su `CORS_ORIGIN` debe incluir `http://localhost:5173`.

Para cambiar la URL de la API: `VITE_API_URL=http://otra-url:3000 npm run dev`.

## Ejecutar con Docker Compose

Requiere que la red `proyecto-red` exista (la crea `INICIAR_TODO.ps1` del ZIP del Grupo 1).

```powershell
docker compose up -d --build        # http://localhost:8080
```

Antes, en `PROYECTO_API/.env`, añadir el origen del frontend:

```
CORS_ORIGIN=http://localhost:5173,http://localhost:8080
```

y reiniciar la API. El puerto del frontend está enlazado a `127.0.0.1`.

## Cuentas de demostración

Contraseña para todas: `Demo2026!` (datos ficticios, cargados por `npm run seed` en la API).

| Usuario | Rol |
| --- | --- |
| `cliente_demo` | Cliente |
| `operador_demo` | Operador |
| `repartidor_demo` | Repartidor (REP-001, capacidad 2) |
| `admin_demo` | Administrador |

## Pruebas desde la interfaz

Con la API y el frontend levantados:

```bash
npm run e2e
```

El script abre Chrome, recorre el flujo completo (cliente registra → operador acepta y asigna → repartidor retira, pone en tránsito y entrega → cliente consulta el seguimiento), valida mensajes de error y de acceso, comprueba el diseño en pantalla de teléfono y guarda capturas en `capturas/`. Variables opcionales: `BASE_URL`, `CHROME_PATH`, `CAPTURAS`.

## Decisiones de integración

- **Estado oficial vs. historial:** el estado que se muestra siempre viene de `envios.estado` (PostgreSQL). La línea de tiempo viene de MongoDB y, si su última versión es menor que la del envío, la pantalla avisa que la sincronización es eventual.
- **Idempotencia:** el formulario de registro de envío y el de evidencia generan una `Idempotency-Key` y la conservan mientras la operación no tenga éxito, de modo que un doble clic no duplica el envío.
- **Sesión:** el token se guarda en `sessionStorage`. Si la API responde 401 se cierra la sesión automáticamente.
- **Repartidor:** la respuesta del login no trae `repartidor_id`; el frontend lo lee del payload del JWT para usarlo en la posición temporal.
- **Sin escrituras directas a bases de datos:** todo pasa por `src/api.js`.

## Limitaciones conocidas

- La API no tiene endpoints para crear o desactivar **zonas**; la pantalla de administración las muestra en modo lectura.
- Si la API corre sin `MONGODB_URI` y `REDIS_URL`, el módulo de Persona 2 queda desactivado: la línea de tiempo y la evidencia muestran un mensaje explicativo en lugar de romperse.
- Las pantallas de Persona 2 (historial, evidencia y posición temporal) se implementaron según `docs/CONTRATO_INTEGRACION.md`; ver el informe de pruebas para el alcance verificado.
