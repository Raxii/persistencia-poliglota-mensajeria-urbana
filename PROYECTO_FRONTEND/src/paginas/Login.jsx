import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../auth.jsx';
import {Mensaje} from '../componentes.jsx';

const CUENTAS_DEMO = [
  ['cliente_demo', 'Cliente'],
  ['operador_demo', 'Operador'],
  ['repartidor_demo', 'Repartidor'],
  ['admin_demo', 'Administrador']
];

export default function Login() {
  const {login} = useAuth();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    if (!usuario.trim() || !clave) {
      setError('Ingresa usuario y clave.');
      return;
    }
    setEnviando(true);
    try {
      await login(usuario.trim(), clave);
      navigate('/', {replace: true});
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-fondo">
      <section className="tarjeta login">
        <h1>Iniciar sesión</h1>
        <p className="texto-suave">Acceso al sistema de mensajería (datos ficticios).</p>
        <form onSubmit={enviar} noValidate>
          <label>
            Usuario
            <input
              name="usuario"
              autoComplete="username"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
            />
          </label>
          <label>
            Clave
            <input
              name="clave"
              type="password"
              autoComplete="current-password"
              value={clave}
              onChange={e => setClave(e.target.value)}
            />
          </label>
          <Mensaje tipo="error">{error}</Mensaje>
          <button type="submit" className="boton boton-primario ancho" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <div className="demo">
          <p className="texto-suave">Cuentas de demostración (clave <code>Demo2026!</code>):</p>
          <div className="chips">
            {CUENTAS_DEMO.map(([u, etiqueta]) => (
              <button
                key={u}
                type="button"
                className="chip"
                onClick={() => {
                  setUsuario(u);
                  setClave('Demo2026!');
                }}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
