'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearSincronizadorOutbox } = require('../src/persona2');

function mockMongo({ fail = false } = {}) {
  const docs = new Map();
  const calls = [];
  return {
    docs, calls,
    collection() {
      return {
        async updateOne(filter, update, options) {
          calls.push({ filter, update, options });
          if (fail) throw new Error('MongoDB simulado no disponible');
          if (!docs.has(filter._id)) docs.set(filter._id, update.$setOnInsert);
          return { upsertedCount: 1 };
        }
      };
    }
  };
}

test('sincronizador inserta historial antes de marcar outbox procesado', async () => {
  const event = {
    id: '11111111-1111-4111-8111-111111111111',
    codigo_envio: 'ENV-ABC123',
    tipo: 'envio.creado',
    datos: { version: 1, estado: 'creado', actor: { usuario: 'cliente_demo', rol: 'cliente' }, detalle: {} },
    creado_en: new Date('2026-11-01T10:00:00Z')
  };
  const order = [];
  const db = {
    async query(sql) {
      if (sql.includes('SELECT id, codigo_envio')) {
        order.push('select');
        return { rows: [event] };
      }
      if (sql.includes('UPDATE eventos_salida')) {
        order.push('ack');
        return { rows: [] };
      }
      throw new Error('SQL inesperado');
    }
  };
  const mongo = mockMongo();
  const originalUpdate = mongo.collection().updateOne;
  const collection = mongo.collection();
  collection.updateOne = async (...args) => {
    order.push('mongo');
    return originalUpdate(...args);
  };
  mongo.collection = () => collection;

  const worker = crearSincronizadorOutbox({ db, mongoDb: mongo, logger: { error() {} } });
  const result = await worker.procesarPendientes();

  assert.equal(result.procesados, 1);
  assert.deepEqual(order, ['select', 'mongo', 'ack']);
  assert.equal(mongo.docs.get(event.id).version, 1);
  assert.equal(mongo.docs.get(event.id).codigo_envio, 'ENV-ABC123');
});

test('si MongoDB falla, el evento queda sin ACK y aumenta intentos', async () => {
  const event = {
    id: '22222222-2222-4222-8222-222222222222',
    codigo_envio: 'ENV-DEF456',
    tipo: 'envio.estado_actualizado',
    datos: { version: 2, estado: 'retirado' },
    creado_en: new Date()
  };
  const sql = [];
  const db = {
    async query(statement) {
      sql.push(statement);
      if (statement.includes('SELECT id, codigo_envio')) return { rows: [event] };
      return { rows: [] };
    }
  };
  const mongo = mockMongo({ fail: true });
  const worker = crearSincronizadorOutbox({ db, mongoDb: mongo, logger: { error() {} } });
  const result = await worker.procesarPendientes();

  assert.equal(result.procesados, 0);
  assert.equal(sql.filter(x => x.includes('SET procesado_en')).length, 0);
  assert.equal(sql.filter(x => x.includes('SET intentos=intentos+1')).length, 1);
});

test('sin eventos pendientes devuelve cero procesados', async () => {
  const db = { async query() { return { rows: [] }; } };
  const worker = crearSincronizadorOutbox({
    db, mongoDb: mockMongo(), logger: { error() {} }
  });
  assert.deepEqual(await worker.procesarPendientes(), { procesados: 0 });
});
