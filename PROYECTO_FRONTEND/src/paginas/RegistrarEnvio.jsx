import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useApi} from '../auth.jsx';
import {nuevaClaveIdempotencia} from '../api.js';
import {Cargando, Mensaje, Tarjeta} from '../componentes.jsx';

const VACIO = {
  remitente: '',
  destinatario: '',
  direccion_origen: '',
  direccion_destino: '',
  zona_origen_id: '',
  zona_destino_id: '',
  tipo_servicio: 'estandar'
};

export default function RegistrarEnvio() {
  const llamar = useApi();
  const [zonas, setZonas] = useState(null);
  const [datos, setDatos] = useState(VACIO);
  // La clave se mantiene mientras el formulario no tenga éxito: un doble clic reenvía la misma solicitud.
  const [clave, setClave] = useState(nuevaClaveIdempotencia);
  const [errores, setErrores] = useState({});
  const [mensajeGlobal, setMensajeGlobal] = useState('');
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    llamar('/api/zonas')
      .then(r => setZonas(r.datos.filter(z => z.habilitada)))
      .catch(e => setMensajeGlobal(e.message));
  }, [llamar]);

  const cambiar = campo => e => setDatos({...datos, [campo]: e.target.value});

  function validar() {
    const e = {};
    const minimos = [['remitente', 2], ['destinatario', 2], ['direccion_origen', 2], ['direccion_destino', 2]];
    for (const [campo, min] of minimos) {
      if (datos[campo].trim().length < min) e[campo] = `Mínimo ${min} caracteres.`;
    }
    if (!datos.zona_origen_id) e.zona_origen_id = 'Selecciona la zona de origen.';
    if (!datos.zona_destino_id) e.zona_destino_id = 'Selecciona la zona de destino.';
    return e;
  }

  async function enviar(e) {
    e.preventDefault();
    setMensajeGlobal('');
    setResultado(null);
    const errs = validar();
    setErrores(errs);
    if (Object.keys(errs).length) return;

    setEnviando(true);
    try {
      const r = await llamar('/api/envios', {
        method: 'POST',
        idempotencyKey: clave,
        body: {
          remitente: datos.remitente.trim(),
          destinatario: datos.destinatario.trim(),
          direccion_origen: datos.direccion_origen.trim(),
          direccion_destino: datos.direccion_destino.trim(),
          zona_origen_id: Number(datos.zona_origen_id),
          zona_destino_id: Number(datos.zona_destino_id),
          tipo_servicio: datos.tipo_servicio
        }
      });
      setResultado(r);
      setDatos(VACIO);
      setClave(nuevaClaveIdempotencia());
    } catch (err) {
      setMensajeGlobal(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!zonas && !mensajeGlobal) return <Cargando texto="Cargando zonas…" />;

  return (
    <div className="pagina-form">
      <h1>Registrar envío</h1>
      <Tarjeta>
        <form onSubmit={enviar} noValidate className="formulario-grid">
          <label>
            Remitente
            <input value={datos.remitente} onChange={cambiar('remitente')} />
            {errores.remitente && <span className="campo-error">{errores.remitente}</span>}
          </label>
          <label>
            Destinatario
            <input value={datos.destinatario} onChange={cambiar('destinatario')} />
            {errores.destinatario && <span className="campo-error">{errores.destinatario}</span>}
          </label>
          <label className="ancho-completo">
            Dirección de origen
            <input value={datos.direccion_origen} onChange={cambiar('direccion_origen')} />
            {errores.direccion_origen && <span className="campo-error">{errores.direccion_origen}</span>}
          </label>
          <label className="ancho-completo">
            Dirección de destino
            <input value={datos.direccion_destino} onChange={cambiar('direccion_destino')} />
            {errores.direccion_destino && <span className="campo-error">{errores.direccion_destino}</span>}
          </label>
          <label>
            Zona de origen
            <select value={datos.zona_origen_id} onChange={cambiar('zona_origen_id')}>
              <option value="">Seleccionar…</option>
              {(zonas || []).map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            {errores.zona_origen_id && <span className="campo-error">{errores.zona_origen_id}</span>}
          </label>
          <label>
            Zona de destino
            <select value={datos.zona_destino_id} onChange={cambiar('zona_destino_id')}>
              <option value="">Seleccionar…</option>
              {(zonas || []).map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            {errores.zona_destino_id && <span className="campo-error">{errores.zona_destino_id}</span>}
          </label>
          <fieldset className="ancho-completo">
            <legend>Tipo de servicio</legend>
            <label className="inline">
              <input type="radio" name="tipo" checked={datos.tipo_servicio === 'estandar'} onChange={() => setDatos({...datos, tipo_servicio: 'estandar'})} /> Estándar
            </label>
            <label className="inline">
              <input type="radio" name="tipo" checked={datos.tipo_servicio === 'express'} onChange={() => setDatos({...datos, tipo_servicio: 'express'})} /> Express
            </label>
          </fieldset>
          <div className="ancho-completo">
            <Mensaje tipo="error">{mensajeGlobal}</Mensaje>
            {resultado && (
              <Mensaje tipo="ok">
                {resultado.repetido
                  ? 'La solicitud ya había sido registrada. Se devolvió el mismo envío: '
                  : 'Envío registrado. Código: '}
                <strong>{resultado.dato.codigo}</strong> · <Link to={`/seguimiento/${resultado.dato.codigo}`}>Ver seguimiento</Link>
              </Mensaje>
            )}
          </div>
          <div className="ancho-completo acciones-final">
            <button type="submit" className="boton boton-primario" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar envío'}
            </button>
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
