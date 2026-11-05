'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const {Pool} = require('pg');
const {MongoClient} = require('mongodb');
const {createClient} = require('redis');
const {crearRouterPersona2, crearSincronizadorOutbox, prepararColecciones} = require('./persona2');
const {TIPOS_SERVICIO, puedeCambiarEstado, hayCapacidad, textoValido, enteroPositivo} = require('./rules');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Definir JWT_SECRET con al menos 32 caracteres en .env');
}
const db = new Pool({connectionString: process.env.DATABASE_URL});
const app = express();
let mongoClient = null;
let redisClient = null;
let sincronizadorPersona2 = null;
let routerPersona2 = null;
app.disable('x-powered-by');
const permitidos = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({origin(origin, done) {
  if (!origin || permitidos.includes(origin)) return done(null, true);
  return done(new HttpError(403, 'Origen no autorizado por CORS'));
}}));
app.use(express.json({limit: '20kb'}));

class HttpError extends Error {
  constructor(status, message) {super(message); this.status = status;}
}
const ruta = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const error = (estado, mensaje) => {throw new HttpError(estado, mensaje);};
const idSeguro = valor => {
  if (!/^[1-9]\d*$/.test(String(valor)) || !Number.isSafeInteger(Number(valor))) error(400, 'Identificador no válido');
  return Number(valor);
};
const limpiar = s => s.trim();
const actor = req => ({usuario: req.user.usuario, rol: req.user.rol});

async function transaccion(fn) {
  const cliente = await db.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {cliente.release();}
}

async function escribirEvento(cliente, envio, tipo, detalle, req) {
  await cliente.query(`INSERT INTO eventos_salida (envio_id, codigo_envio, tipo, datos)
    VALUES ($1,$2,$3,$4::jsonb)`, [
      envio.id, envio.codigo, tipo, JSON.stringify({
        codigo_envio: envio.codigo, version: envio.version, estado: envio.estado,
        actor: actor(req), detalle
      })
    ]);
}

function autenticar(req, res, next) {
  const encabezado = req.get('authorization') || '';
  const m = /^Bearer (.+)$/i.exec(encabezado);
  if (!m) return next(new HttpError(401, 'Falta token Bearer'));
  try {
    const payload = jwt.verify(m[1], process.env.JWT_SECRET, {algorithms: ['HS256']});
    req.user = {id: payload.sub, usuario: payload.usuario, rol: payload.rol, repartidor_id: payload.repartidor_id || null};
    return next();
  } catch (_) {return next(new HttpError(401, 'Token inválido o expirado'));}
}
const permitir = (...roles) => (req,res,next) => roles.includes(req.user.rol)
  ? next() : next(new HttpError(403, 'Rol sin permiso para esta operación'));

function verificarAccesoEnvio(req, envio) {
  if (req.user.rol === 'cliente' && envio.creado_por_usuario !== req.user.usuario) {
    error(403, 'No puedes consultar ni cambiar envíos de otros usuarios');
  }
}

app.get('/health', ruta(async (req,res) => {
  await db.query('SELECT 1');
  const estado = { api: 'ok', postgres: 'ok' };
  if (mongoClient) {
    await mongoClient.db(process.env.MONGODB_DB || 'mensajeria').command({ ping: 1 });
    estado.mongodb = 'ok';
  }
  if (redisClient) {
    await redisClient.ping();
    estado.redis = 'ok';
  }
  res.json(estado);
}));

app.post('/api/auth/login', ruta(async (req,res) => {
  const {usuario, clave} = req.body || {};
  if (!textoValido(usuario, 1, 60) || !textoValido(clave, 1, 200)) error(400, 'Usuario y clave son obligatorios');
  const {rows} = await db.query('SELECT * FROM usuarios_demo WHERE usuario=$1', [usuario.trim()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(clave, u.clave_hash))) error(401, 'Credenciales incorrectas');
  const token = jwt.sign({usuario: u.usuario, rol: u.rol, repartidor_id: u.repartidor_id},
    process.env.JWT_SECRET, {subject: String(u.id), expiresIn: '2h', algorithm: 'HS256'});
  res.json({token, tipo: 'Bearer', expira_en: '2h', rol: u.rol, usuario: u.usuario});
}));

app.use('/api', autenticar);

app.get('/api/zonas', ruta(async (req,res) => {
  const {rows} = await db.query('SELECT id,nombre,habilitada FROM zonas ORDER BY id');
  res.json({datos: rows});
}));

