'use strict';
/**
 * Prueba funcional contra una API previamente arrancada, sin dependencias extra.
 * Ejecutar después de npm run seed. Usa únicamente datos ficticios.
 */
const crypto = require('node:crypto');
const API = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/,'');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo2026!';

async function request(path, {method = 'GET',token,body,headers = {}} = {}) {
  const respuesta = await fetch(`${API}${path}`, {
    method,
    headers: {...(body ? {'Content-Type':'application/json'} : {}),
      ...(token ? {Authorization:`Bearer ${token}`} : {}), ...headers},
    body: body ? JSON.stringify(body) : undefined
  });
  let datos;
  try {datos = await respuesta.json();} catch (_) {datos = {};}
  return {status:respuesta.status,...datos};
}
function check(cond, descripcion, resultado) {
  if (!cond) throw new Error(`${descripcion}: ${JSON.stringify(resultado)}`);
  console.log(`OK: ${descripcion}`);
}
async function login(usuario) {
  const r = await request('/api/auth/login', {method:'POST', body:{usuario,clave:DEMO_PASSWORD}});
  check(r.status === 200 && r.token, `login ${usuario}`, r);
  return r.token;
}
async function aceptarEnvio(codigo, operador) {
  const res = await request(`/api/envios/${codigo}/aceptar`, {method:'POST',token:operador});
  check(res.status===200 && res.dato.aceptado===true,`aceptar ${codigo}`,res);
}
function envioDatos(zona) {
  return {remitente:'Remitente Ficticio',destinatario:'Destinatario Ficticio',
    direccion_origen:'Calle Inventada 1',direccion_destino:'Av. Ejemplo 2',
    zona_origen_id: zona,zona_destino_id: zona,tipo_servicio:'estandar'};
}
async function main() {
  const health = await request('/health');
  check(health.status===200 && health.postgres==='ok', 'API y PostgreSQL disponibles', health);
  const [cliente,operador,repartidor] = await Promise.all([
    login('cliente_demo'),login('operador_demo'),login('repartidor_demo')]);
  const z = await request('/api/zonas',{token:operador});
  check(z.status===200 && z.datos.length>=1, 'zonas de ejemplo',z);
  const zona = Number(z.datos[0].id);
  const reps = await request('/api/repartidores',{token:operador});
  const rep1 = reps.datos.find(x=>x.codigo==='REP-001');
  const rep2 = reps.datos.find(x=>x.codigo==='REP-002');
  check(Boolean(rep1 && rep2),'repartidores semilla disponibles',reps);
  // Flujo 1: registro -> asignación -> seguimiento -> entrega.
  const key1 = crypto.randomUUID();
  const a = await request('/api/envios',{method:'POST',token:cliente,
    headers:{'Idempotency-Key':key1},body:envioDatos(zona)});
  check(a.status===201 && a.dato.codigo,'crear envío con código único',a);
  const rep = await request('/api/envios',{method:'POST',token:cliente,
    headers:{'Idempotency-Key':key1},body:envioDatos(zona)});
  check(rep.status===200 && rep.dato.codigo===a.dato.codigo,'idempotencia del registro',rep);
  await aceptarEnvio(a.dato.codigo,operador);
  const asig = await request('/api/asignaciones',{method:'POST',token:operador,
    body:{codigo_envio:a.dato.codigo,repartidor_id:Number(rep1.id)}});
  check(asig.status===201,'asignación inicial',asig);
  const duplicada = await request('/api/asignaciones',{method:'POST',token:operador,
    body:{codigo_envio:a.dato.codigo,repartidor_id:Number(rep2.id)}});
  check(duplicada.status===409,'rechazo de segunda asignación incompatible',duplicada);
  const incorrecto = await request(`/api/envios/${a.dato.codigo}/estado`,{method:'PATCH',token:repartidor,
    body:{estado:'entregado'}});
  check(incorrecto.status===409,'rechazo de transición de asignado a entregado',incorrecto);
  for (const estado of ['retirado','en_transito','entregado']) {
    const r = await request(`/api/envios/${a.dato.codigo}/estado`,{method:'PATCH',token:repartidor,
      body:{estado,observacion:'Evento ficticio de prueba'}});
    check(r.status===200 && r.dato.estado===estado,`paso a ${estado}`,r);
  }
  const entregaRepetida = await request(`/api/envios/${a.dato.codigo}/estado`,{
    method:'PATCH',token:repartidor,body:{estado:'entregado'}});
  check(entregaRepetida.status===200 && entregaRepetida.repetido===true,
    'repetir entrega no crea otro cambio', entregaRepetida);
  const consulta = await request(`/api/envios/${a.dato.codigo}`,{token:cliente});
  check(consulta.status===200 && consulta.dato.estado==='entregado','entrega consultable tras finalizar',consulta);
  // Flujo 2: capacidad del segundo repartidor (una unidad) y liberación.
  const b = await request('/api/envios',{method:'POST',token:cliente,
    headers:{'Idempotency-Key':crypto.randomUUID()},body:envioDatos(zona)});
  const c = await request('/api/envios',{method:'POST',token:cliente,
    headers:{'Idempotency-Key':crypto.randomUUID()},body:envioDatos(zona)});
  await aceptarEnvio(b.dato.codigo,operador);
  await aceptarEnvio(c.dato.codigo,operador);
  const primera = await request('/api/asignaciones',{method:'POST',token:operador,
    body:{codigo_envio:b.dato.codigo,repartidor_id:Number(rep2.id)}});
  check(primera.status===201,'ocupar capacidad de REP-002',primera);
  const sobre = await request('/api/asignaciones',{method:'POST',token:operador,
    body:{codigo_envio:c.dato.codigo,repartidor_id:Number(rep2.id)}});
  check(sobre.status===409,'rechazo de capacidad excedida',sobre);
  const liberacion = await request(`/api/asignaciones/${primera.dato.id}/liberar`,{method:'POST',token:operador});
  check(liberacion.status===200,'liberar cupo',liberacion);
  const reintento = await request('/api/asignaciones',{method:'POST',token:operador,
    body:{codigo_envio:c.dato.codigo,repartidor_id:Number(rep2.id)}});
  check(reintento.status===201,'cupo reutilizado tras liberación',reintento);
  const reasignada = await request(`/api/asignaciones/${reintento.dato.id}/reasignar`,{
    method:'PATCH',token:operador,body:{repartidor_id:Number(rep1.id)}});
  check(reasignada.status===201,'reasignación de REP-002 a REP-001',reasignada);
  const cancel = await request(`/api/envios/${c.dato.codigo}/cancelar`,{method:'POST',token:cliente});
  check(cancel.status===200 && cancel.dato.estado==='cancelado','cancelación y liberación de cupo',cancel);
  // Prueba concurrente: dos envíos compiten por el último cupo del mismo repartidor.
  const p = await request('/api/envios',{method:'POST',token:cliente,
    headers:{'Idempotency-Key':crypto.randomUUID()},body:envioDatos(zona)});
  const q = await request('/api/envios',{method:'POST',token:cliente,
    headers:{'Idempotency-Key':crypto.randomUUID()},body:envioDatos(zona)});
  await aceptarEnvio(p.dato.codigo,operador);
  await aceptarEnvio(q.dato.codigo,operador);
  const simultaneas = await Promise.all([p,q].map(x => request('/api/asignaciones',{
    method:'POST',token:operador,
    body:{codigo_envio:x.dato.codigo,repartidor_id:Number(rep2.id)}
  })));
  check(simultaneas.filter(x=>x.status===201).length===1 &&
    simultaneas.filter(x=>x.status===409).length===1,
    'dos peticiones simultáneas, solo una ocupa último cupo', simultaneas);
  const ganador = simultaneas[0].status===201 ? simultaneas[0] : simultaneas[1];
  const libero = await request(`/api/asignaciones/${ganador.dato.id}/liberar`,{
    method:'POST',token:operador});
  check(libero.status===200,'liberación posterior a carrera concurrente',libero);
  console.log('\nPruebas funcionales de la Persona 1 finalizadas correctamente.');
  console.log('Envío entregado:',a.dato.codigo);
}
main().catch(e=>{console.error('FALLÓ:',e.message);process.exitCode=1;});
