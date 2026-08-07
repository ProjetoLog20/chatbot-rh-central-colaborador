import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight, CalendarBlank, ChatCircleText, Check, CheckCircle, ClockCountdown,
  DotsSixVertical, Eye, FunnelSimple, MagnifyingGlass, PencilSimple, Plus,
  ShieldCheck, UserCircle, Users, X
} from '@phosphor-icons/react';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import {
  addPlanoComment, addPlanoMember, createPlanoBucket, createPlanoCard,
  getPlanosMelhoria, updatePlanoCard, updatePlanoCardStatus
} from '../api.js';
import './planos-melhoria.css';

const CARD_KEY = 'yuri-planos-melhoria-preview-v2';
const COLUMN_KEY = 'yuri-planos-buckets-preview-v2';
const MEMBER_KEY = 'yuri-planos-membros-preview-v2';

const defaultColumns = [
  { id: 'ideias', title: 'Ideias', hint: 'Sugestões para avaliar', tone: 'slate' },
  { id: 'planejado', title: 'Vamos fazer', hint: 'Atividades já combinadas', tone: 'violet' },
  { id: 'andamento', title: 'Em andamento', hint: 'Alguém está cuidando', tone: 'blue' },
  { id: 'conferencia', title: 'Aguardando conferência', hint: 'Prontas para revisar', tone: 'amber' },
  { id: 'concluido', title: 'Concluído', hint: 'Melhorias entregues', tone: 'green' }
];

const defaultMembers = [
  { id: 'alysson', name: 'Alysson', grade: 1, role: 'Desenvolvedor' },
  { id: 'edward', name: 'Edward Costa', grade: 1, role: 'Gerente da Transportadora' },
  { id: 'dani', name: 'Dani', grade: 1, role: 'Coordenadora de Gente' },
  { id: 'marcos', name: 'Marcos', grade: 2, role: 'Responsável por atividade' },
  { id: 'visitante', name: 'Administrador visitante', grade: 3, role: 'Somente consulta' }
];

const defaultCards = [
  { id: 'acao-1', title: 'Criar o quadro de melhorias do Yuri', description: 'Organizar as ideias e acompanhar quem está cuidando de cada melhoria da plataforma.', column: 'andamento', owner: 'Alysson', priority: 'Alta', dueDate: '2026-08-08', labels: ['Plataforma', 'Organização'], checklist: { done: 3, total: 5 }, comments: [{ author: 'Dani', text: 'A linguagem está ficando bem mais simples.', date: 'Hoje, 09:20' }] },
  { id: 'acao-2', title: 'Revisar os textos da área administrativa', description: 'Deixar os nomes dos botões e avisos mais fáceis de entender.', column: 'planejado', owner: 'Dani', priority: 'Média', dueDate: '2026-08-14', labels: ['Comunicação'], checklist: { done: 0, total: 3 }, comments: [] },
  { id: 'acao-3', title: 'Separar sugestões por área', description: 'Usar marcadores para diferenciar assuntos de RH, operação e tecnologia.', column: 'ideias', owner: 'Edward Costa', priority: 'Baixa', dueDate: '', labels: ['Organização'], checklist: { done: 0, total: 0 }, comments: [] },
  { id: 'acao-4', title: 'Conferir o painel no celular', description: 'Validar se os cartões e os filtros continuam simples em uma tela menor.', column: 'conferencia', owner: 'Edward Costa', priority: 'Alta', dueDate: '2026-08-10', labels: ['Experiência'], checklist: { done: 4, total: 4 }, comments: [{ author: 'Edward Costa', text: 'Conferido no celular. Ficou simples de usar.', date: 'Ontem, 16:45' }] },
  { id: 'acao-5', title: 'Definir os responsáveis pelo plano', description: 'Confirmar os três administradores que acompanharão as melhorias.', column: 'concluido', owner: 'Dani', priority: 'Média', dueDate: '2026-08-07', labels: ['Equipe'], checklist: { done: 2, total: 2 }, comments: [] },
  { id: 'acao-6', title: 'Validar os avisos de prazo', description: 'Conferir se os avisos aparecem de forma clara para os administradores.', column: 'planejado', owner: 'Marcos', priority: 'Alta', dueDate: '2026-08-12', labels: ['Plataforma'], checklist: { done: 0, total: 2 }, comments: [] }
];

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) && value.length ? value : fallback;
  } catch { return fallback; }
}

