# Guía de entrega · Persona 3 (Frontend) · Grupo 1

Esta guía explica qué se construyó, cómo cumple cada requerimiento asignado a Persona 3 y qué se verificó (y qué no) antes de la integración final.

---

## 1. Contenido del paquete

| Elemento | Descripción |
| --- | --- |
| `Entrega_Persona3_FRONTEND/` | Código fuente completo del frontend (React + Vite + React Router). |
| `Entrega_Persona3_FRONTEND/README.md` | Instrucciones de ejecución en desarrollo y con Docker, cuentas demo y decisiones de integración. |
| `Entrega_Persona3_FRONTEND/Dockerfile`, `nginx.conf`, `docker-compose.yml` | Contenedor del frontend (nginx en el puerto 8080) unido a la red `proyecto-red`. |
| `Entrega_Persona3_FRONTEND/e2e/flujo-completo.mjs` | Prueba end-to-end que recorre la interfaz real contra la API. |
| `Entrega_Persona3_FRONTEND/capturas/` | Capturas de pantalla de la ejecución de la prueba. |
| `resultado-e2e.txt` | Salida de la última ejecución de la prueba (11/11). |
| `GUIA_PERSONA3.md` | Este documento. |

No incluye `node_modules/` ni `dist/`; se generan con `npm install` y `npm run build`.

---

## 2. Cómo ponerlo en marcha

**Requisito previo:** la API del Grupo 1 en ejecución en `http://localhost:3000`, con su `CORS_ORIGIN` incluyendo el origen del frontend.

En `PROYECTO_API/.env`:

```
CORS_ORIGIN=http://localhost:5173,http://localhost:8080
```

Luego reiniciar la API.

**Desarrollo:**

```bash
npm install
npm run dev          # http://localhost:5173
```

**Docker** (con la red `proyecto-red` creada):

```powershell
docker compose up -d --build     # http://localhost:8080
```

**Pruebas desde la interfaz:**

```bash
npm run e2e
```

---

## 3. Cumplimiento de requerimientos de Persona 3

| # | Requerimiento | Implementación | Endpoints consumidos | Verificación |
| --- | --- | --- | --- | --- |
| 1 | Pantalla de inicio de sesión | `Login.jsx`. Validación de campos, mensaje de error de la API, accesos rápidos a cuentas demo. | `POST /api/auth/login` | E2E ✅ |
| 2 | Panel principal según el rol | `Panel.jsx`. Métricas por estado y tabla de envíos. Cada rol ve un texto y accesos distintos. | `GET /api/envios` | E2E ✅ |
| 3 | Formulario para registrar envíos | `RegistrarEnvio.jsx`. Validación local, selección de zonas, tipo de servicio, `Idempotency-Key` persistente hasta éxito, mensaje de repetición. | `GET /api/zonas`, `POST /api/envios` | E2E ✅ |
| 4 | Panel de administración de zonas y repartidores | `Administracion.jsx`. Crear repartidor, activar/desactivar, cambiar capacidad máxima. Zonas en modo lectura. | `GET /api/zonas`, `GET/POST /api/repartidores`, `PATCH /api/repartidores/:id` | Revisión manual ⚠️ (no incluido en la prueba E2E) |
| 5 | Panel de despacho y asignación de repartidores | `Despacho.jsx`. Tres bloques: solicitudes por aceptar, aceptadas por asignar (repartidores sin cupo deshabilitados), asignados (reasignar y liberar). Tabla de capacidad. | `POST …/aceptar`, `POST /api/asignaciones`, `PATCH …/reasignar`, `POST …/liberar` | E2E ✅ (aceptar y asignar). Reasignar y liberar: revisión manual ⚠️ |
| 6 | Vista del repartidor para gestionar estados | `Reparto.jsx`. Tarjetas por envío con las acciones válidas según el estado; observación opcional; panel de posición temporal. | `PATCH /api/envios/:codigo/estado`, `POST /api/repartidores/:id/posicion-temporal` | E2E ✅ (estados). Posición temporal: revisión manual ⚠️ |
| 7 | Seguimiento de envíos mediante código | `Seguimiento.jsx`. Búsqueda por código, URL directa `/seguimiento/:codigo`, detalle completo, cancelación según estado y rol. | `GET /api/envios/:codigo`, `POST …/cancelar` | E2E ✅ |
| 8 | Línea de tiempo de eventos e historial | `Historial.jsx`. Combina el estado oficial con el historial derivado y avisa si la sincronización va atrasada. | `GET /api/envios/:codigo`, `GET …/historial` | Parcial ⚠️ (ver sección 5) |
| 9 | Pantalla de evidencias de entrega | `Evidencia.jsx`. Muestra la evidencia registrada o el formulario cuando el envío está entregado. Referencia simulada, sin fotos reales. | `GET/POST …/evidencia` | Parcial ⚠️ (ver sección 5) |
| 10 | Diseño responsivo y navegación completa | `Layout.jsx` y `styles.css`. Menú por rol, rutas protegidas, layout adaptable a 390 px. | — | E2E ✅ (captura móvil) |