app.get('/api/repartidores', permitir('administrador','operador'), ruta(async (req,res) => {
  const {rows} = await db.query(`SELECT r.id,r.codigo,r.nombre,r.zona_id,z.nombre AS zona,
    r.capacidad_maxima,r.carga_actual,r.disponible
    FROM repartidores r LEFT JOIN zonas z ON z.id=r.zona_id ORDER BY r.id`);
  res.json({datos: rows});
}));

app.post('/api/repartidores', permitir('administrador'), ruta(async (req,res) => {
  const {codigo, nombre, zona_id, capacidad_maxima} = req.body || {};
  if (!textoValido(codigo, 3, 30) || !textoValido(nombre, 2, 120)
      || !enteroPositivo(capacidad_maxima)) error(400, 'Código, nombre o capacidad inválidos');
  const idZona = idSeguro(zona_id);
  const {rows: zonas} = await db.query('SELECT id FROM zonas WHERE id=$1 AND habilitada=TRUE', [idZona]);
  if (!zonas.length) error(400, 'Zona inexistente o inactiva');
  const {rows} = await db.query(`INSERT INTO repartidores (codigo,nombre,zona_id,capacidad_maxima)
    VALUES ($1,$2,$3,$4) RETURNING *`, [limpiar(codigo),limpiar(nombre),idZona,capacidad_maxima]);
  res.status(201).json({dato: rows[0]});
}));

app.patch('/api/repartidores/:id', permitir('administrador'), ruta(async (req,res) => {
  const id = idSeguro(req.params.id);
  const campos = req.body || {};
  if (typeof campos !== 'object' || Array.isArray(campos) || !Object.keys(campos).length) error(400, 'Cambios no especificados');
  const permitidos = ['disponible','capacidad_maxima'];
  if (Object.keys(campos).some(k => !permitidos.includes(k))) error(400, 'Campo no editable');
  if ('disponible' in campos && typeof campos.disponible !== 'boolean') error(400, 'disponible debe ser booleano');
  if ('capacidad_maxima' in campos && !enteroPositivo(campos.capacidad_maxima)) error(400, 'capacidad_maxima inválida');
  const r = await transaccion(async c => {
    const {rows} = await c.query('SELECT * FROM repartidores WHERE id=$1 FOR UPDATE', [id]);
    if (!rows.length) error(404, 'Repartidor inexistente');
    const nuevoMax = campos.capacidad_maxima ?? rows[0].capacidad_maxima;
    if (nuevoMax < rows[0].carga_actual) error(409, 'Capacidad inferior a la carga actual');
    const nuevoDisponible = campos.disponible ?? rows[0].disponible;
    return (await c.query(`UPDATE repartidores SET capacidad_maxima=$2,disponible=$3
      WHERE id=$1 RETURNING *`, [id,nuevoMax,nuevoDisponible])).rows[0];
  });
  res.json({dato: r});
}));

app.post('/api/envios', permitir('cliente','operador','administrador'), ruta(async (req,res) => {
  const b = req.body || {};
  for (const campo of ['remitente','destinatario','direccion_origen','direccion_destino']) {
    if (!textoValido(b[campo], 2, campo.includes('direccion') ? 250 : 120)) error(400, `${campo} es obligatorio (2 caracteres como mínimo)`);
  }
  if (!TIPOS_SERVICIO.includes(b.tipo_servicio)) error(400, 'tipo_servicio: estandar o express');
  const origen = idSeguro(b.zona_origen_id), destino = idSeguro(b.zona_destino_id);
  const clave = (req.get('Idempotency-Key') || '').trim();
  if (!textoValido(clave, 8, 120)) error(400, 'Cabecera Idempotency-Key obligatoria (8 a 120 caracteres)');
  const datos = {
    remitente: limpiar(b.remitente), destinatario: limpiar(b.destinatario),
    direccion_origen: limpiar(b.direccion_origen), direccion_destino: limpiar(b.direccion_destino),
    zona_origen_id: origen, zona_destino_id: destino, tipo_servicio: b.tipo_servicio,
    creado_por_usuario: req.user.usuario
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(datos)).digest('hex');
  const result = await transaccion(async c => {
    const anterior = await c.query('SELECT * FROM envios WHERE clave_idempotencia=$1', [clave]);
    if (anterior.rows.length) {
      if (anterior.rows[0].solicitud_hash !== hash) error(409, 'Clave de idempotencia reutilizada con otros datos');
      return {envio: anterior.rows[0], nuevo: false};
    }
    const zonas = await c.query('SELECT id FROM zonas WHERE id=ANY($1::bigint[]) AND habilitada=TRUE', [[origen,destino]]);
    if (!zonas.rows.some(z => Number(z.id) === origen) || !zonas.rows.some(z => Number(z.id) === destino)) {
      error(400, 'Zona de origen o destino inexistente/inactiva');
    }
    const codigo = 'ENV-' + crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase();
    const insertado = await c.query(`INSERT INTO envios
      (codigo,remitente,destinatario,direccion_origen,direccion_destino,
       zona_origen_id,zona_destino_id,tipo_servicio,creado_por_usuario,clave_idempotencia,solicitud_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (clave_idempotencia) DO NOTHING RETURNING *`,
    [codigo,datos.remitente,datos.destinatario,datos.direccion_origen,datos.direccion_destino,
      origen,destino,datos.tipo_servicio,datos.creado_por_usuario,clave,hash]);
    if (!insertado.rows.length) {
      const existente = (await c.query('SELECT * FROM envios WHERE clave_idempotencia=$1', [clave])).rows[0];
      if (!existente || existente.solicitud_hash !== hash) error(409, 'Clave de idempotencia en conflicto');
      return {envio: existente,nuevo: false};
    }
    const envio = insertado.rows[0];
    await escribirEvento(c, envio, 'envio.creado', {tipo_servicio: envio.tipo_servicio}, req);
    return {envio,nuevo: true};
  });
  res.status(result.nuevo ? 201 : 200).json({dato: result.envio, repetido: !result.nuevo});
}));

