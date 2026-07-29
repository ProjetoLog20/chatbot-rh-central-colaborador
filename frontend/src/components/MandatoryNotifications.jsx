import { useEffect, useRef, useState } from 'react';
import { getNotifications, markAllNotificationsRead } from '../api.js';

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

export default function MandatoryNotifications({ user }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);

  async function checkNotifications({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await getNotifications();
      setItems((result.notificacoes || []).filter((item) => !Number(item.lida)));
    } catch (err) {
      if (!silent) {
        setError(err.error || 'Não foi possível verificar suas notificações.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return undefined;
    checkNotifications();

    const interval = window.setInterval(() => checkNotifications({ silent: true }), 60000);
    const handleFocus = () => checkNotifications({ silent: true });
    const handleUpdated = () => checkNotifications({ silent: true });
    window.addEventListener('focus', handleFocus);
    window.addEventListener('yuri:notifications-updated', handleUpdated);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('yuri:notifications-updated', handleUpdated);
    };
  }, [user?.id, user?.matricula]);

  useEffect(() => {
    if (!items.length) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [items.length]);

  async function readAllAndContinue() {
    setSaving(true);
    setError('');
    try {
      await markAllNotificationsRead();
      setItems([]);
      window.dispatchEvent(new CustomEvent('yuri:notifications-updated'));
    } catch (err) {
      setError(err.error || 'Não foi possível registrar a leitura. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  if (!user || (loading && !error) || (!loading && !error && !items.length)) return null;

  return (
    <div className="mandatory-notifications-gate" role="presentation">
      <section
        className="mandatory-notifications-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mandatory-notifications-title"
        tabIndex="-1"
        ref={dialogRef}
      >
        <div className="mandatory-notifications-heading">
          <span className="mandatory-notifications-symbol" aria-hidden="true">🔔</span>
          <div>
            <span>Antes de continuar</span>
            <h2 id="mandatory-notifications-title">Confira as novidades do Yuri</h2>
            <p>Leia os avisos abaixo e marque todos como lidos para liberar seu acesso.</p>
          </div>
        </div>

        {error ? (
          <div className="mandatory-notifications-error" role="alert">
            <strong>Não conseguimos carregar seus avisos.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => checkNotifications()}>Tentar novamente</button>
          </div>
        ) : (
          <>
            <div className="mandatory-notifications-count">
              {items.length} notificação{items.length === 1 ? '' : 'ões'} pendente{items.length === 1 ? '' : 's'}
            </div>
            <div className="mandatory-notifications-list">
              {items.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.titulo}</strong>
                    <time>{formatDate(item.inicio_em || item.created_at)}</time>
                  </div>
                  <p>{item.mensagem}</p>
                </article>
              ))}
            </div>
            <button
              className="mandatory-notifications-submit"
              type="button"
              disabled={saving}
              onClick={readAllAndContinue}
            >
              {saving ? 'Registrando leitura...' : 'Marcar todas como lidas e continuar'}
            </button>
            <small className="mandatory-notifications-note">
              Depois disso, os avisos continuam disponíveis no sininho.
            </small>
          </>
        )}
      </section>
    </div>
  );
}
