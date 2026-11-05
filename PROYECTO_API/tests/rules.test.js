'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {puedeCambiarEstado, hayCapacidad, textoValido, enteroPositivo} = require('../src/rules');

test('no puede pasar directamente de creado a entregado', () => {
  assert.equal(puedeCambiarEstado('creado', 'entregado'), false);
});
test('puede pasar de asignado a retirado', () => {
  assert.equal(puedeCambiarEstado('asignado', 'retirado'), true);
});
test('estados finales no permiten transiciones', () => {
  assert.equal(puedeCambiarEstado('entregado', 'creado'), false);
  assert.equal(puedeCambiarEstado('cancelado', 'asignado'), false);
});
test('repartidor sin cupo o inactivo no acepta asignación', () => {
  assert.equal(hayCapacidad({disponible: true,carga_actual: 2,capacidad_maxima: 2}), false);
  assert.equal(hayCapacidad({disponible: false,carga_actual: 0,capacidad_maxima: 2}), false);
  assert.equal(hayCapacidad({disponible: true,carga_actual: 1,capacidad_maxima: 2}), true);
});
test('validación de textos y enteros', () => {
  assert.equal(textoValido('A', 1, 120), true);
  assert.equal(textoValido(''), false);
  assert.equal(enteroPositivo(2), true);
  assert.equal(enteroPositivo(-2), false);
  assert.equal(enteroPositivo('2'), false);
});
