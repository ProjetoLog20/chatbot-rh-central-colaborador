import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { primeiroAcesso } from '../api.js';
import { clearToken } from '../auth.js';

export default function FirstAccessPage({ onComplete }) {
  const [nomePreferido, setNomePreferido] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const firstAccess = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('firstAccess') || 'null');
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!firstAccess?.matricula || !firstAccess?.senhaAtual) {
      navigate('/login', { replace: true });
    }
  }, [firstAccess, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!nomePreferido.trim() || nomePreferido.trim().length < 2) {
      setError('Informe como você deseja ser chamado.');
      return;
    }

    if (novaSenha.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (novaSenha === 'log20') {
      setError('A nova senha não pode ser igual à senha temporária.');
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await primeiroAcesso({
        matricula: firstAccess.matricula,
        senhaAtual: firstAccess.senhaAtual,
        nomePreferido,
        novaSenha,
        confirmarSenha
      });

      clearToken();
      onComplete?.();
      navigate('/login', {
        replace: true,
        state: { message: 'Senha criada com sucesso. Acesse com sua nova senha.' }
      });
    } catch (err) {
      setError(err.error || 'Não foi possível configurar seu acesso.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="first-access-screen">
      <div className="first-access-card">
        <div className="first-access-brand">
          <img src="/rh-logo.jpg" alt="RH LOG20 Cascavel" />
          <span>RH LOG20 Cascavel</span>
        </div>

        <div className="first-access-copy">
          <h1>Ola, seja bem-vindo(a)!</h1>
          <p>Antes de acessar sua central, vamos configurar seu acesso com segurança.</p>
        </div>

        <form className="first-access-form" onSubmit={handleSubmit}>
          <label>
            Como você deseja ser chamado?
            <input
              value={nomePreferido}
              onChange={(e) => setNomePreferido(e.target.value)}
              placeholder="Ex.: Ana, Joao, Carol"
              autoFocus
              required
            />
          </label>

          <label>
            Crie sua nova senha
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
            />
          </label>

          <div className="password-tips">
            <span>Use pelo menos 6 caracteres.</span>
            <span>Não utilize a senha temporária log20.</span>
          </div>

          <label>
            Confirme sua nova senha
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              required
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar e acessar minha central'}
          </button>
        </form>
      </div>
    </section>
  );
}
