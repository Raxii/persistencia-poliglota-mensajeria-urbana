import {useCallback, useEffect, useState} from 'react';
import {useApi} from '../auth.jsx';
import {BadgeEstado, Cargando, Mensaje, Tarjeta} from '../componentes.jsx';

// Pantalla de despacho: aceptar solicitudes, asignar repartidores, reasignar o liberar.
export default function Despacho() {
  const llamar = useApi();
  const [envios, setEnvios] = useState(null);
  const [repartidores, setRepartidores] = useState(null);
  const [seleccion, setSeleccion] = useState({});
  const [mensajes, setMensajes] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [ocupado, setOcupado] = useState('');

  const cargar = useCallback(async () => {
    setErrorGeneral('');
    try {
      const [e, r] = await Promise.all([llamar('/api/envios'), llamar('/api/repartidores')]);
      setEnvios(e.datos);
      setRepartidores(r.datos);
    } catch (err) {
      setErrorGeneral(err.message);
    }
  }, [llamar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const mensajeDe = (codigo, tipo, texto) => setMensajes(m => ({...m, [codigo]: {tipo, texto}}));

  async function ejecutar(clave, codigo, accion, exito) {
    setOcupado(clave);
    try {
      await accion();
      mensajeDe(codigo, 'ok', exito);
      await cargar();
    } catch (err) {
      mensajeDe(codigo, 'error', err.message);
    } finally {
      setOcupado('');
    }
  }

  if (errorGeneral && !envios) return <Mensaje tipo="error">{errorGeneral}</Mensaje>;
  if (!envios || !repartidores) return <Cargando />;

  const porAceptar = envios.filter(e => e.estado === 'creado' && !e.aceptado);
  const porAsignar = envios.filter(e => e.estado === 'creado' && e.aceptado);
  const asignados = envios.filter(e => e.estado === 'asignado');
  const nombreRep = id => repartidores.find(r => String(r.id) === String(id))?.nombre || `#${id}`;
  const conCupo = r => r.disponible && Number(r.carga_actual) < Number(r.capacidad_maxima);

  const bloqueMensaje = codigo =>
    mensajes[codigo] && <Mensaje tipo={mensajes[codigo].tipo}>{mensajes[codigo].texto}</Mensaje>;

  return (
    <div className="despacho">
      <h1>Despacho y asignación</h1>
      <Mensaje tipo="error">{errorGeneral}</Mensaje>

      <Tarjeta titulo="Capacidad de repartidores">
        <div className="tabla-contenedor">
          <table>
            <thead>
              <tr><th>Repartidor</th><th>Zona</th><th>Carga</th><th>Disponible</th></tr>
            </thead>
            <tbody>
              {repartidores.map(r => (
                <tr key={r.id}>
                  <td>{r.nombre} <small className="texto-suave">({r.codigo})</small></td>
                  <td>{r.zona || '—'}</td>
                  <td>
                    <span className={conCupo(r) ? '' : 'texto-alerta'}>{r.carga_actual} / {r.capacidad_maxima}</span>
                  </td>
                  <td>{r.disponible ? 'Sí' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo={`Solicitudes por aceptar (${porAceptar.length})`}>
        {porAceptar.length === 0 && <p className="texto-suave">No hay solicitudes pendientes de aceptación.</p>}
        <ul className="lista-acciones">
          {porAceptar.map(e => (
            <li key={e.codigo}>
              <div className="fila-envio">
                <div>
                  <code>{e.codigo}</code> · {e.destinatario} · <span className="texto-suave">{e.tipo_servicio}</span>
                </div>
                <button
                  type="button"
                  className="boton boton-primario"
                  disabled={ocupado === e.codigo}
                  onClick={() =>
                    ejecutar(e.codigo, e.codigo, () => llamar(`/api/envios/${e.codigo}/aceptar`, {method: 'POST'}), 'Solicitud aceptada.')
                  }
                >
                  Aceptar
                </button>
              </div>
              {bloqueMensaje(e.codigo)}
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo={`Aceptados para asignar (${porAsignar.length})`}>
        {porAsignar.length === 0 && <p className="texto-suave">No hay envíos aceptados pendientes de asignación.</p>}
        <ul className="lista-acciones">
          {porAsignar.map(e => {
            const elegido = seleccion[e.codigo] || '';
            return (
              <li key={e.codigo}>
                <div className="fila-envio">
                  <div>
                    <code>{e.codigo}</code> · {e.destinatario}
                  </div>
                  <div className="fila-controles">
                    <select
                      aria-label={`Repartidor para ${e.codigo}`}
                      value={elegido}
                      onChange={ev => setSeleccion({...seleccion, [e.codigo]: ev.target.value})}
                    >
                      <option value="">Elegir repartidor…</option>
                      {repartidores.map(r => (
                        <option key={r.id} value={r.id} disabled={!conCupo(r)}>
                          {r.nombre} ({r.carga_actual}/{r.capacidad_maxima}){conCupo(r) ? '' : ' — sin cupo'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="boton boton-primario"
                      disabled={!elegido || ocupado === e.codigo}
                      onClick={() =>
                        ejecutar(e.codigo, e.codigo, () =>
                          llamar('/api/asignaciones', {method: 'POST', body: {codigo_envio: e.codigo, repartidor_id: Number(elegido)}}),
                          'Envío asignado.')
                      }
                    >
                      Asignar
                    </button>
                  </div>
                </div>
                {bloqueMensaje(e.codigo)}
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      <Tarjeta titulo={`Asignados (${asignados.length})`}>
        {asignados.length === 0 && <p className="texto-suave">No hay envíos asignados en este momento.</p>}
        <ul className="lista-acciones">
          {asignados.map(e => {
            const elegido = seleccion[e.codigo] || '';
            return (
              <li key={e.codigo}>
                <div className="fila-envio">
                  <div>
                    <code>{e.codigo}</code> · <BadgeEstado estado={e.estado} /> · {nombreRep(e.repartidor_id)}
                  </div>
                  <div className="fila-controles">
                    <select
                      aria-label={`Nuevo repartidor para ${e.codigo}`}
                      value={elegido}
                      onChange={ev => setSeleccion({...seleccion, [e.codigo]: ev.target.value})}
                    >
                      <option value="">Reasignar a…</option>
                      {repartidores
                        .filter(r => String(r.id) !== String(e.repartidor_id))
                        .map(r => (
                          <option key={r.id} value={r.id} disabled={!conCupo(r)}>
                            {r.nombre} ({r.carga_actual}/{r.capacidad_maxima}){conCupo(r) ? '' : ' — sin cupo'}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="boton"
                      disabled={!elegido || ocupado === e.codigo}
                      onClick={() =>
                        ejecutar(e.codigo, e.codigo, () =>
                          llamar(`/api/asignaciones/${e.asignacion_id}/reasignar`, {method: 'PATCH', body: {repartidor_id: Number(elegido)}}),
                          'Envío reasignado.')
                      }
                    >
                      Reasignar
                    </button>
                    <button
                      type="button"
                      className="boton boton-peligro"
                      disabled={ocupado === e.codigo}
                      onClick={() =>
                        ejecutar(e.codigo, e.codigo, () => llamar(`/api/asignaciones/${e.asignacion_id}/liberar`, {method: 'POST'}),
                          'Asignación liberada; el envío vuelve a estado creado.')
                      }
                    >
                      Liberar
                    </button>
                  </div>
                </div>
                {bloqueMensaje(e.codigo)}
              </li>
            );
          })}
        </ul>
      </Tarjeta>
    </div>
  );
}
