'use strict';

const crypto = require('node:crypto');

const TTL_POSICION_SEGUNDOS = 120;
const COLECCION_HISTORIAL = 'historial_envios';
const COLECCION_EVIDENCIAS = 'evidencias_entrega';

function error(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

function texto(valor, min = 1, max = 250) {
  return typeof valor === 'string' && valor.trim().length >= min && valor.trim().length <= max;
}

function numeroFinito(valor, min, max) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= min && valor <= max;
}

function crearRouterPersona2({ db, mongoDb, redis }) {
  const express = require('express');
  if (!db || !mongoDb || !redis) throw new Error('Persona 2 requiere PostgreSQL, MongoDB y Redis');
  const router = express.Router();
  const historial = mongoDb.collection(COLECCION_HISTORIAL);
  const evidencias = mongoDb.collection(COLECCION_EVIDENCIAS);

  async function envioAutorizado(req, codigo) {
    const { rows } = await db.query(
      `SELECT e.id,e.codigo,e.estado,e.creado_por_usuario,
              a.repartidor_id,a.estado AS estado_asignacion
       FROM envios e
       LEFT JOIN asignaciones a ON a.envio_id=e.id
       WHERE e.codigo=$1
       ORDER BY a.id DESC LIMIT 1`,
      [codigo]
    );
    if (!rows.length) error(404, 'Envío inexistente');
    const envio = rows[0];
    if (req.user.rol === 'cliente' && envio.creado_por_usuario !== req.user.usuario) {
      error(403, 'No puedes consultar envíos de otros clientes');
    }
    if (req.user.rol === 'repartidor' &&
        String(envio.repartidor_id) !== String(req.user.repartidor_id)) {
      error(403, 'El envío no pertenece a tus asignaciones');
    }
    return envio;
  }

  function redisDisponible() {
    if (!redis.isReady) error(503, 'El servicio temporal de Redis no está disponible');
  }

  // Historial derivado de eventos confirmados en PostgreSQL.
  router.get('/envios/:codigo/historial', async (req, res, next) => {
    try {
      await envioAutorizado(req, req.params.codigo);
      const datos = await historial.find({ codigo_envio: req.params.codigo })
        .sort({ version: 1, creado_en: 1 }).toArray();
      res.json({ codigo_envio: req.params.codigo, datos, sincronizacion: 'eventual' });
    } catch (e) { next(e); }
  });

  // La evidencia solo se admite cuando PostgreSQL ya confirma el estado entregado.
  router.post('/envios/:codigo/evidencia', async (req, res, next) => {
    try {
      const envio = await envioAutorizado(req, req.params.codigo);
      if (!['operador', 'administrador', 'repartidor'].includes(req.user.rol)) {
        error(403, 'Rol sin permiso para registrar evidencia');
      }
      if (envio.estado !== 'entregado') error(409, 'Primero debe confirmarse la entrega en PostgreSQL');

      const b = req.body || {};
      const clave = (req.get('Idempotency-Key') || '').trim();
      if (!texto(clave, 8, 120)) error(400, 'Cabecera Idempotency-Key obligatoria');
      if (!texto(b.receptor, 2, 100)) error(400, 'receptor es obligatorio');
      if (b.observacion != null && !texto(b.observacion, 1, 250)) error(400, 'observacion no válida');
      if (!texto(b.referencia, 5, 500)) error(400, 'referencia simulada de evidencia obligatoria');

      const payload = {
        codigo_envio: envio.codigo,
        receptor: b.receptor.trim(),
        observacion: b.observacion ? b.observacion.trim() : null,
        referencia: b.referencia.trim(),
        registrado_por: { usuario: req.user.usuario, rol: req.user.rol }
      };
      const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const existente = await evidencias.findOne({ codigo_envio: envio.codigo });
      if (existente) {
        if (existente.clave_idempotencia === clave && existente.payload_hash === hash) {
          return res.status(200).json({ dato: existente, repetido: true });
        }
        return error(409, 'Ya existe evidencia para este envío; no se puede reemplazar');
      }

      const dato = {
        _id: crypto.randomUUID(),
        ...payload,
        clave_idempotencia: clave,
        payload_hash: hash,
        creado_en: new Date(),
        estado: 'registrada'
      };
      try {
        await evidencias.insertOne(dato);
      } catch (e) {
        if (e.code !== 11000) throw e;
        const repetida = await evidencias.findOne({ codigo_envio: envio.codigo });
        if (repetida && repetida.clave_idempotencia === clave && repetida.payload_hash === hash) {
          return res.status(200).json({ dato: repetida, repetido: true });
        }
        return error(409, 'Ya existe evidencia para este envío');
      }
      res.status(201).json({ dato, repetido: false });
    } catch (e) { next(e); }
  });

  router.get('/envios/:codigo/evidencia', async (req, res, next) => {
    try {
      await envioAutorizado(req, req.params.codigo);
      const dato = await evidencias.findOne({ codigo_envio: req.params.codigo });
      if (!dato) error(404, 'Evidencia no registrada');
      res.json({ dato });
    } catch (e) { next(e); }
  });

  // Redis almacena únicamente la última posición simulada y la deja caducar.
  router.post('/repartidores/:id/posicion-temporal', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (!/^[1-9]\d*$/.test(id)) error(400, 'Identificador de repartidor no válido');
      if (!['operador', 'administrador', 'repartidor'].includes(req.user.rol)) {
        error(403, 'Rol sin permiso para actualizar posición');
      }
      if (req.user.rol === 'repartidor' && String(req.user.repartidor_id) !== id) {
        error(403, 'Solo puedes actualizar tu propia posición');
      }
      const existe = await db.query('SELECT id FROM repartidores WHERE id=$1', [id]);
      if (!existe.rows.length) error(404, 'Repartidor inexistente');
      const b = req.body || {};
      if (!numeroFinito(b.latitud, -90, 90) || !numeroFinito(b.longitud, -180, 180)) {
        error(400, 'latitud y longitud deben ser números dentro de sus rangos');
      }
      if (b.estado != null && !['en_linea', 'en_ruta', 'desconectado'].includes(b.estado)) {
        error(400, 'estado temporal no válido');
      }
      redisDisponible();
      const dato = {
        repartidor_id: Number(id),
        latitud: b.latitud,
        longitud: b.longitud,
        estado: b.estado || 'en_linea',
        actualizado_en: new Date().toISOString(),
        fuente: 'simulacion'
      };
      const clave = `repartidor:${id}:posicion`;
      await redis.set(clave, JSON.stringify(dato), { EX: TTL_POSICION_SEGUNDOS });
      res.status(200).json({ dato, ttl_segundos: TTL_POSICION_SEGUNDOS });
    } catch (e) { next(e); }
  });

  router.get('/repartidores/:id/posicion-temporal', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (!/^[1-9]\d*$/.test(id)) error(400, 'Identificador de repartidor no válido');
      if (!['operador', 'administrador', 'repartidor'].includes(req.user.rol)) {
        error(403, 'Rol sin permiso para consultar posición');
      }
      if (req.user.rol === 'repartidor' && String(req.user.repartidor_id) !== id) {
        error(403, 'Solo puedes consultar tu propia posición');
      }
      const existe = await db.query('SELECT id FROM repartidores WHERE id=$1', [id]);
      if (!existe.rows.length) error(404, 'Repartidor inexistente');
      redisDisponible();
      const clave = `repartidor:${id}:posicion`;
      const [valor, ttl] = await Promise.all([redis.get(clave), redis.ttl(clave)]);
      if (!valor || ttl <= 0) error(404, 'Posición temporal inexistente o caducada');
      res.json({ dato: JSON.parse(valor), ttl_segundos: ttl, vigente: true });
    } catch (e) { next(e); }
  });

  return router;
}

