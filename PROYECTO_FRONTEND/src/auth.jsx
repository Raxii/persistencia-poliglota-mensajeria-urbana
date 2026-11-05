import {createContext, useCallback, useContext, useMemo, useState} from 'react';
import {api, ApiError} from './api.js';

const AuthContext = createContext(null);
const CLAVE_SESION = 'sesion-grupo1';

// La respuesta de login no incluye repartidor_id; viene dentro del JWT (solo lectura, sin verificar firma aquí).
function payloadDelToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) || {};
  } catch {
    return {};
  }
}

function leerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_SESION)) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({children}) {
  const [sesion, setSesion] = useState(leerSesion);

  const login = useCallback(async (usuario, clave) => {
    const r = await api('/api/auth/login', {method: 'POST', body: {usuario, clave}});
    const nueva = {
      token: r.token,
      usuario: r.usuario,
      rol: r.rol,
      repartidor_id: payloadDelToken(r.token).repartidor_id ?? null
    };
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(nueva));
    setSesion(nueva);
    return nueva;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(CLAVE_SESION);
    setSesion(null);
  }, []);

  const valor = useMemo(() => ({sesion, login, logout}), [sesion, login, logout]);
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// Devuelve una función que llama a la API con el token actual.
// Si el token caduca o no es válido (401), cierra la sesión automáticamente.
export function useApi() {
  const {sesion, logout} = useAuth();
  return useCallback(
    async (path, opciones = {}) => {
      try {
        return await api(path, {...opciones, token: sesion?.token});
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) logout();
        throw e;
      }
    },
    [sesion, logout]
  );
}
