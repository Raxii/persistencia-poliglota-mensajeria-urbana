import {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {useApi, useAuth} from '../auth.jsx';
import {BadgeEstado, Cargando, Mensaje, Tarjeta} from '../componentes.jsx';
import {ESTADOS_CANCELABLES, formatearFecha} from '../constantes.js';

export default function Seguimiento() {
  const {sesion} = useAuth();
  const llamar = useApi();
  const navigate = useNavigate();
  const {codigo: codigoRuta} = useParams();
  const [entrada, setEntrada] = useState(codigoRuta || '');
  const [envio, setEnvio] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState({tipo: '', texto: ''});

  async function buscar(codigo) {
    const limpio = codigo.trim().toUpperCase();
    if (!limpio) {
      setError('Escribe el código del envío (ENV-…).');
      return;
    }
    setCargando(true);
    setError('');
    setMensaje({tipo: '', texto: ''});
    try {
      const r = await llamar(`/api/envios/${encodeURIComponent(limpio)}`);
      setEnvio(r.dato);
      if (limpio !== codigoRuta) navigate(`/seguimiento/${limpio}`, {replace: true});
    } catch (err) {
      setEnvio(null);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (codigoRuta) {
      setEntrada(codigoRuta);
      buscar(codigoRuta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoRuta]);

  async function cancelar() {
    try {
      const r = await llamar(`/api/envios/${envio.codigo}/cancelar`, {method: 'POST'});
      setEnvio(r.dato);
      setMensaje({tipo: 'ok', texto: 'El envío fue cancelado.'});
    } catch (err) {
      setMensaje({tipo: 'error', texto: err.message});
    }
  }

  const puedeCancelar = envio && ESTADOS_CANCELABLES.includes(envio.estado) && sesion.rol !== 'repartidor';

  return (
    <div className="seguimiento">
      <h1>Seguimiento de envío</h1>
      <form
        className="buscador"
        onSubmit={e => {
          e.preventDefault();
          buscar(entrada);
        }}
      >
        <label>
          Código del envío
          <input
            value={entrada}
            placeholder="ENV-XXXXXXXXXXXXXXXX"
            onChange={e => setEntrada(e.target.value)}
          />
        </label>
        <button type="submit" className="boton boton-primario" disabled={cargando}>
          {cargando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      <Mensaje tipo="error">{error}</Mensaje>
      {cargando && <Cargando texto="Consultando la API…" />}

      {envio && (
        <Tarjeta titulo={<><code>{envio.codigo}</code></>} acciones={<BadgeEstado estado={envio.estado} />}>
          <dl className="detalle">
            <div><dt>Remitente</dt><dd>{envio.remitente}</dd></div>
            <div><dt>Destinatario</dt><dd>{envio.destinatario}</dd></div>
            <div><dt>Origen</dt><dd>{envio.direccion_origen}</dd></div>
            <div><dt>Destino</dt><dd>{envio.direccion_destino}</dd></div>
            <div><dt>Servicio</dt><dd>{envio.tipo_servicio}</dd></div>
            <div><dt>Registrado</dt><dd>{formatearFecha(envio.creado_en)}</dd></div>
            <div><dt>Última actualización</dt><dd>{formatearFecha(envio.actualizado_en)}</dd></div>
            <div><dt>Versión</dt><dd>{envio.version}</dd></div>
            {sesion.rol !== 'cliente' && (
              <div><dt>Aceptado</dt><dd>{envio.aceptado ? 'Sí' : 'No'}</dd></div>
            )}
          </dl>
          <p className="texto-suave pequeno">
            El estado mostrado es el oficial de PostgreSQL. El historial se muestra como dato derivado y puede tener retraso.
          </p>

          <div className="acciones-envio">
            <Link className="boton" to={`/envios/${envio.codigo}/historial`}>Línea de tiempo</Link>
            <Link className="boton" to={`/envios/${envio.codigo}/evidencia`}>Evidencia de entrega</Link>
            {puedeCancelar && (
              <button type="button" className="boton boton-peligro" onClick={cancelar}>Cancelar envío</button>
            )}
          </div>
          <Mensaje tipo={mensaje.tipo}>{mensaje.texto}</Mensaje>
        </Tarjeta>
      )}
    </div>
  );
}
