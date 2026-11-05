import {Navigate, Route, Routes} from 'react-router-dom';
import {useAuth} from './auth.jsx';
import Layout from './Layout.jsx';
import Login from './paginas/Login.jsx';
import Panel from './paginas/Panel.jsx';
import RegistrarEnvio from './paginas/RegistrarEnvio.jsx';
import Despacho from './paginas/Despacho.jsx';
import Administracion from './paginas/Administracion.jsx';
import Reparto from './paginas/Reparto.jsx';
import Seguimiento from './paginas/Seguimiento.jsx';
import Historial from './paginas/Historial.jsx';
import Evidencia from './paginas/Evidencia.jsx';
import NoEncontrada from './paginas/NoEncontrada.jsx';

// Protege una ruta: sin sesión va al login; con sesión de otro rol, al panel.
function Proteger({roles, children}) {
  const {sesion} = useAuth();
  if (!sesion) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(sesion.rol)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const {sesion} = useAuth();
  return (
    <Routes>
      <Route path="/login" element={sesion ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Layout />}>
        <Route index element={<Proteger><Panel /></Proteger>} />
        <Route path="/envios/nuevo" element={<Proteger roles={['cliente', 'operador', 'administrador']}><RegistrarEnvio /></Proteger>} />
        <Route path="/despacho" element={<Proteger roles={['operador', 'administrador']}><Despacho /></Proteger>} />
        <Route path="/administracion" element={<Proteger roles={['administrador']}><Administracion /></Proteger>} />
        <Route path="/reparto" element={<Proteger roles={['repartidor']}><Reparto /></Proteger>} />
        <Route path="/seguimiento" element={<Proteger><Seguimiento /></Proteger>} />
        <Route path="/seguimiento/:codigo" element={<Proteger><Seguimiento /></Proteger>} />
        <Route path="/envios/:codigo/historial" element={<Proteger><Historial /></Proteger>} />
        <Route path="/envios/:codigo/evidencia" element={<Proteger><Evidencia /></Proteger>} />
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}
