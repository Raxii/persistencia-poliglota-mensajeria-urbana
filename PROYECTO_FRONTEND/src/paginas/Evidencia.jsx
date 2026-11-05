import {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {useApi, useAuth} from '../auth.jsx';
import {nuevaClaveIdempotencia} from '../api.js';
import {BadgeEstado, Cargando, Mensaje, Tarjeta} from '../componentes.jsx';
import {formatearFecha} from '../constantes.js';

const PUEDE_REGISTRAR = ['operador', 'administrador', 'repartidor'];

export default function Evidencia() {
  const {codigo} = useParams();
  const {sesion} = useAuth();
  const llamar = useApi();
  const [envio, setEnvio] = useState(null);
  const [evidencia, setEvidencia] = useState(undefined); // undefined: cargando; null: no existe
  const [error, setError] = useState('');
  const [datos, setDatos] = useState({receptor: '', observacion: '', referencia: ''});
  const [clave, setClave] = useState(nuevaClaveIdempotencia);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState({tipo: '', texto: ''});
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    try {
      const e = await llamar(`/api/envios/${codigo}`);
      setEnvio(e.dato);
    } catch (err) {
      setError(err.message);
    }
    try {
      const ev = await llamar(`/api/envios/${codigo}/evidencia`);
      setEvidencia(ev.dato);
    } catch (err) {
      if (err.status === 404) setEvidencia(null);
      else setError(err.message);
      // 404 también significa "sin evidencia"; el mensaje de módulo no disponible se muestra al registrar.
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  async function registrar(e) {
    e.preventDefault();
    const errs = {};
    if (datos.receptor.trim().length < 2) errs.receptor = 'Mínimo 2 caracteres.';
    if (datos.referencia.trim().length < 5) errs.referencia = 'Mínimo 5 caracteres (referencia simulada, p. ej. evidencia-demo://…).';
    setErrores(errs);
    if (Object.keys(errs).length) return;

    setEnviando(true);
    setMensaje({tipo: '', texto: ''});
    try {
      const r = await llamar(`/api/envios/${codigo}/evidencia`, {
        method: 'POST',
        idempotencyKey: clave,
        body: {
          receptor: datos.receptor.trim(),
          observacion: datos.observacion.trim() || undefined,
          referencia: datos.referencia.trim()
        }
      });
      setEvidencia(r.dato);
      setMensaje({tipo: 'ok', texto: r.repetido ? 'La evidencia ya estaba registrada.' : 'Evidencia registrada.'});
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err.status === 404 ? 'El registro de evidencia no está disponible en esta instancia de la API (MongoDB/Redis no configurados).' : err.message
      });
    } finally {
      setEnviando(false);
    }
  }

  if (error && !envio) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!envio || evidencia === undefined) return <Cargando />;

  const entregado = envio.estado === 'entregado';
  const puedeRegistrar = PUEDE_REGISTRAR.includes(sesion.rol) && entregado && evidencia === null;

  return (
    <div className="evidencia">
      <p><Link to={`/seguimiento/${codigo}`}>← Volver al seguimiento</Link></p>
      <h1>Evidencia de entrega · <code>{codigo}</code></h1>
      <p>Estado oficial: <BadgeEstado estado={envio.estado} /></p>
      <Mensaje tipo="error">{error}</Mensaje>

      {evidencia && (
        <Tarjeta titulo="Evidencia registrada">
          <dl className="detalle">
            <div><dt>Receptor</dt><dd>{evidencia.receptor}</dd></div>
            <div><dt>Observación</dt><dd>{evidencia.observacion || '—'}</dd></div>
            <div><dt>Referencia simulada</dt><dd><code>{evidencia.referencia}</code></dd></div>
            <div><dt>Registrada por</dt><dd>{evidencia.registrado_por?.usuario} ({evidencia.registrado_por?.rol})</dd></div>
            <div><dt>Fecha</dt><dd>{formatearFecha(evidencia.creado_en)}</dd></div>
          </dl>
          <p className="texto-suave pequeno">Evidencia ficticia: no se almacenan fotografías ni datos personales reales.</p>
        </Tarjeta>
      )}

      {!evidencia && !entregado && (
        <Tarjeta>
          <p className="texto-suave">
            La evidencia solo puede registrarse cuando PostgreSQL confirme el estado «Entregado».
          </p>
        </Tarjeta>
      )}

      {!evidencia && entregado && !puedeRegistrar && (
        <Tarjeta>
          <p className="texto-suave">Aún no hay evidencia registrada para este envío.</p>
        </Tarjeta>
      )}

      {puedeRegistrar && (
        <Tarjeta titulo="Registrar evidencia simulada">
          <form onSubmit={registrar} noValidate className="formulario-grid">
            <label>
              Receptor (ficticio)
              <input value={datos.receptor} onChange={e => setDatos({...datos, receptor: e.target.value})} />
              {errores.receptor && <span className="campo-error">{errores.receptor}</span>}
            </label>
            <label>
              Referencia simulada
              <input
                placeholder={`evidencia-demo://${codigo}/recibo-01`}
                value={datos.referencia}
                onChange={e => setDatos({...datos, referencia: e.target.value})}
              />
              {errores.referencia && <span className="campo-error">{errores.referencia}</span>}
            </label>
            <label className="ancho-completo">
              Observación (opcional)
              <input maxLength={250} value={datos.observacion} onChange={e => setDatos({...datos, observacion: e.target.value})} />
            </label>
            <div className="ancho-completo acciones-final">
              <button type="submit" className="boton boton-primario" disabled={enviando}>
                {enviando ? 'Guardando…' : 'Registrar evidencia'}
              </button>
            </div>
          </form>
          <Mensaje tipo={mensaje.tipo}>{mensaje.texto}</Mensaje>
        </Tarjeta>
      )}
    </div>
  );
}