Leyenda: ✅ verificado con la prueba E2E · ⚠️ implementado, verificación parcial o manual.

### Reglas de permisos reflejadas en la interfaz

- **Cliente:** registra envíos, consulta los suyos, cancela antes del retiro.
- **Operador:** registra, acepta, asigna, reasigna, libera, cancela y registra evidencia.
- **Repartidor:** ve solo sus asignaciones activas, avanza estados, registra evidencia y su posición.
- **Administrador:** todo lo anterior más gestión de repartidores.

La interfaz oculta las opciones que no corresponden, pero la autorización real la aplica siempre la API.

---

## 4. Integración con el contrato de la API

Decisiones tomadas siguiendo `docs/CONTRATO_INTEGRACION.md` e `docs/INTEGRACION_PERSONA3.md`:

- **Sin escrituras directas a bases de datos.** Todo pasa por `src/api.js`, que es el único punto de contacto con la API.
- **Estado oficial vs. historial.** El estado mostrado siempre proviene de `envios.estado` (PostgreSQL). La línea de tiempo proviene de MongoDB; si su última versión es menor que la del envío, la pantalla indica que la sincronización es eventual.
- **Idempotencia.** Los formularios de registro de envío y de evidencia generan una `Idempotency-Key` y la conservan mientras la operación no tenga éxito. Un doble clic o un reintento no duplica el registro.
- **Errores.** Se muestran los mensajes del cuerpo `{"error": "..."}` de la API. Un 401 cierra la sesión automáticamente.
- **Sesión.** El token se guarda en `sessionStorage`. El `repartidor_id` se lee del JWT, porque la respuesta del login no lo incluye.
- **Módulo de Persona 2 desactivado.** Si la API no tiene `MONGODB_URI` y `REDIS_URL`, la línea de tiempo y la evidencia muestran un mensaje claro en lugar de fallar.

---

## 5. Qué se verificó y qué no

### Verificado

- Prueba E2E desde la interfaz, **11 de 11 pasan** (ver `resultado-e2e.txt`):
  1. Login del cliente y panel por rol.
  2. Registro de envío desde el formulario (se obtiene un código `ENV-…`).
  3. Validación visible con formulario vacío.
  4. Operador acepta la solicitud.
  5. Operador asigna a un repartidor con cupo.
  6. Repartidor avanza retirado → en tránsito → entregado.
  7. Cliente consulta el seguimiento y ve «Entregado».
  8. El botón de cancelar no aparece en un envío entregado.
  9. La línea de tiempo carga y muestra el estado oficial.
  10. Diseño en pantalla de 390 px.
  11. Sin sesión, una ruta protegida redirige al login.
- Build de producción sin errores (`vite build`).
- Pruebas contra la API real con PostgreSQL 16 y Redis activos en el entorno de desarrollo.

### No verificado en este entorno

- **MongoDB:** no se pudo instalar en el entorno de desarrollo. Por tanto, el historial, la evidencia y la posición temporal de Persona 2 **no se probaron contra servicios activos**. Están implementados según el contrato y muestran mensajes claros si el módulo no está disponible.
- **Docker:** el `Dockerfile` y el `docker-compose.yml` están escritos pero **no se ejecutaron**; el daemon de Docker no estaba disponible.
- **Acciones de administración, reasignar, liberar y posición temporal:** están implementadas pero no cubiertas por la prueba E2E automatizada.

---

## 6. Problemas encontrados y corregidos durante el desarrollo

1. **Página rota sin sesión:** el layout intentaba leer el rol de un usuario sin sesión. Ahora redirige al login. Lo detectó la prueba E2E de rutas protegidas.
2. **Repartidor sin identificador:** la respuesta del login no incluye `repartidor_id`. Se lee del payload del token.
3. **Mensajes confusos del módulo de Persona 2:** un 404 genérico se reemplazó por un mensaje que explica que MongoDB o Redis no están configurados.

---

## 7. Pendientes para la integración final (equipo)

1. Agregar el origen del frontend a `CORS_ORIGIN` de la API (`http://localhost:8080` para Docker).
2. Ejecutar `docker compose up -d --build` en la carpeta del frontend y comprobar `http://localhost:8080`.
3. Completar el Compose integrado con MongoDB y Redis en la misma red. El contrato lo asigna a Persona 3 y no está resuelto en esta entrega.
4. Ejecutar `npm run e2e` con el stack completo (incluido MongoDB) y tomar las capturas definitivas. Las incluidas en este paquete corresponden al entorno sin MongoDB.
5. Decidir si la administración de zonas debe tener endpoints de escritura; hoy la API solo permite leerlas.
6. Revisar en conjunto las pantallas de Persona 2 (historial, evidencia y posición temporal) una vez que MongoDB esté activo.
