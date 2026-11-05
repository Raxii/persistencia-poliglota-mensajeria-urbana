import {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {useApi} from '../auth.jsx';
import {BadgeEstado, Cargando, Mensaje, Tarjeta} from '../componentes.jsx';
import {ETIQUETAS_ESTADO, formatearFecha} from '../constantes.js';

const ETIQUETAS_TIPO = {
  'envio.creado': 'Envío registrado',
  'envio.aceptado': 'Solicitud aceptada',
  'envio.asignado': 'Repartidor asignado',
  'envio.reasignado': 'Envío reasignado',
  'envio.asignacion_liberada': 'Asignación liberada',
  'envio.estado_actualizado': 'Cambio de estado',
  'envio.cancelado': 'Envío cancelado'
};

// Si el módulo de Persona 2 no está activo (sin MONGODB_URI/REDIS_URL), la ruta no existe y la API responde 404.
function mensajeHistorial(err) {
  if (err.status === 404) {
    return 'El historial no está disponible en esta instancia de la API (MongoDB/Redis no configurados).';
  }
  return err.message;
}

// Línea de tiempo: combina el estado oficial (PostgreSQL) con el historial derivado (MongoDB).
export default function Historial() {
  const {codigo} = useParams();
  const llamar = useApi();
  const [envio, setEnvio] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [error, setError] = useState('');
  const [errorHistorial, setErrorHistorial] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const e = await llamar(`/api/envios/${codigo}`);
        if (vivo) setEnvio(e.dato);
      } catch (err) {
        if (vivo) setError(err.message);
      }
      try {
        const h = await llamar(`/api/envios/${codigo}/historial`);
        if (vivo) setHistorial(h.datos);
      } catch (err) {
        if (vivo) setErrorHistorial(mensajeHistorial(err));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [codigo, llamar]);

  if (error && !envio) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!envio) return <Cargando />;

  const ultimaVersionProyectada = historial?.length ? Math.max(...historial.map(h => Number(h.version))) : 0;
  const pendiente = historial && ultimaVersionProyectada < envio.version;

  return (
    <div className="historial">
      <p><Link to={`/seguimiento/${codigo}`}>← Volver al seguimiento</Link></p>
      <h1>Línea de tiempo · <code>{codigo}</code></h1>
      <p>Estado oficial: <BadgeEstado estado={envio.estado} /> (versión {envio.version})</p>

      <Tarjeta titulo="Eventos">
        {errorHistorial && <Mensaje tipo="error">{errorHistorial}</Mensaje>}
        {!historial && !errorHistorial && <Cargando texto="Cargando historial…" />}
        {pendiente && (
          <Mensaje tipo="info">
            El historial va hasta la versión {ultimaVersionProyectada}; el envío está en la versión {envio.version}.
            La sincronización es eventual y se completará en el siguiente ciclo.
          </Mensaje>
        )}
        {historial && historial.length === 0 && !pendiente && (
          <p className="texto-suave">Aún no hay eventos proyectados para este envío.</p>
        )}
        {historial && historial.length > 0 && (
          <ol className="linea-tiempo">
            {historial.map(evento => (
              <li key={evento._id}>
                <div className="linea-punto" aria-hidden="true" />
                <div className="linea-contenido">
                  <div className="linea-cabecera">
                    <strong>{ETIQUETAS_TIPO[evento.tipo] || evento.tipo}</strong>
                    <span className="texto-suave"> · v{evento.version} · {formatearFecha(evento.creado_en)}</span>
                  </div>
                  {evento.estado && <div>Estado: {ETIQUETAS_ESTADO[evento.estado] || evento.estado}</div>}
                  {evento.detalle?.anterior && evento.detalle?.nuevo && (
                    <div className="texto-suave">
                      {ETIQUETAS_ESTADO[evento.detalle.anterior] || evento.detalle.anterior} → {ETIQUETAS_ESTADO[evento.detalle.nuevo] || evento.detalle.nuevo}
                    </div>
                  )}
                  {evento.detalle?.observacion && <div className="texto-suave">Observación: {evento.detalle.observacion}</div>}
                  {evento.actor && <div className="texto-suave pequeno">Por {evento.actor.usuario} ({evento.actor.rol})</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Tarjeta>
    </div>
  );
}
