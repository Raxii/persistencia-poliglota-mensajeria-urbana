import {Navigate, NavLink, Outlet, useNavigate} from 'react-router-dom';
import {useAuth} from './auth.jsx';
import {ETIQUETAS_ROL} from './constantes.js';

// Qué enlaces ve cada rol en la navegación.
const ENLACES = [
  {to: '/', texto: 'Panel', roles: ['cliente', 'operador', 'repartidor', 'administrador']},
  {to: '/envios/nuevo', texto: 'Registrar envío', roles: ['cliente', 'operador', 'administrador']},
  {to: '/despacho', texto: 'Despacho', roles: ['operador', 'administrador']},
  {to: '/administracion', texto: 'Zonas y repartidores', roles: ['administrador']},
  {to: '/reparto', texto: 'Mi reparto', roles: ['repartidor']},
  {to: '/seguimiento', texto: 'Seguimiento', roles: ['cliente', 'operador', 'repartidor', 'administrador']}
];

export default function Layout() {
  const {sesion, logout} = useAuth();
  const navigate = useNavigate();
  if (!sesion) return <Navigate to="/login" replace />;
  const enlaces = ENLACES.filter(e => e.roles.includes(sesion.rol));

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera-fila">
          <span className="marca">Mensajería · Grupo 1</span>
          <div className="usuario">
            <span>
              {sesion.usuario} <small>({ETIQUETAS_ROL[sesion.rol] || sesion.rol})</small>
            </span>
            <button
              type="button"
              className="boton boton-secundario"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Salir
            </button>
          </div>
        </div>
        <nav className="menu" aria-label="Navegación principal">
          {enlaces.map(e => (
            <NavLink key={e.to} to={e.to} end={e.to === '/'}>
              {e.texto}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
      <footer className="pie">Datos ficticios · Pruebas académicas · API en {import.meta.env.VITE_API_URL || 'http://localhost:3000'}</footer>
    </div>
  );
}