// Aceptación administrativa sin alterar la máquina de estados creada->asignada.
// Permite demostrar validación explícita antes del despacho.
app.post('/api/envios/:codigo/aceptar', permitir('operador','administrador'), ruta(async (req,res) => {
  const resultado = await transaccion(async c => {
    const envio = (await c.query('SELECT * FROM envios WHERE codigo=$1 FOR UPDATE',
      [req.params.codigo])).rows[0];
    if (!envio) error(404, 'Envío inexistente');
    if (envio.aceptado) return {dato:envio,repetido:true};
    if (envio.estado !== 'creado') error(409, 'Solo se aceptan solicitudes pendientes');
    const aceptado = (await c.query(`UPDATE envios SET aceptado=TRUE,aceptado_en=NOW(),
      aceptado_por=$2,version=version+1,actualizado_en=NOW()
      WHERE id=$1 RETURNING *`, [envio.id,req.user.usuario])).rows[0];
    await escribirEvento(c,aceptado,'envio.aceptado',{anterior:envio.estado},req);
    return {dato:aceptado,repetido:false};
  });
  res.json(resultado);
}));

app.get('/api/envios', ruta(async (req,res) => {
  const estado = req.query.estado || null;
  const zona = req.query.zona_destino_id ? idSeguro(req.query.zona_destino_id) : null;
  if (estado && !['creado','asignado','retirado','en_transito','incidencia','entregado','cancelado'].includes(estado)) error(400, 'Estado inválido');
  const {rows} = await db.query(`SELECT e.id,e.codigo,e.remitente,e.destinatario,
    e.zona_origen_id,e.zona_destino_id,e.tipo_servicio,e.estado,e.aceptado,e.version,e.creado_en,
    a.id AS asignacion_id,a.repartidor_id
    FROM envios e LEFT JOIN asignaciones a ON a.envio_id=e.id AND a.estado='activa'
    WHERE ($1::text IS NULL OR e.estado=$1)
      AND ($2::bigint IS NULL OR e.zona_destino_id=$2)
      AND ($3::text IS NULL OR e.creado_por_usuario=$3)
      AND ($4::bigint IS NULL OR a.repartidor_id=$4)
    ORDER BY e.creado_en DESC LIMIT 100`, [estado,zona,
      req.user.rol === 'cliente' ? req.user.usuario : null,
      req.user.rol === 'repartidor' ? req.user.repartidor_id : null]);
  res.json({datos: rows, limite:100});
}));

app.get('/api/envios/:codigo', ruta(async (req,res) => {
  const {rows} = await db.query(`SELECT e.*,a.id AS asignacion_activa_id,a.repartidor_id
    FROM envios e LEFT JOIN asignaciones a ON a.envio_id=e.id AND a.estado='activa'
    WHERE e.codigo=$1`, [req.params.codigo]);
  if (!rows.length) error(404, 'Envío inexistente');
  verificarAccesoEnvio(req,rows[0]);
  if (req.user.rol === 'repartidor' && String(rows[0].repartidor_id) !== String(req.user.repartidor_id)) {
    error(403, 'Envío fuera de tus asignaciones activas');
  }
  // No se expone ni clave de idempotencia ni hash de solicitud.
  const {clave_idempotencia, solicitud_hash, ...dato} = rows[0];
  res.json({dato});
}));