function formatDate(value) {
  if (!value) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`)).replace('.', '');
}

function isLate(card, columns = defaultColumns) {
  const currentColumn = columns.find((item) => String(item.id) === String(card.column));
  const completed = currentColumn?.title?.toLowerCase() === 'concluído';
  return Boolean(card.dueDate && !completed && new Date(`${card.dueDate}T23:59:59`) < new Date());
}

function initials(name) {
  return String(name).split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function gradeInfo(grade) {
  return {
    1: { title: 'Grau 1', text: 'Controle completo', icon: ShieldCheck },
    2: { title: 'Grau 2', text: 'Ações designadas', icon: PencilSimple },
    3: { title: 'Grau 3', text: 'Somente leitura', icon: Eye }
  }[grade];
}

function ActionCard({ card, columns, canDrag, onMove, onOpen }) {
  const cardRef = useRef(null);
  const handleRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!cardRef.current || !handleRef.current || !canDrag) return undefined;
    return draggable({
      element: cardRef.current,
      dragHandle: handleRef.current,
      getInitialData: () => ({ type: 'yuri-action-card', cardId: card.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false)
    });
  }, [canDrag, card.id]);

  const progress = card.checklist?.total ? Math.round(card.checklist.done / card.checklist.total * 100) : 0;
  return (
    <article ref={cardRef} className={`plan-card ${dragging ? 'is-dragging' : ''}`}>
      <div className="plan-card-topline">
        <span className={`priority priority-${card.priority.toLowerCase()}`}>{card.priority}</span>
        {canDrag ? <button ref={handleRef} type="button" className="drag-handle" aria-label={`Mover ${card.title}`} title="Segure para mover"><DotsSixVertical size={20} weight="bold" /></button> : <Eye size={17} className="readonly-eye" />}
      </div>
      <button type="button" className="plan-card-content" onClick={() => onOpen(card)}><strong>{card.title}</strong><p>{card.description}</p></button>
      <div className="plan-labels">{card.labels.map((label) => <span key={label}>{label}</span>)}</div>
      {card.checklist?.total ? <div className="plan-progress"><span><i style={{ width: `${progress}%` }} /></span><small><Check size={13} /> {card.checklist.done}/{card.checklist.total}</small></div> : null}
      <div className="plan-card-footer">
        <span className="plan-owner"><UserCircle size={18} weight="fill" /> {card.owner}</span>
        <span className={isLate(card, columns) ? 'plan-due late' : 'plan-due'}><CalendarBlank size={16} /> {isLate(card, columns) ? 'Atrasada' : formatDate(card.dueDate)}</span>
      </div>
      {card.comments?.length ? <span className="comment-count"><ChatCircleText size={15} /> {card.comments.length} comentário{card.comments.length > 1 ? 's' : ''}</span> : null}
      {canDrag ? <label className="quick-move"><span>Mover para</span><select value={card.column} onChange={(event) => onMove(card.id, event.target.value)}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label> : null}
    </article>
  );
}

function ActionColumn({ column, cards, columns, canManage, onMove, onOpen }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!ref.current || !canManage) return undefined;
    return dropTargetForElements({
      element: ref.current,
      canDrop: ({ source }) => source.data.type === 'yuri-action-card',
      getData: () => ({ type: 'yuri-action-column', columnId: column.id }),
      onDragEnter: () => setOver(true), onDragLeave: () => setOver(false), onDrop: () => setOver(false)
    });
  }, [canManage, column.id]);
  return (
    <section ref={ref} className={`plan-column tone-${column.tone} ${over ? 'is-over' : ''}`}>
      <header><div><i /><strong>{column.title}</strong><span>{cards.length}</span></div><small>{column.hint}</small></header>
      <div className="plan-column-cards">
        {cards.map((card) => <ActionCard key={card.id} card={card} columns={columns} canDrag={canManage} onMove={onMove} onOpen={onOpen} />)}
        {!cards.length ? <div className="plan-column-empty">{canManage ? 'Solte uma atividade aqui' : 'Nenhuma atividade'}</div> : null}
      </div>
    </section>
  );
}

function ActionModal({ card, columns, members, currentMember, onClose, onSave, onComment, onStatus }) {
  const canManage = currentMember.grade === 1;
  const canRespond = currentMember.grade === 2 && card?.owner === currentMember.name;
  const progressColumn = columns.find((item) => item.title.toLowerCase() === 'em andamento')?.id || 'andamento';
  const reviewColumn = columns.find((item) => item.title.toLowerCase() === 'aguardando conferência')?.id || 'conferencia';
  const [form, setForm] = useState(card || { title: '', description: '', column: columns[0]?.id || '', ownerId: members[0]?.id || '', owner: members[0]?.name || '', priority: 'Média', dueDate: '', labels: [], comments: [] });
  const [comment, setComment] = useState('');

  function submit(event) {
    event.preventDefault();
    if (!canManage || !form.title.trim()) return;
    onSave({ ...form, title: form.title.trim(), description: form.description.trim() || 'Sem descrição.', labels: form.labels?.length ? form.labels : ['Plataforma'], checklist: form.checklist || { done: 0, total: 0 }, comments: form.comments || [] }, !card);
  }

  function addComment() {
    if (!comment.trim()) return;
    onComment(form, comment.trim());
  }

  function updateStatus(column) {
    onStatus(form, column);
  }

  return (
    <div className="plan-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.form className="plan-modal" onSubmit={submit} initial={{ opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
        <header><div><small>{card ? 'DETALHES DA ATIVIDADE' : 'NOVA ATIVIDADE'}</small><h2>{card ? card.title : 'O que precisa ser feito?'}</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header>
        {canManage ? <>
          <label>O que precisa ser feito<input autoFocus value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Melhorar a página inicial" /></label>
          <label>Descrição<textarea rows="3" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Explique de forma simples o resultado esperado" /></label>
          <div className="plan-modal-grid">
            <label>Quem vai cuidar<select value={String(form.ownerId || '')} onChange={(event) => { const member = members.find((item) => String(item.id) === event.target.value); setForm((current) => ({ ...current, ownerId: member?.id || '', owner: member?.name || '' })); }}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label>Importância<select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select></label>
            <label>Andamento<select value={form.column} onChange={(event) => setForm((current) => ({ ...current, column: event.target.value }))}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label>
            <label>Prazo<input type="date" value={form.dueDate} onInput={(event) => setForm((current) => ({ ...current, dueDate: event.currentTarget.value }))} /></label>
          </div>
        </> : <div className="readonly-details"><p>{form.description}</p><div><span><UserCircle /> Responsável: <b>{form.owner}</b></span><span><CalendarBlank /> Prazo: <b>{formatDate(form.dueDate)}</b></span></div></div>}

        {form.comments?.length ? <section className="comments-panel"><strong>Comentários</strong>{form.comments.map((item, index) => <article key={`${item.date}-${index}`}><span>{initials(item.author)}</span><div><b>{item.author}</b><small>{item.date}</small><p>{item.text}</p></div></article>)}</section> : null}
        {(canManage || canRespond) && card ? <div className="comment-form"><label>Deixar um comentário<textarea rows="2" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escreva uma atualização curta" /></label><button type="button" onClick={addComment} disabled={!comment.trim()}><ChatCircleText /> Comentar</button></div> : null}
        {currentMember.grade === 3 ? <div className="readonly-note"><Eye /> Você pode consultar as atividades, mas não pode alterá-las.</div> : null}
        <footer>
          <button type="button" className="secondary" onClick={onClose}>Fechar</button>
          {canRespond ? <><button type="button" className="status-button progress" onClick={() => updateStatus(progressColumn)}><ClockCountdown /> Em andamento</button><button type="button" className="status-button ok" onClick={() => updateStatus(reviewColumn)}><CheckCircle /> Dar OK</button></> : null}
          {canManage ? <button type="submit" className="primary"><CheckCircle size={19} weight="fill" /> Salvar atividade</button> : null}
        </footer>
      </motion.form>
    </div>
  );
}

function TeamModal({ members, previewMode, onClose, onAdd }) {
  const [identity, setIdentity] = useState('');
  const [grade, setGrade] = useState(2);
  function submit(event) {
    event.preventDefault();
    if (!identity.trim()) return;
    onAdd(previewMode
      ? { id: `member-${Date.now()}`, name: identity.trim(), grade: Number(grade), role: 'Administrador convidado' }
      : { matricula: identity.trim(), grade: Number(grade) });
    setIdentity('');
  }
  return <div className="plan-modal-backdrop"><motion.div className="plan-modal team-modal" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
    <header><div><small>ACESSOS AO PLANO</small><h2>Administradores e permissões</h2></div><button onClick={onClose} aria-label="Fechar"><X /></button></header>
    <div className="grade-guide">{[1, 2, 3].map((item) => { const info = gradeInfo(item); const Icon = info.icon; return <article key={item}><Icon /><div><b>{info.title}</b><small>{info.text}</small></div></article>; })}</div>
    <div className="member-list">{members.map((member) => <article key={member.id}><span>{initials(member.name)}</span><div><b>{member.name}</b><small>{member.role}</small></div><em className={`grade grade-${member.grade}`}>Grau {member.grade}</em></article>)}</div>
    <form className="add-member" onSubmit={submit}><label>{previewMode ? 'Nome' : 'Matrícula'}<input value={identity} onChange={(event) => setIdentity(event.target.value)} placeholder={previewMode ? 'Nome do administrador' : 'Digite a matrícula'} /></label><label>Nível de acesso<select value={grade} onChange={(event) => setGrade(event.target.value)}><option value="1">Grau 1 — controle completo</option><option value="2">Grau 2 — ações designadas</option><option value="3">Grau 3 — somente leitura</option></select></label><button><Plus /> Adicionar</button></form>
  </motion.div></div>;
}

function BucketModal({ onClose, onAdd }) {
  const [title, setTitle] = useState('');
  function submit(event) { event.preventDefault(); if (title.trim()) onAdd(title.trim()); }
  return <div className="plan-modal-backdrop"><motion.form className="plan-modal bucket-modal" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}><header><div><small>NOVA COLUNA</small><h2>Criar uma etapa do plano</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X /></button></header><p>Crie uma coluna com um nome simples, como “Aguardando orçamento” ou “Para o próximo mês”.</p><label>Nome da coluna<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Aguardando aprovação" /></label><footer><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary"><Plus /> Criar coluna</button></footer></motion.form></div>;
}

export default function PlanosMelhoriaPage({ previewMode = false, user = null }) {
  const [cards, setCards] = useState(() => previewMode ? readStorage(CARD_KEY, defaultCards) : []);
  const [columns, setColumns] = useState(() => previewMode ? readStorage(COLUMN_KEY, defaultColumns) : []);
  const [members, setMembers] = useState(() => previewMode ? readStorage(MEMBER_KEY, defaultMembers) : []);
  const [currentId, setCurrentId] = useState('alysson');
  const [serverMember, setServerMember] = useState(null);
  const [loading, setLoading] = useState(!previewMode);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('Todos');
  const [selectedCard, setSelectedCard] = useState();
  const [modal, setModal] = useState('');
  const currentMember = previewMode
    ? (members.find((member) => member.id === currentId) || members[0])
    : (serverMember || { id: user?.id, name: user?.nome_preferido || user?.nome_completo || 'Administrador', grade: 1 });
  const canManage = currentMember?.grade === 1;

  async function refreshPlan() {
    if (previewMode) return;
    try {
      setLoading(true);
      const data = await getPlanosMelhoria();
      setCards(data.cards || []);
      setColumns(data.columns || []);
      setMembers(data.members || []);
      setServerMember(data.currentMember);
      setMessage('');
    } catch (error) {
      setMessage(error?.error || 'Não foi possível abrir o Plano de Melhorias.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshPlan(); }, [previewMode]);
  useEffect(() => { if (previewMode) localStorage.setItem(CARD_KEY, JSON.stringify(cards)); }, [cards, previewMode]);
  useEffect(() => { if (previewMode) localStorage.setItem(COLUMN_KEY, JSON.stringify(columns)); }, [columns, previewMode]);
  useEffect(() => { if (previewMode) localStorage.setItem(MEMBER_KEY, JSON.stringify(members)); }, [members, previewMode]);
  useEffect(() => monitorForElements({
    canMonitor: ({ source }) => canManage && source.data.type === 'yuri-action-card',
    onDrop: ({ source, location }) => {
      const target = location.current.dropTargets.find((item) => item.data.type === 'yuri-action-column');
      if (target) setCards((current) => current.map((item) => item.id === source.data.cardId ? { ...item, column: target.data.columnId } : item));
    }
  }), [canManage]);

  async function moveCard(id, column) {
    if (!canManage) return;
    if (previewMode) {
      setCards((current) => current.map((card) => card.id === id ? { ...card, column } : card));
      return;
    }
    const card = cards.find((item) => item.id === id);
    if (!card) return;
    setCards((current) => current.map((item) => item.id === id ? { ...item, column } : item));
    try { await updatePlanoCard(id, { ...card, column }); }
    catch (error) { setMessage(error?.error || 'Não foi possível mover a atividade.'); await refreshPlan(); }
  }
  async function saveCard(card, isNew = false) {
    if (previewMode) {
      const previewCard = isNew ? { ...card, id: `acao-${Date.now()}` } : card;
      setCards((current) => current.some((item) => item.id === previewCard.id) ? current.map((item) => item.id === previewCard.id ? previewCard : item) : [previewCard, ...current]);
    } else {
      if (isNew) await createPlanoCard(card);
      else await updatePlanoCard(card.id, card);
      await refreshPlan();
    }
    setModal(''); setSelectedCard(undefined); setMessage('');
  }
  async function commentCard(card, comment) {
    if (previewMode) {
      saveCard({ ...card, comments: [...(card.comments || []), { author: currentMember.name, text: comment, date: 'Agora' }] });
    } else {
      await addPlanoComment(card.id, comment); await refreshPlan(); setModal(''); setSelectedCard(undefined);
    }
  }
  async function changeStatus(card, column) {
    if (previewMode) {
      saveCard({ ...card, column, comments: [...(card.comments || []), { author: currentMember.name, text: column === 'andamento' ? 'Iniciou esta atividade.' : 'Conferiu a atividade e deu OK.', date: 'Agora' }] });
    } else {
      await updatePlanoCardStatus(card.id, column); await refreshPlan(); setModal(''); setSelectedCard(undefined);
    }
  }
  function openCard(card) { setSelectedCard(card); setModal('card'); }
  async function addColumn(title) {
    if (previewMode) setColumns((current) => [...current, { id: `bucket-${Date.now()}`, title, hint: 'Etapa personalizada', tone: 'rose' }]);
    else { await createPlanoBucket({ title }); await refreshPlan(); }
    setModal('');
  }
  async function addMember(member) {
    if (previewMode) setMembers((current) => [...current, member]);
    else { await addPlanoMember(member); await refreshPlan(); }
  }

  const visibleCards = useMemo(() => cards.filter((card) => {
    if (currentMember.grade === 2 && card.owner !== currentMember.name) return false;
    const search = query.trim().toLowerCase();
    return (!search || `${card.title} ${card.description} ${card.labels.join(' ')}`.toLowerCase().includes(search)) && (owner === 'Todos' || card.owner === owner);
  }), [cards, currentMember, owner, query]);
  const completedIds = new Set(columns.filter((item) => item.title.toLowerCase() === 'concluído').map((item) => String(item.id)));
  const doingIds = new Set(columns.filter((item) => item.title.toLowerCase() === 'em andamento').map((item) => String(item.id)));
  const stats = { open: visibleCards.filter((card) => !completedIds.has(String(card.column))).length, doing: visibleCards.filter((card) => doingIds.has(String(card.column))).length, late: visibleCards.filter((card) => isLate(card, columns)).length, done: visibleCards.filter((card) => completedIds.has(String(card.column))).length };
  const accessInfo = gradeInfo(currentMember.grade);

  if (loading) return <div className="plans-loading"><ClockCountdown /> Abrindo o Plano de Melhorias...</div>;
  if (!previewMode && message && !columns.length) return <div className="plans-error"><strong>Não foi possível abrir o plano</strong><p>{message}</p></div>;

  return <div className="plans-page">
    <section className="plans-hero-v2">
      <div className="plans-hero-copy"><span className="plans-eyebrow">CENTRAL DE EVOLUÇÃO</span><h1>Plano de Melhorias do Yuri</h1><p>Ideias organizadas, responsáveis definidos e o andamento visível para todos.</p><div className="plans-team">{members.slice(0, 5).map((member, index) => <span key={member.id} style={{ '--index': index }} title={`${member.name} — Grau ${member.grade}`}>{initials(member.name)}</span>)}<small>{members.length} administradores no plano</small></div></div>
      <div className="hero-access-card"><small>{previewMode ? 'VOCÊ ESTÁ VISUALIZANDO COMO' : 'SEU ACESSO AO PLANO'}</small><label><span>{initials(currentMember.name)}</span>{previewMode ? <select value={currentId} onChange={(event) => { setCurrentId(event.target.value); setOwner('Todos'); }}>{members.map((member) => <option key={member.id} value={member.id}>{member.name} — Grau {member.grade}</option>)}</select> : <strong className="current-access-name">{currentMember.name}</strong>}</label><div><ShieldCheck /><span><b>{accessInfo.title}</b><small>{accessInfo.text}</small></span></div></div>
    </section>

    <section className="plans-command-bar"><div><h2>Quadro de atividades</h2><span>{currentMember.grade === 2 ? 'Mostrando somente as atividades designadas a você' : currentMember.grade === 3 ? 'Visualização sem permissão para alterações' : 'Você possui controle completo deste plano'}</span></div>{canManage ? <div><button className="outline-command" onClick={() => setModal('team')}><Users /> Administradores</button><button className="outline-command" onClick={() => setModal('bucket')}><Plus /> Criar coluna</button><button className="new-plan-button" onClick={() => { setSelectedCard(undefined); setModal('card'); }}><Plus /> Nova atividade</button></div> : null}</section>

    <section className="plans-summary"><article><span className="summary-icon open"><ArrowRight /></span><div><strong>{stats.open}</strong><small>Atividades abertas</small></div></article><article><span className="summary-icon doing"><ClockCountdown /></span><div><strong>{stats.doing}</strong><small>Em andamento</small></div></article><article><span className="summary-icon late"><CalendarBlank /></span><div><strong>{stats.late}</strong><small>Precisam de atenção</small></div></article><article><span className="summary-icon done"><CheckCircle /></span><div><strong>{stats.done}</strong><small>Concluídas</small></div></article></section>
    <section className="plans-toolbar"><label className="plans-search"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar uma atividade" /></label>{currentMember.grade !== 2 ? <label className="plans-filter"><FunnelSimple /><span>Responsável</span><select value={owner} onChange={(event) => setOwner(event.target.value)}><option>Todos</option>{members.map((member) => <option key={member.id}>{member.name}</option>)}</select></label> : null}<small>{previewMode ? 'Demonstração salva somente neste navegador.' : message || 'As alterações são compartilhadas entre os administradores.'}</small></section>
    <div className="plans-board" style={{ '--column-count': columns.length }}>{columns.map((column) => <ActionColumn key={column.id} column={column} cards={visibleCards.filter((card) => card.column === column.id)} columns={columns} canManage={canManage} onMove={moveCard} onOpen={openCard} />)}</div>

    {modal === 'card' ? <ActionModal card={selectedCard} columns={columns} members={members} currentMember={currentMember} onClose={() => setModal('')} onSave={saveCard} onComment={commentCard} onStatus={changeStatus} /> : null}
    {modal === 'team' ? <TeamModal members={members} previewMode={previewMode} onClose={() => setModal('')} onAdd={addMember} /> : null}
    {modal === 'bucket' ? <BucketModal onClose={() => setModal('')} onAdd={addColumn} /> : null}
  </div>;
}
