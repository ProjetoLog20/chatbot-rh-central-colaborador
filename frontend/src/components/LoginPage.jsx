import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api.js';
import { setToken, setUserData } from '../auth.js';
import LoginTransition from './LoginTransition.jsx';

export default function LoginPage({ onLogin }) {
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [showTransition, setShowTransition] = useState(false);
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(matricula, senha);

      if (data.requiresPasswordChange) {
        sessionStorage.setItem('firstAccess', JSON.stringify({
          matricula,
          senhaAtual: senha,
          nome_completo: data.nome_completo,
          perfil: data.perfil
        }));
        onLogin(null);
        navigate('/primeiro-acesso');
        return;
      }

      setToken(data.token);
      setUserData(data.usuario);
      onLogin(data.usuario);
      setShowTransition(true);
      window.setTimeout(() => {
        navigate('/');
      }, 1800);
    } catch (err) {
      setError(err.error || 'Falha no login');
      setLoading(false);
    }
  }

  if (showTransition) {
    return <LoginTransition />;
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
      {location.state?.message && <div className="form-success">{location.state.message}</div>}
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
        <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  );
}
