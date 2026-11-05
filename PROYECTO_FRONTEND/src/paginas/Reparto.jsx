import {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useApi, useAuth} from '../auth.jsx';
import {BadgeEstado, Cargando, Mensaje, Tarjeta} from '../componentes.jsx';
import {ACCIONES_REPARTIDOR, ETIQUETAS_ESTADO} from '../constantes.js';

// Vista del repartidor: avanza los estados de sus envíos y comparte una posición temporal simulada.
export default function Reparto() {
  const {sesion} = useAuth();
  const llamar = useApi();
  const [envios, setEnvios] = useState(null);
  const [observaciones, setObservaciones] = useState({});
  const [mensajes, setMensajes] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [posicion, setPosicion] = useState({latitud: '-0.1807', longitud: '-78.4678', estado: 'en_ruta'});
  const [mensajePosicion, setMensajePosicion] = useState({tipo: '', texto: ''});

  const cargar = useCallback(async () => {
    try {
      const r = await llamar('/api/envios');
      setEnvios(r.datos);
      setErrorGeneral('');
    } catch (e) {
      setErrorGeneral(e.message);
    }
  }, [llamar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiarEstado(envio, estado) {
    setOcupado(envio.codigo);
    setMensajes(m => ({...m, [envio.codigo]: null}));
    try {
      const observacion = (observaciones[envio.codigo] || '').trim();
      await llamar(`/api/envios/${envio.codigo}/estado`, {
        method: 'PATCH',
        body: observacion ? {estado, observacion} : {estado}
      });
      setMensajes(m => ({...m, [envio.codigo]: {tipo: 'ok', texto: `Estado actualizado a «${ETIQUETAS_ESTADO[estado]}».`}}));
      setObservaciones(o => ({...o, [envio.codigo]: ''}));
      await cargar();
    } catch (err) {
      setMensajes(m => ({...m, [envio.codigo]: {tipo: 'error', texto: err.message}}));
    } finally {
      setOcupado('');
    }
  }

  async function enviarPosicion(e) {
    e.preventDefault();
    const lat = Number(posicion.latitud);
    const lon = Number(posicion.longitud);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setMensajePosicion({tipo: 'error', texto: 'Latitud (−90 a 90) y longitud (−180 a 180) deben ser números válidos.'});
      return;
    }
    try {
      const r = await llamar(`/api/repartidores/${sesion.repartidor_id}/posicion-temporal`, {
        method: 'POST',
        body: {latitud: lat, longitud: lon, estado: posicion.estado}
      });
      setMensajePosicion({tipo: 'ok', texto: `Posición registrada en Redis. Caduca en ${r.ttl_segundos} segundos si no se actualiza.`});
    } catch (err) {
      setMensajePosicion({tipo: 'error', texto: err.message});
    }
  }

  if (errorGeneral && !envios) return <Mensaje tipo="error">{errorGeneral}</Mensaje>;
  if (!envios) return <Cargando />;

  return (
    <div className="reparto">
      <h1>Mi reparto</h1>
      <p className="texto-suave">Solo aparecen los envíos con asignación activa a tu usuario.</p>
      <Mensaje tipo="error">{errorGeneral}</Mensaje>

      {envios.length === 0 && <Tarjeta><p className="texto-suave">No tienes envíos asignados.</p></Tarjeta>}

      <div className="tarjetas-envio">
        {envios.map(e => {
          const acciones = ACCIONES_REPARTIDOR[e.estado] || [];
          return (
            <Tarjeta key={e.codigo} className="tarjeta-envio">
              <header className="tarjeta-cabecera">
                <h2><code>{e.codigo}</code></h2>
                <BadgeEstado estado={e.estado} />
              </header>
              <p><strong>Destinatario:</strong> {e.destinatario}</p>
              <p className="texto-suave">Servicio {e.tipo_servicio}</p>
              {acciones.length > 0 ? (
                <>
                  <label>
                    Observación (opcional)
                    <input
                      maxLength={250}
                      value={observaciones[e.codigo] || ''}
                      onChange={ev => setObservaciones({...observaciones, [e.codigo]: ev.target.value})}
                    />
                  </label>
                  <div className="acciones-envio">
                    {acciones.map(a => (
                      <button
                        key={a.estado}
                        type="button"
                        className={`boton ${a.peligro ? 'boton-peligro' : 'boton-primario'}`}
                        disabled={ocupado === e.codigo}
                        onClick={() => cambiarEstado(e, a.estado)}
                      >
                        {a.texto}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="texto-suave">Sin acciones disponibles en este estado.</p>
              )}
              <Mensaje tipo={mensajes[e.codigo]?.tipo}>{mensajes[e.codigo]?.texto}</Mensaje>
              {e.estado === 'entregado' && <Link to={`/envios/${e.codigo}/evidencia`}>Registrar evidencia</Link>}
            </Tarjeta>
          );
        })}
      </div>

      <Tarjeta titulo="Posición temporal (simulada)">
        <p className="texto-suave pequeno">
          Coordenadas ficticias guardadas en Redis con TTL de 120 segundos. No afectan al estado oficial del envío.
        </p>
        <form onSubmit={enviarPosicion} className="formulario-grid">
          <label>
            Latitud
            <input value={posicion.latitud} onChange={e => setPosicion({...posicion, latitud: e.target.value})} />
          </label>
          <label>
            Longitud
            <input value={posicion.longitud} onChange={e => setPosicion({...posicion, longitud: e.target.value})} />
          </label>
          <label>
            Estado
            <select value={posicion.estado} onChange={e => setPosicion({...posicion, estado: e.target.value})}>
              <option value="en_linea">En línea</option>
              <option value="en_ruta">En ruta</option>
              <option value="desconectado">Desconectado</option>
            </select>
          </label>
          <div className="ancho-completo acciones-final">
            <button type="submit" className="boton boton-primario">Enviar posición</button>
          </div>
        </form>
        <Mensaje tipo={mensajePosicion.tipo}>{mensajePosicion.texto}</Mensaje>
      </Tarjeta>
    </div>
  );
}
