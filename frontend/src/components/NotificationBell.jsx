import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../api.js';

const categoryLabels = {
  novidade: 'Novidades do Yuri',
  comunicado: 'Comunicado',
  premio: 'Premio atualizado',
  manutencao: 'Manutencao',
  seguranca: 'Seguranca',
  prazo: 'Prazo',
  reconhecimento: 'Reconhecimento'
};

const categoryIcons = {
  novidade: '✨',
  comunicado: '💬',
  premio: '⭐',
  manutencao: '🛠️',
  seguranca: '🛡️',
  prazo: '📅',
  reconhecimento: '🏆'
};

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef(null);

  async function refresh() {
    try {
      const data = await getNotifications();
      setItems(data.notificacoes || []);
      setUnread(Number(data.nao_lidas || 0));
    } catch (error) {
      console.error('Falha ao carregar notificacoes:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    function handlePointer(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handlePointer);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handlePointer);
    };
  }, [open]);

  async function markRead(item) {
    if (Number(item.lida)) return;
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, lida: 1 } : entry));
    setUnread((current) => Math.max(0, current - 1));
    try {
      await markNotificationRead(item.id);
    } catch {
      refresh();
    }
  }

  async function markAllRead() {
    setItems((current) => current.map((entry) => ({ ...entry, lida: 1 })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      refresh();
    }
  }

  function actionFor(item) {
    if (!item.link_url) return null;
    const label = item.link_texto || 'Ver detalhes';
    if (item.link_url.startsWith('/')) {
      return <Link to={item.link_url} onClick={() => { markRead(item); setOpen(false); }}>{label}</Link>;
    }
    return <a href={item.link_url} target="_blank" rel="noreferrer" onClick={() => markRead(item)}>{label}</a>;
  }

  return (
    <div className="notification-center" ref={panelRef}>
      <button
        type="button"
        className="notification-bell"
        aria-label={unread ? `Notificacoes, ${unread} nao lidas` : 'Notificacoes'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 ? <strong>{unread > 99 ? '99+' : unread}</strong> : null}
      </button>

      {open ? (
        <aside className="notification-drawer" aria-label="Central de Notificacoes do Yuri">
          <header>
            <div>
              <span>Central de Notificacoes</span>
              <h2>Novidades do Yuri</h2>
            </div>
            <button type="button" aria-label="Fechar notificacoes" onClick={() => setOpen(false)}>×</button>
          </header>

          <div className="notification-toolbar">
            <span>{unread ? `${unread} nao lida${unread === 1 ? '' : 's'}` : 'Tudo em dia'}</span>
            {unread ? <button type="button" onClick={markAllRead}>Marcar todas como lidas</button> : null}
          </div>

          <div className="notification-list">
            {loading ? <p className="notification-empty">Carregando avisos...</p> : null}
            {!loading && !items.length ? (
              <div className="notification-empty">
                <span aria-hidden="true">✓</span>
                <strong>Nenhuma novidade agora</strong>
                <p>Quando o Yuri tiver um aviso, ele aparecera aqui.</p>
              </div>
            ) : null}
            {items.map((item) => (
              <article
                className={`notification-item ${Number(item.lida) ? 'read' : 'unread'} priority-${item.prioridade}`}
                key={item.id}
                onClick={() => markRead(item)}
              >
                <span className={`notification-icon category-${item.categoria}`} aria-hidden="true">{categoryIcons[item.categoria] || '💬'}</span>
                <div>
                  <div className="notification-meta">
                    <span>{categoryLabels[item.categoria] || 'Comunicado'}</span>
                    {!Number(item.lida) ? <i>Nova</i> : null}
                  </div>
                  <h3>{item.titulo}</h3>
                  <p>{item.mensagem}</p>
                  <footer>
                    <time>{formatDate(item.inicio_em || item.created_at)}</time>
                    {actionFor(item)}
                  </footer>
                </div>
              </article>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
