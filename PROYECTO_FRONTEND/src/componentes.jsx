import {ETIQUETAS_ESTADO} from './constantes.js';

export function BadgeEstado({estado}) {
  return <span className={`badge badge-${estado}`}>{ETIQUETAS_ESTADO[estado] || estado}</span>;
}

export function Mensaje({tipo = 'info', children}) {
  if (!children) return null;
  return (
    <div className={`mensaje mensaje-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Cargando({texto = 'Cargando…'}) {
  return <p className="cargando">{texto}</p>;
}

export function Tarjeta({titulo, acciones, children, className = ''}) {
  return (
    <section className={`tarjeta ${className}`}>
      {(titulo || acciones) && (
        <header className="tarjeta-cabecera">
          {titulo && <h2>{titulo}</h2>}
          {acciones && <div className="acciones">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Metrica({etiqueta, valor, tono}) {
  return (
    <div className={`metrica ${tono ? `metrica-${tono}` : ''}`}>
      <span className="metrica-valor">{valor}</span>
      <span className="metrica-etiqueta">{etiqueta}</span>
    </div>
  );
}