/**
 * Consumidor único lógico del Transactional Outbox.
 * Inserta primero en MongoDB mediante upsert idempotente y solo entonces
 * marca el evento como procesado en PostgreSQL. Puede reintentarse sin duplicar.
 */
function crearSincronizadorOutbox({ db, mongoDb, logger = console, intervaloMs = 2000, lote = 50 }) {
  const historial = mongoDb.collection(COLECCION_HISTORIAL);
  let timer = null;
  let ocupado = false;

  async function procesarPendientes() {
    if (ocupado) return { procesados: 0, omitido: true };
    ocupado = true;
    let procesados = 0;
    try {
      const { rows } = await db.query(
        `SELECT id, codigo_envio, tipo, datos, creado_en
         FROM eventos_salida
         WHERE procesado_en IS NULL
         ORDER BY creado_en, id
         LIMIT $1`,
        [lote]
      );
      for (const evento of rows) {
        try {
          const documento = {
            _id: evento.id,
            codigo_envio: evento.codigo_envio,
            tipo: evento.tipo,
            version: Number(evento.datos.version),
            estado: evento.datos.estado,
            actor: evento.datos.actor || null,
            detalle: evento.datos.detalle || {},
            creado_en: evento.creado_en
          };
          await historial.updateOne(
            { _id: evento.id },
            { $setOnInsert: documento },
            { upsert: true }
          );
          // El ACK se ejecuta únicamente después de confirmar la escritura Mongo.
          await db.query(
            `UPDATE eventos_salida
             SET procesado_en=NOW(), intentos=intentos+1
             WHERE id=$1 AND procesado_en IS NULL`,
            [evento.id]
          );
          procesados += 1;
        } catch (e) {
          await db.query(
            `UPDATE eventos_salida SET intentos=intentos+1
             WHERE id=$1 AND procesado_en IS NULL`,
            [evento.id]
          ).catch(() => {});
          logger.error?.(`[Persona 2] Evento ${evento.id} pendiente de reintento: ${e.message}`);
        }
      }
      return { procesados };
    } finally {
      ocupado = false;
    }
  }

  function iniciar() {
    if (timer) return;
    timer = setInterval(() => {
      procesarPendientes().catch(e => logger.error?.('[Persona 2] Error del sincronizador:', e.message));
    }, intervaloMs);
    timer.unref?.();
    procesarPendientes().catch(e => logger.error?.('[Persona 2] Error inicial:', e.message));
  }

  function detener() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { procesarPendientes, iniciar, detener };
}

async function prepararColecciones(mongoDb) {
  await mongoDb.collection(COLECCION_HISTORIAL).createIndex(
    { codigo_envio: 1, version: 1 }, { unique: true, name: 'ux_historial_envio_version' }
  );
  await mongoDb.collection(COLECCION_HISTORIAL).createIndex(
    { codigo_envio: 1, creado_en: 1 }, { name: 'ix_historial_envio_fecha' }
  );
  await mongoDb.collection(COLECCION_EVIDENCIAS).createIndex(
    { codigo_envio: 1 }, { unique: true, name: 'ux_evidencia_envio' }
  );
}

module.exports = {
  crearRouterPersona2,
  crearSincronizadorOutbox,
  prepararColecciones,
  TTL_POSICION_SEGUNDOS
};
