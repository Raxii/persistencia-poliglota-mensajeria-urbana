import {useCallback, useEffect, useState} from 'react';
import {useApi} from '../auth.jsx';
import {Cargando, Mensaje, Tarjeta} from '../componentes.jsx';

const VACIO = {codigo: '', nombre: '', zona_id: '', capacidad_maxima: '2'};

export default function Administracion() {
  const llamar = useApi();
  const [zonas, setZonas] = useState(null);
  const [repartidores, setRepartidores] = useState(null);
  const [nuevo, setNuevo] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState({tipo: '', texto: ''});
  const [capacidades, setCapacidades] = useState({});

  const cargar = useCallback(async () => {
    try {
      const [z, r] = await Promise.all([llamar('/api/zonas'), llamar('/api/repartidores')]);
      setZonas(z.datos);
      setRepartidores(r.datos);
    } catch (e) {
      setMensaje({tipo: 'error', texto: e.message});
    }
  }, [llamar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crear(e) {
    e.preventDefault();
    const errs = {};
    if (nuevo.codigo.trim().length < 3) errs.codigo = 'Mínimo 3 caracteres.';
    if (nuevo.nombre.trim().length < 2) errs.nombre = 'Mínimo 2 caracteres.';
    if (!nuevo.zona_id) errs.zona_id = 'Selecciona una zona.';
    const cap = Number(nuevo.capacidad_maxima);
    if (!Number.isInteger(cap) || cap <= 0) errs.capacidad_maxima = 'Debe ser un entero positivo.';
    setErrores(errs);
    if (Object.keys(errs).length) return;
    try {
      await llamar('/api/repartidores', {
        method: 'POST',
        body: {codigo: nuevo.codigo.trim(), nombre: nuevo.nombre.trim(), zona_id: Number(nuevo.zona_id), capacidad_maxima: cap}
      });
      setNuevo(VACIO);
      setMensaje({tipo: 'ok', texto: 'Repartidor creado.'});
      cargar();
    } catch (err) {
      setMensaje({tipo: 'error', texto: err.message});
    }
  }

  async function cambiarDisponible(r) {
    try {
      await llamar(`/api/repartidores/${r.id}`, {method: 'PATCH', body: {disponible: !r.disponible}});
      setMensaje({tipo: 'ok', texto: `${r.nombre} ahora está ${!r.disponible ? 'disponible' : 'no disponible'}.`});
      cargar();
    } catch (err) {
      setMensaje({tipo: 'error', texto: err.message});
    }
  }

  async function guardarCapacidad(r) {
    const valor = Number(capacidades[r.id]);
    if (!Number.isInteger(valor) || valor <= 0) {
      setMensaje({tipo: 'error', texto: 'La capacidad debe ser un entero positivo.'});
      return;
    }
    try {
      await llamar(`/api/repartidores/${r.id}`, {method: 'PATCH', body: {capacidad_maxima: valor}});
      setMensaje({tipo: 'ok', texto: `Capacidad de ${r.nombre} actualizada a ${valor}.`});
      cargar();
    } catch (err) {
      setMensaje({tipo: 'error', texto: err.message});
    }
  }

  if (!zonas || !repartidores) return mensaje.texto ? <Mensaje tipo="error">{mensaje.texto}</Mensaje> : <Cargando />;

  return (
    <div className="administracion">
      <h1>Zonas y repartidores</h1>
      <Mensaje tipo={mensaje.tipo}>{mensaje.texto}</Mensaje>

      <Tarjeta titulo="Zonas">
        <p className="texto-suave pequeno">
          La API expone las zonas en modo lectura; no hay endpoint para crearlas o desactivarlas.
        </p>
        <ul className="chips-estaticos">
          {zonas.map(z => (
            <li key={z.id} className={z.habilitada ? '' : 'inactiva'}>
              {z.nombre} {!z.habilitada && <small>(inactiva)</small>}
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Repartidores">
        <div className="tabla-contenedor">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Zona</th>
                <th>Carga</th>
                <th>Capacidad</th>
                <th>Disponible</th>
              </tr>
            </thead>
            <tbody>
              {repartidores.map(r => (
                <tr key={r.id}>
                  <td><code>{r.codigo}</code></td>
                  <td>{r.nombre}</td>
                  <td>{r.zona || '—'}</td>
                  <td>{r.carga_actual}</td>
                  <td>
                    <div className="fila-controles">
                      <input
                        type="number"
                        min="1"
                        aria-label={`Capacidad de ${r.codigo}`}
                        className="input-corto"
                        placeholder={String(r.capacidad_maxima)}
                        value={capacidades[r.id] ?? ''}
                        onChange={e => setCapacidades({...capacidades, [r.id]: e.target.value})}
                      />
                      <button type="button" className="boton" onClick={() => guardarCapacidad(r)}>Guardar</button>
                    </div>
                  </td>
                  <td>
                    <button type="button" className={`boton ${r.disponible ? 'boton-secundario' : 'boton-primario'}`} onClick={() => cambiarDisponible(r)}>
                      {r.disponible ? 'Sí · desactivar' : 'No · activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Nuevo repartidor">
        <form onSubmit={crear} noValidate className="formulario-grid">
          <label>
            Código
            <input value={nuevo.codigo} onChange={e => setNuevo({...nuevo, codigo: e.target.value})} />
            {errores.codigo && <span className="campo-error">{errores.codigo}</span>}
          </label>
          <label>
            Nombre
            <input value={nuevo.nombre} onChange={e => setNuevo({...nuevo, nombre: e.target.value})} />
            {errores.nombre && <span className="campo-error">{errores.nombre}</span>}
          </label>
          <label>
            Zona
            <select value={nuevo.zona_id} onChange={e => setNuevo({...nuevo, zona_id: e.target.value})}>
              <option value="">Seleccionar…</option>
              {zonas.filter(z => z.habilitada).map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            {errores.zona_id && <span className="campo-error">{errores.zona_id}</span>}
          </label>
          <label>
            Capacidad máxima
            <input type="number" min="1" value={nuevo.capacidad_maxima} onChange={e => setNuevo({...nuevo, capacidad_maxima: e.target.value})} />
            {errores.capacidad_maxima && <span className="campo-error">{errores.capacidad_maxima}</span>}
          </label>
          <div className="ancho-completo acciones-final">
            <button type="submit" className="boton boton-primario">Crear repartidor</button>
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
