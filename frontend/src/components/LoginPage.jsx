import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api.js';
import { setToken, decodeToken } from '../auth.js';

export default function LoginPage({ onLogin }) {
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const data = await login(matricula, senha);
      setToken(data.token);
      const user = decodeToken(data.token);
      onLogin(user);
      navigate('/');
    } catch (err) {
      setError(err.error || 'Falha no login');
    }
  }

  return (
    <div className="page-card login-card">
      <div className="login-brand">
        <img src="/rh-logo.jpg" alt="RH Log20 Cascavel" />
        <div>
          <h1>Login</h1>
          <p>Faca login com sua matricula e senha.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          Matricula
          <input value={matricula} onChange={(e) => setMatricula(e.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button type="submit">Entrar</button>
      </form>
    </div>
  );
}

