'use strict';

const TRANSICIONES = Object.freeze({
  creado: ['asignado', 'cancelado'],
  asignado: ['retirado', 'cancelado', 'creado'],
  retirado: ['en_transito', 'incidencia'],
  en_transito: ['incidencia', 'entregado'],
  incidencia: ['en_transito'],
  entregado: [],
  cancelado: []
});

const TIPOS_SERVICIO = ['estandar', 'express'];

function puedeCambiarEstado(actual, siguiente) {
  return (TRANSICIONES[actual] || []).includes(siguiente);
}

function hayCapacidad(repartidor) {
  return Boolean(repartidor.disponible) &&
    Number(repartidor.carga_actual) < Number(repartidor.capacidad_maxima);
}

function textoValido(valor, minimo = 1, maximo = 250) {
  return typeof valor === 'string' && valor.trim().length >= minimo && valor.trim().length <= maximo;
}

function enteroPositivo(valor) {
  return Number.isSafeInteger(valor) && valor > 0;
}

module.exports = {TRANSICIONES, TIPOS_SERVICIO, puedeCambiarEstado, hayCapacidad, textoValido, enteroPositivo};
