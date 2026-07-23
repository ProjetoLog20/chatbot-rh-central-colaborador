import { useEffect, useState } from 'react';
import { createNotification, deleteNotification, getAdminNotifications, updateNotification } from '../api.js';

const emptyForm = {
  titulo: '',
  mensagem: '',
  categoria: 'comunicado',
  prioridade: 'normal',
  status: 'rascunho',
  para_todos: true,
  para_admin: false,
  para_motorista: false,
  para_colaborador: false,
  link_url: '',
  link_texto: '',
  inicio_em: '',
  fim_em: '',
  enviar_push: false
};

const categories = [
  ['novidade', 'Novidades do Yuri'],
  ['comunicado', 'Comunicado'],
  ['premio', 'Prêmio atualizado'],
  ['manutencao', 'Manutenção'],
  ['seguranca', 'Segurança'],
  ['prazo', 'Prazo'],
  ['reconhecimento', 'Reconhecimento']
];

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function audienceLabel(item) {
  if (Number(item.para_todos)) return 'Todos';
  return [
    Number(item.para_admin) ? 'Administradores' : null,
    Number(item.para_motorista) ? 'Motoristas' : null,
    Number(item.para_colaborador) ? 'Colaboradores' : null
  ].filter(Boolean).join(', ');
}

export default function AdminNotifications() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setItems(await getAdminNotifications());
    } catch (error) {
      setMessage(error.error || 'Erro ao carregar notificacoes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function setAudience(field, checked) {
    if (field === 'para_todos') {
      setForm((current) => ({ ...current, para_todos: checked }));
      return;
    }
    setForm((current) => ({ ...current, [field]: checked, para_todos: checked ? false : current.para_todos }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function pushFeedback(push) {
    if (!push) return '';
    if (push.failed > 0) {
      return ` Push: ${push.sent} enviado(s) e ${push.failed} falha(s). Salve novamente para tentar reenviar.`;
    }
    if (push.targeted === 0) return ' Nenhum dispositivo estava inscrito no Push.';
    return ` Push enviado para ${push.sent} dispositivo(s).`;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    try {
      if (editingId) {
        const result = await updateNotification(editingId, form);
        const push = result.push_result;
        setMessage(`Notificação atualizada.${pushFeedback(push)}`);
      } else {
        const result = await createNotification(form);
        const push = result.push_result;
        setMessage(form.status === 'publicado' ? `Notificação publicada.${pushFeedback(push)}` : 'Rascunho salvo.');
      }
      resetForm();
      refresh();
    } catch (error) {
      setMessage(error.error || 'Erro ao salvar notificação.');
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      titulo: item.titulo || '',
      mensagem: item.mensagem || '',
      categoria: item.categoria || 'comunicado',
      prioridade: item.prioridade || 'normal',
      status: item.status || 'rascunho',
      para_todos: Boolean(Number(item.para_todos)),
      para_admin: Boolean(Number(item.para_admin)),
      para_motorista: Boolean(Number(item.para_motorista)),
      para_colaborador: Boolean(Number(item.para_colaborador)),
      link_url: item.link_url || '',
      link_texto: item.link_texto || '',
      inicio_em: toLocalDateTime(item.inicio_em),
      fim_em: toLocalDateTime(item.fim_em),
      enviar_push: Boolean(Number(item.enviar_push))
    });
    setMessage('Editando notificação selecionada.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(item) {
    if (!window.confirm(`Excluir a notificação "${item.titulo}"?`)) return;
    try {
      await deleteNotification(item.id);
      setMessage('Notificação excluída.');
      if (editingId === item.id) resetForm();
      refresh();
    } catch (error) {
      setMessage(error.error || 'Erro ao excluir notificação.');
    }
  }

  return (
    <section className="admin-section notification-admin">
      <div className="notification-admin-heading">
        <div>
          <h2>Central de Notificacoes do Yuri</h2>
          <p>Publique avisos, atualizacoes e Patch Notes para os usuarios da plataforma.</p>
        </div>
        <span>{items.length} mensagem{items.length === 1 ? '' : 's'}</span>
      </div>

      {message ? <p className="message">{message}</p> : null}

      <form className="admin-form notification-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="wide-field">
            Titulo
            <input maxLength="140" required value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} placeholder="Ex.: Prêmio de Produtividade atualizado" />
          </label>
          <label className="wide-field">
            Mensagem
            <textarea rows="5" maxLength="3000" required value={form.mensagem} onChange={(event) => setForm({ ...form, mensagem: event.target.value })} placeholder="Explique a novidade de forma simples e objetiva." />
          </label>
          <label>
            Categoria
            <select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}>
              {categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Prioridade
            <select value={form.prioridade} onChange={(event) => setForm({ ...form, prioridade: event.target.value })}>
              <option value="normal">Normal</option>
              <option value="importante">Importante</option>
              <option value="urgente">Urgente</option>
            </select>
          </label>
          <label>
            Status
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="rascunho">Rascunho</option>
              <option value="publicado">Publicado</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </label>
          <label>
            Publicar a partir de
            <input type="datetime-local" value={form.inicio_em} onChange={(event) => setForm({ ...form, inicio_em: event.target.value })} />
          </label>
          <label>
            Encerrar em
            <input type="datetime-local" value={form.fim_em} onChange={(event) => setForm({ ...form, fim_em: event.target.value })} />
          </label>
          <label>
            Link ou rota opcional
            <input value={form.link_url} onChange={(event) => setForm({ ...form, link_url: event.target.value })} placeholder="/produtividade ou https://..." />
          </label>
          <label>
            Texto do botao
            <input maxLength="80" value={form.link_texto} onChange={(event) => setForm({ ...form, link_texto: event.target.value })} placeholder="Ver meu prêmio" />
          </label>
        </div>

        <fieldset className="notification-audience">
          <legend>Quem recebera?</legend>
          <label><input type="checkbox" checked={form.para_todos} onChange={(event) => setAudience('para_todos', event.target.checked)} /> Todos</label>
          <label><input type="checkbox" checked={form.para_admin} onChange={(event) => setAudience('para_admin', event.target.checked)} /> Administradores</label>
          <label><input type="checkbox" checked={form.para_motorista} onChange={(event) => setAudience('para_motorista', event.target.checked)} /> Motoristas</label>
          <label><input type="checkbox" checked={form.para_colaborador} onChange={(event) => setAudience('para_colaborador', event.target.checked)} /> Colaboradores</label>
        </fieldset>

        <label className="notification-push-option">
          <input
            type="checkbox"
            checked={form.enviar_push}
            onChange={(event) => setForm({ ...form, enviar_push: event.target.checked })}
          />
          <span>
            <strong>Enviar tambem como Push</strong>
            <small>O aviso aparecera fora da plataforma para quem ativou a permissao. Evite dados pessoais ou valores sensiveis no texto.</small>
          </span>
        </label>

        <div className="notification-form-actions">
          <button type="submit">{editingId ? 'Salvar alterações' : form.status === 'publicado' ? 'Publicar notificação' : 'Salvar notificação'}</button>
          {editingId ? <button type="button" className="secondary" onClick={resetForm}>Cancelar edicao</button> : null}
        </div>
      </form>

      <div className="notification-admin-list">
        <h3>Historico de mensagens</h3>
        {loading ? <p>Carregando...</p> : null}
        {!loading && !items.length ? <p>Nenhuma notificação criada ainda.</p> : null}
        {items.map((item) => (
          <article key={item.id}>
            <div>
              <span className={`notification-status status-${item.status}`}>{item.status}</span>
              <span>{categories.find(([value]) => value === item.categoria)?.[1] || item.categoria}</span>
              <span>{item.prioridade}</span>
            </div>
            <h4>{item.titulo}</h4>
            <p>{item.mensagem}</p>
            <small>Publico: {audienceLabel(item)} · Leituras: {Number(item.total_leituras || 0)}</small>
            {Number(item.enviar_push) ? <small className="push-admin-status"> · Push: {item.push_enviado_em ? 'enviado' : 'aguardando publicacao/configuracao'}</small> : null}
            <footer>
              <button type="button" onClick={() => startEdit(item)}>Editar</button>
              <button type="button" className="danger" onClick={() => remove(item)}>Excluir</button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