app.post('/api/asignaciones', permitir('operador','administrador'), ruta(async (req,res) => {
  const {codigo_envio, repartidor_id} = req.body || {};
  if (!textoValido(codigo_envio, 5, 30)) error(400, 'codigo_envio no válido');
  const repId = idSeguro(repartidor_id);
  const resultado = await transaccion(async c => {
    const {rows: envios} = await c.query('SELECT * FROM envios WHERE codigo=$1 FOR UPDATE', [limpiar(codigo_envio)]);
    if (!envios.length) error(404, 'Envío inexistente');
    const envio = envios[0];
    if (envio.estado === 'asignado') {
      const existente = (await c.query(`SELECT * FROM asignaciones WHERE envio_id=$1 AND estado='activa'`, [envio.id])).rows[0];
      if (existente && String(existente.repartidor_id) === String(repId)) return {dato:existente,nuevo:false};
    }
    if (envio.estado !== 'creado') error(409, 'Solo se asignan envíos en estado creado');
    if (!envio.aceptado) error(409, 'El operador debe aceptar la solicitud antes de asignarla');
    const {rows: reps} = await c.query('SELECT * FROM repartidores WHERE id=$1 FOR UPDATE', [repId]);
    if (!reps.length) error(404, 'Repartidor inexistente');
    if (!hayCapacidad(reps[0])) error(409, 'Repartidor inactivo o sin capacidad');
    const nueva = (await c.query(`INSERT INTO asignaciones (envio_id,repartidor_id)
      VALUES ($1,$2) RETURNING *`,[envio.id,repId])).rows[0];
    await c.query('UPDATE repartidores SET carga_actual=carga_actual+1 WHERE id=$1', [repId]);
    const actualizado = (await c.query(`UPDATE envios SET estado='asignado',version=version+1,
      actualizado_en=NOW() WHERE id=$1 RETURNING *`, [envio.id])).rows[0];
    await escribirEvento(c, actualizado,'envio.asignado',{asignacion_id:nueva.id,repartidor_id:repId},req);
    return {dato:nueva,nuevo:true};
  });
  res.status(resultado.nuevo ? 201 : 200).json({...resultado,repetido:!resultado.nuevo});
}));

async function obtenerAsignacionBloqueada(c, id) {
  const encontrada = await c.query('SELECT envio_id FROM asignaciones WHERE id=$1',[id]);
  if (!encontrada.rows.length) error(404,'Asignación inexistente');
  const envio = (await c.query('SELECT * FROM envios WHERE id=$1 FOR UPDATE',[encontrada.rows[0].envio_id])).rows[0];
  const asignacion = (await c.query('SELECT * FROM asignaciones WHERE id=$1 FOR UPDATE',[id])).rows[0];
  return {envio,asignacion};
}

