// Etiquetas y reglas de visualización. La validación definitiva siempre la hace la API.

export const ETIQUETAS_ESTADO = {
  creado: 'Creado',
  asignado: 'Asignado',
  retirado: 'Retirado',
  en_transito: 'En tránsito',
  incidencia: 'Incidencia',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

export const ETIQUETAS_ROL = {
  cliente: 'Cliente',
  operador: 'Operador',
  repartidor: 'Repartidor',
  administrador: 'Administrador'
};

// Transiciones que ofrece la vista del repartidor (espejo de src/rules.js de la API).
export const ACCIONES_REPARTIDOR = {
  asignado: [{estado: 'retirado', texto: 'Marcar retirado'}],
  retirado: [
    {estado: 'en_transito', texto: 'En tránsito'},
    {estado: 'incidencia', texto: 'Reportar incidencia', peligro: true}
  ],
  en_transito: [
    {estado: 'entregado', texto: 'Confirmar entrega'},
    {estado: 'incidencia', texto: 'Reportar incidencia', peligro: true}
  ],
  incidencia: [{estado: 'en_transito', texto: 'Reanudar en tránsito'}]
};

export const ESTADOS_CANCELABLES = ['creado', 'asignado'];

export function formatearFecha(valor) {
  if (!valor) return '—';
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return String(valor);
  return f.toLocaleString('es-EC', {dateStyle: 'short', timeStyle: 'short'});
}
