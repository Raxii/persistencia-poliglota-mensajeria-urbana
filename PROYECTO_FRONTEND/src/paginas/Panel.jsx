import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth, useApi} from '../auth.jsx';
import {BadgeEstado, Cargando, Metrica, Mensaje, Tarjeta} from '../componentes.jsx';
import {ETIQUETAS_ESTADO, formatearFecha} from '../constantes.js';

const TEXTO_ROL = {
  cliente: 'Aquí ves tus envíos y puedes registrar nuevos.',
  operador: 'Revisa solicitudes pendientes, acéptalas y asígnalas a un repartidor.',
  repartidor: 'Estos son los envíos asignados a ti. Actualiza su estado durante el reparto.',
  administrador: 'Vista general del sistema, zonas, repartidores y despacho.'
};

export default function Panel() {
  const {sesion} = useAuth();
  const llamar = useApi();
  const [envios, setEnvios] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    llamar('/api/envios')
      .then(r => setEnvios(r.datos))
      .catch(e => setError(e.message));
  }, [llamar]);

  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!envios) return <Cargando />;

  const cuenta = estado => envios.filter(e => e.estado === estado).length;
  const pendientesAceptar = envios.filter(e => e.estado === 'creado' && !e.aceptado).length;

  return (
    <div className="panel">
      <h1>Hola, {sesion.usuario}</h1>
      <p className="texto-suave">{TEXTO_ROL[sesion.rol]}</p>

      <div className="metricas">
        {sesion.rol !== 'cliente' && (
          <Metrica etiqueta="Pendientes de aceptar" valor={pendientesAceptar} tono="alerta" />
        )}
        <Metrica etiqueta="Creados" valor={cuenta('creado')} />
        <Metrica etiqueta="Asignados" valor={cuenta('asignado')} />
        <Metrica etiqueta="En tránsito" valor={cuenta('en_transito') + cuenta('retirado')} tono="info" />
        <Metrica etiqueta="Incidencias" valor={cuenta('incidencia')} tono="alerta" />
        <Metrica etiqueta="Entregados" valor={cuenta('entregado')} tono="ok" />
      </div>

      <div className="accesos">
        {sesion.rol === 'cliente' && <Link className="boton boton-primario" to="/envios/nuevo">Registrar envío</Link>}
        {sesion.rol === 'operador' && <Link className="boton boton-primario" to="/despacho">Ir a despacho</Link>}
        {sesion.rol === 'administrador' && <Link className="boton boton-primario" to="/administracion">Zonas y repartidores</Link>}
        {sesion.rol === 'repartidor' && <Link className="boton boton-primario" to="/reparto">Ir a mi reparto</Link>}
      </div>

      <Tarjeta titulo={sesion.rol === 'repartidor' ? 'Mis envíos' : 'Envíos recientes'}>
        {envios.length === 0 ? (
          <p className="texto-suave">No hay envíos para mostrar.</p>
        ) : (
          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Destinatario</th>
                  <th>Servicio</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {envios.map(e => (
                  <tr key={e.codigo}>
                    <td><code>{e.codigo}</code></td>
                    <td>{e.destinatario}</td>
                    <td>{e.tipo_servicio}</td>
                    <td><BadgeEstado estado={e.estado} /></td>
                    <td>{formatearFecha(e.creado_en)}</td>
                    <td><Link to={`/seguimiento/${e.codigo}`}>Ver</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      <p className="texto-suave pequeno">Estados posibles: {Object.values(ETIQUETAS_ESTADO).join(' · ')}</p>
    </div>
  );
}