app.patch('/api/asignaciones/:id/reasignar', permitir('operador','administrador'), ruta(async (req,res) => {
  const id = idSeguro(req.params.id), nuevoId = idSeguro((req.body || {}).repartidor_id);
  const resultado = await transaccion(async c => {
    const {envio,asignacion} = await obtenerAsignacionBloqueada(c,id);
    if (asignacion.estado !== 'activa' || envio.estado !== 'asignado') error(409, 'Solo se reasignan envíos asignados y activos');
    if (String(asignacion.repartidor_id) === String(nuevoId)) return {dato:asignacion,nuevo:false};
    const ids = [idSeguro(asignacion.repartidor_id),nuevoId];
    const {rows: reps} = await c.query(`SELECT * FROM repartidores
      WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [ids]);
    const nuevo = reps.find(r => String(r.id) === String(nuevoId));
    if (!nuevo) error(404, 'Nuevo repartidor inexistente');
    if (!hayCapacidad(nuevo)) error(409, 'Nuevo repartidor inactivo o sin capacidad');
    await c.query(`UPDATE asignaciones SET estado='reasignada',cerrada_en=NOW() WHERE id=$1`,[id]);
    await c.query('UPDATE repartidores SET carga_actual=carga_actual-1 WHERE id=$1',[asignacion.repartidor_id]);
    await c.query('UPDATE repartidores SET carga_actual=carga_actual+1 WHERE id=$1',[nuevoId]);
    const nueva = (await c.query(`INSERT INTO asignaciones (envio_id,repartidor_id)
      VALUES ($1,$2) RETURNING *`, [envio.id,nuevoId])).rows[0];
    const actual = (await c.query(`UPDATE envios SET version=version+1,actualizado_en=NOW()
      WHERE id=$1 RETURNING *`,[envio.id])).rows[0];
    await escribirEvento(c,actual,'envio.reasignado',{
      asignacion_anterior_id:id,asignacion_id:nueva.id,
      repartidor_anterior_id:asignacion.repartidor_id,repartidor_id:nuevoId
    },req);
    return {dato:nueva,nuevo:true};
  });
  res.status(resultado.nuevo ? 201 : 200).json(resultado);
}));

app.post('/api/asignaciones/:id/liberar', permitir('operador','administrador'), ruta(async (req,res) => {
  const id = idSeguro(req.params.id);
  const dato = await transaccion(async c => {
    const {envio,asignacion} = await obtenerAsignacionBloqueada(c,id);
    if (asignacion.estado !== 'activa' || envio.estado !== 'asignado') error(409, 'No se puede liberar esta asignación');
    await c.query('SELECT id FROM repartidores WHERE id=$1 FOR UPDATE',[asignacion.repartidor_id]);
    await c.query('UPDATE repartidores SET carga_actual=carga_actual-1 WHERE id=$1',[asignacion.repartidor_id]);
    const asig = (await c.query(`UPDATE asignaciones SET estado='liberada',cerrada_en=NOW()
      WHERE id=$1 RETURNING *`,[id])).rows[0];
    const actual = (await c.query(`UPDATE envios SET estado='creado',version=version+1,
      actualizado_en=NOW() WHERE id=$1 RETURNING *`,[envio.id])).rows[0];
    await escribirEvento(c,actual,'envio.asignacion_liberada',{asignacion_id:id},req);
    return asig;
  });
  res.json({dato});
}));

// Contrato de estado oficial: la Persona 2 consume los eventos y genera historial en MongoDB.
app.patch('/api/envios/:codigo/estado', permitir('repartidor','operador','administrador'), ruta(async (req,res) => {
  const {estado,observacion} = req.body || {};
  if (!['retirado','en_transito','incidencia','entregado'].includes(estado)) {
    error(400, 'Estado permitido: retirado, en_transito, incidencia o entregado');
  }
  if (observacion != null && !textoValido(observacion, 1, 250)) error(400,'Observación no válida');
  const resultado = await transaccion(async c => {
    const e = (await c.query('SELECT * FROM envios WHERE codigo=$1 FOR UPDATE',[req.params.codigo])).rows[0];
    if (!e) error(404,'Envío inexistente');
    const a = (await c.query(`SELECT * FROM asignaciones WHERE envio_id=$1 AND estado='activa' FOR UPDATE`,[e.id])).rows[0];
    if (!a) {
      // En una entrega terminada ya se cerró la asignación. Se permite repetir
      // la confirmación sin modificar PostgreSQL ni emitir un segundo evento.
      if (e.estado === 'entregado' && estado === 'entregado') {
        const ultimo = (await c.query(`SELECT repartidor_id FROM asignaciones
          WHERE envio_id=$1 AND estado='finalizada' ORDER BY id DESC LIMIT 1`,[e.id])).rows[0];
        if (req.user.rol === 'repartidor' &&
            (!ultimo || String(req.user.repartidor_id) !== String(ultimo.repartidor_id))) {
          error(403, 'Asignación de otro repartidor');
        }
        return {dato:e,repetido:true};
      }
      error(409, 'El envío no tiene asignación activa');
    }
    if (req.user.rol === 'repartidor' && String(req.user.repartidor_id) !== String(a.repartidor_id)) {
      error(403, 'Asignación de otro repartidor');
    }
    if (e.estado === estado) return {dato:e,repetido:true};
    if (!puedeCambiarEstado(e.estado,estado)) error(409, `Transición inválida: ${e.estado} -> ${estado}`);
    if (estado === 'entregado') {
      await c.query('SELECT id FROM repartidores WHERE id=$1 FOR UPDATE',[a.repartidor_id]);
      await c.query('UPDATE repartidores SET carga_actual=carga_actual-1 WHERE id=$1',[a.repartidor_id]);
      await c.query(`UPDATE asignaciones SET estado='finalizada',cerrada_en=NOW() WHERE id=$1`,[a.id]);
    }
    const actual = (await c.query(`UPDATE envios SET estado=$2,version=version+1,
      actualizado_en=NOW() WHERE id=$1 RETURNING *`,[e.id,estado])).rows[0];
    await escribirEvento(c,actual,'envio.estado_actualizado',{
      anterior:e.estado,nuevo:estado,observacion: observacion || null,
      repartidor_id:a.repartidor_id
    },req);
    return {dato:actual,repetido:false};
  });
  res.json(resultado);
}));

app.post('/api/envios/:codigo/cancelar', permitir('cliente','operador','administrador'), ruta(async (req,res) => {
  const resultado = await transaccion(async c => {
    const e = (await c.query('SELECT * FROM envios WHERE codigo=$1 FOR UPDATE',[req.params.codigo])).rows[0];
    if (!e) error(404,'Envío inexistente');
    verificarAccesoEnvio(req,e);
    if (e.estado === 'cancelado') return {dato:e,repetido:true};
    if (!puedeCambiarEstado(e.estado,'cancelado')) error(409,'Solo se cancela antes del retiro');
    if (e.estado === 'asignado') {
      const a = (await c.query(`SELECT * FROM asignaciones WHERE envio_id=$1 AND estado='activa' FOR UPDATE`,[e.id])).rows[0];
      if (!a) error(409,'No existe asignación activa para cancelar');
      await c.query('SELECT id FROM repartidores WHERE id=$1 FOR UPDATE',[a.repartidor_id]);
      await c.query('UPDATE repartidores SET carga_actual=carga_actual-1 WHERE id=$1',[a.repartidor_id]);
      await c.query(`UPDATE asignaciones SET estado='cancelada',cerrada_en=NOW() WHERE id=$1`,[a.id]);
    }
    const actual = (await c.query(`UPDATE envios SET estado='cancelado',version=version+1,
      actualizado_en=NOW() WHERE id=$1 RETURNING *`,[e.id])).rows[0];
    await escribirEvento(c,actual,'envio.cancelado',{anterior:e.estado},req);
    return {dato:actual,repetido:false};
  });
  res.json(resultado);
}));

app.use('/api', (req,res,next) => routerPersona2 ? routerPersona2(req,res,next) : next());

app.use((err,req,res,next) => {
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({error:'JSON inválido'});
  if (err instanceof HttpError || Number.isInteger(err.status)) return res.status(err.status).json({error:err.message});
  if (err.code === '23505') return res.status(409).json({error:'Dato duplicado: restricción de unicidad'});
  if (err.code === '23503' || err.code === '23514' || err.code === '22P02') {
    return res.status(400).json({error:'Datos incompatibles con restricciones de la base de datos'});
  }
  console.error('Error no controlado:',err);
  res.status(500).json({error:'Error interno del servidor'});
});

async function iniciarServidor() {
  const port = Number(process.env.PORT || 3000);
  // La API puede arrancar sin Persona 2 para pruebas aisladas de Persona 1.
  // En el Compose integrado se configuran ambas URI y se activa el módulo completo.
  if (process.env.MONGODB_URI && process.env.REDIS_URL) {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    const mongoDb = mongoClient.db(process.env.MONGODB_DB || 'mensajeria');
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', e => console.error('[Persona 2] Redis:', e.message));
    await redisClient.connect();
    await prepararColecciones(mongoDb);
    routerPersona2 = crearRouterPersona2({ db, mongoDb, redis: redisClient });
    sincronizadorPersona2 = crearSincronizadorOutbox({ db, mongoDb });
    sincronizadorPersona2.iniciar();
    console.log('[Persona 2] MongoDB, Redis y sincronizador preparados');
  } else {
    console.warn('[Persona 2] MONGODB_URI/REDIS_URL no configuradas; módulo desactivado');
  }

  const servidor = app.listen(port, '0.0.0.0', () => console.log(`API del Grupo 1 en puerto ${port}`));
  const cerrar = async () => {
    sincronizadorPersona2?.detener();
    servidor.close();
    await Promise.allSettled([
      db.end(),
      mongoClient?.close(),
      redisClient?.quit()
    ]);
    process.exit(0);
  };
  process.once('SIGTERM', cerrar);
  process.once('SIGINT', cerrar);
  return servidor;
}

if (require.main === module) {
  iniciarServidor().catch(async e => {
    console.error('No se pudo iniciar la API:', e);
    await db.end().catch(() => {});
    process.exit(1);
  });
}
module.exports = {app,db,iniciarServidor};
