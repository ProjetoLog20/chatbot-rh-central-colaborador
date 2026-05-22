import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page-card notfound-card">
      <h1>Página não encontrada</h1>
      <p>Volte para a <Link to="/">Página inicial</Link>.</p>
    </div>
  );
}
