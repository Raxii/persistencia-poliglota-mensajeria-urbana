import {Link} from 'react-router-dom';

export default function NoEncontrada() {
  return (
    <div className="pagina-form">
      <h1>Página no encontrada</h1>
      <p className="texto-suave">La dirección no existe en esta aplicación.</p>
      <Link className="boton boton-primario" to="/">Volver al panel</Link>
    </div>
  );
}
