import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CheckCircle,
  ClockCounterClockwise,
  FileText,
  LinkSimple,
  MagnifyingGlass,
  PencilSimple,
  ShieldCheck,
  SpinnerGap,
  UploadSimple,
  UsersThree,
  WarningCircle,
  X
} from '@phosphor-icons/react';
import {
  approveBancoHorasImport,
  classifyBancoHorasDay,
  getBancoHorasCollaborator,
  getBancoHorasCollaborators,
  getBancoHorasImport,
  getBancoHorasImports,
  importBancoHorasReport,
  linkBancoHorasIdentity,
  updateBancoHorasBalance
} from '../api.js';
import './admin-banco-horas.css';

const tabDefinitions = {
  colaboradores: { icon: UsersThree, label: 'Colaboradores' },
  calendario: { icon: CalendarBlank, label: 'Calendário' },
  banco: { icon: ClockCounterClockwise, label: 'Banco de Horas' }
};

const statusLabels = {
  trabalhado: 'Trabalhado',
  folga: 'Folga',
  falta: 'Falta',
  pendente: 'Pendente',
  incompleta: 'Marcação incompleta',
  nao_aplicavel: 'Não aplicável'
};

const blockerLabels = {
  vinculos_pendentes: 'Vínculos pendentes',
  dias_pendentes: 'Dias sem classificação',
  marcacoes_incompletas: 'Marcações incompletas',
  saldos_inconsistentes: 'Saldos inconsistentes',
  saldos_duplicados: 'Saldos duplicados',
  dias_duplicados: 'Dias duplicados',
  periodo_ausente: 'Período ausente'
};

function identityKey(row) {
  return `${row.nome_kairos_normalizado || ''}::${String(row.matricula_kairos || '').trim().toLowerCase()}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function errorMessage(error, fallback = 'Não foi possível concluir a operação.') {
  return error?.error || error?.message || fallback;
}

function formatDate(value) {
  if (!value) return 'Não informado';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
}

function changeMonth(value, amount) {
  const [year, month] = value.split('-').map(Number);
  const next = new Date(year, month - 1 + amount, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function calendarCells(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstWeekday = new Date(year, monthNumber - 1, 1).getDay();
  const totalDays = new Date(year, monthNumber, 0).getDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1)
  ];
}

function validatePunchSequence(value) {
  const punches = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!punches.length) return { punches, error: 'Informe pelo menos uma entrada e uma saída.' };

  const invalid = punches.find((punch) => {
    const match = /^(\d{2}):(\d{2})$/.exec(punch);
    return !match || Number(match[1]) > 23 || Number(match[2]) > 59;
  });
  if (invalid) return { punches, error: `Horário inválido: ${invalid}. Use HH:MM.` };
  if (punches.length < 2 || punches.length % 2 !== 0) {
    return { punches, error: 'A sequência precisa ter pares completos de entrada e saída.' };
  }
  return { punches, error: '' };
}

function StatusBadge({ status }) {
  return <span className={`bh-status bh-status-${status || 'sem_dados'}`}>{statusLabels[status] || 'Sem dados'}</span>;
}

function LoadingState({ label = 'Carregando informações...' }) {
  return (
    <div className="bh-loading" role="status">
      <SpinnerGap size={25} className="bh-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="banco-horas-empty-view">
      <span className="banco-horas-empty-icon" aria-hidden="true"><Icon size={38} weight="duotone" /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

function ImportPanel({ onClose, onImported }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return setError('Selecione um relatório do Kairos.');
    setBusy(true);
    setError('');
    try {
      const result = await importBancoHorasReport(file);
      onImported(result.conferencia, result.message);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Não foi possível ler o relatório.'));
      if (requestError?.detalhes?.importacao_id) {
        try {
          const existing = await getBancoHorasImport(requestError.detalhes.importacao_id);
          onImported(existing, 'Este arquivo já possuía uma conferência. Ela foi reaberta.');
        } catch {
          // Mantém a mensagem original quando a conferência não pode ser recuperada.
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bh-import-panel" aria-labelledby="bh-import-title">
      <button className="bh-icon-button bh-import-close" type="button" onClick={onClose} aria-label="Fechar importação"><X size={20} /></button>
      <div className="bh-import-copy">
        <span className="bh-kicker">1. Enviar relatório</span>
        <h2 id="bh-import-title">Importar relatório do Kairos</h2>
        <p>PDF ou Excel resumido alimenta os saldos. O XLS detalhado também cria os dias que serão conferidos no calendário. Nesta fase, entram somente Armazém e Administrativo.</p>
      </div>
      <form onSubmit={submit} className="bh-upload-form">
        <button type="button" className={`bh-dropzone ${file ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()}>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <FileText size={30} weight="duotone" aria-hidden="true" />
          <span>{file ? file.name : 'Clique para selecionar PDF, XLS ou XLSX'}</span>
          <small>{file ? `${(file.size / 1024).toFixed(1)} KB` : 'Limite de 12 MB · somente arquivos gerados pelo Kairos'}</small>
        </button>
        {error && <div className="bh-alert error"><WarningCircle size={19} />{error}</div>}
        <div className="bh-import-actions">
          <button type="button" className="bh-button secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="bh-button primary" disabled={!file || busy}>
            {busy ? <SpinnerGap className="bh-spin" size={19} /> : <UploadSimple size={19} />}
            {busy ? 'Lendo relatório...' : 'Ler e conferir'}
          </button>
        </div>
      </form>
    </section>
  );
}

function IdentityReview({ identity, options, disabled, onLink }) {
  const suggestion = identity.sugestoes?.[0];
  const [selectedId, setSelectedId] = useState(identity.colaborador_id || '');
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(identity.status_vinculo !== 'vinculado');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelectedId(identity.colaborador_id || '');
    setReason('');
    setEditing(identity.status_vinculo !== 'vinculado');
  }, [identity.colaborador_id, identity.matricula_kairos, identity.nome_kairos_normalizado, identity.status_vinculo]);

  const submit = async () => {
    if (!selectedId || reason.trim().length < 5) return;
    setBusy(true);
    try {
      await onLink(identity.nome_kairos_normalizado, identity.matricula_kairos, Number(selectedId), reason);
      setEditing(false);
    } catch {
      // A página exibe a falha no aviso global e mantém o formulário aberto.
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`bh-identity-row ${identity.status_vinculo}`}>
      <div className="bh-identity-source">
        <small>Kairos</small><strong>{identity.nome_kairos}</strong>
        <span>{identity.matricula_kairos || 'Sem matrícula'} · {identity.estrutura_kairos || 'Sem estrutura'}</span>
      </div>
      <ArrowRight size={19} aria-hidden="true" />
      <div className="bh-identity-target">
        <small>Cadastro oficial Ginfo</small>
        {identity.status_vinculo === 'vinculado' && !editing ? (
          <><strong>{identity.nome_ginfo}</strong><span>{identity.matricula_ginfo} · {identity.metodo_vinculo?.replaceAll('_', ' ')}</span></>
        ) : (
          <>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label={`Vincular ${identity.nome_kairos}`}>
              <option value="">Selecione um colaborador</option>
              {options.map((option) => <option value={option.id} key={option.id}>{option.matricula} — {option.nome_completo}</option>)}
            </select>
            {suggestion && !selectedId && <span className="bh-match-suggestion"><strong>Sugestão não selecionada:</strong> {suggestion.matricula} — {suggestion.nome_completo}{Number.isFinite(suggestion.score) ? ` (${Math.round(suggestion.score * 100)}% de similaridade)` : ''}. Confira antes de escolher.</span>}
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Justificativa do vínculo" />
          </>
        )}
      </div>
      <div className="bh-identity-action">
        {identity.status_vinculo === 'vinculado' && !editing ? (
          <><span className="bh-match-ok"><CheckCircle size={18} />Vinculado</span>{!disabled && <button type="button" className="bh-text-button" onClick={() => setEditing(true)}>Corrigir</button>}</>
        ) : (
          <button type="button" className="bh-button compact" disabled={disabled || busy || !selectedId || reason.trim().length < 5} onClick={submit}>
            {busy ? <SpinnerGap className="bh-spin" size={17} /> : <LinkSimple size={17} />}Confirmar
          </button>
        )}
      </div>
    </article>
  );
}

function BalanceReviewRow({ row, disabled, onSave }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ saldo_anterior: row.saldo_anterior, debito: row.debito, credito: row.credito });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setValues({ saldo_anterior: row.saldo_anterior, debito: row.debito, credito: row.credito }), [row.saldo_anterior, row.debito, row.credito]);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(row.id, { ...values, justificativa: reason });
      setEditing(false);
      setReason('');
    } catch {
      // A página exibe a falha no aviso global e preserva os valores digitados.
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td><strong>{row.nome_ginfo || row.nome_kairos}</strong><small>{row.matricula_ginfo || row.matricula_kairos}</small></td>
      <td><span className={`bh-link-state ${row.status_vinculo}`}>{row.status_vinculo === 'vinculado' ? 'Vinculado' : 'Revisar vínculo'}</span></td>
      {editing ? (
        <>
          {['saldo_anterior', 'debito', 'credito'].map((field) => <td key={field}><input className="bh-time-input" value={values[field]} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} /></td>)}
          <td colSpan="2"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo da correção" /></td>
          <td><div className="bh-inline-actions"><button type="button" className="bh-button compact" disabled={busy || reason.trim().length < 5} onClick={save}>Salvar</button><button type="button" className="bh-icon-button" onClick={() => setEditing(false)} aria-label="Cancelar edição"><X size={17} /></button></div></td>
        </>
      ) : (
        <>
          <td>{row.saldo_anterior}</td><td>{row.debito}</td><td>{row.credito}</td><td>{row.saldo_periodo}</td>
          <td className={row.saldo_atual_min < 0 ? 'negative' : 'positive'}><strong>{row.saldo_atual}</strong></td>
          <td>{!disabled && <button type="button" className="bh-icon-button" onClick={() => setEditing(true)} aria-label={`Editar saldo de ${row.nome_kairos}`}><PencilSimple size={18} /></button>}</td>
        </>
      )}
    </tr>
  );
}

function DayReviewRow({ day, disabled, onClassify }) {
  const sourcePunches = Array.isArray(day.batidas) ? day.batidas : [];
  const sourcePunchesText = sourcePunches.join(' ');
  const [reason, setReason] = useState(day.justificativa_admin || '');
  const [punchesText, setPunchesText] = useState(sourcePunchesText);
  const [busy, setBusy] = useState('');
  const withoutPunches = sourcePunches.length === 0;
  const canResolve = !disabled && ['trabalhado', 'pendente', 'incompleta', 'folga', 'falta'].includes(day.classificacao);
  const punchValidation = withoutPunches ? { punches: [], error: '' } : validatePunchSequence(punchesText);

  useEffect(() => {
    setReason(day.justificativa_admin || '');
    setPunchesText(sourcePunchesText);
  }, [day.id, day.justificativa_admin, sourcePunchesText]);

  const classify = async (classification) => {
    if (classification === 'trabalhado' && punchValidation.error) return;
    setBusy(classification);
    try {
      await onClassify(day.id, classification, reason, classification === 'trabalhado' ? punchValidation.punches : undefined);
    } catch {
      // A página exibe a falha no aviso global e permite uma nova tentativa.
    } finally {
      setBusy('');
    }
  };

  return (
    <tr>
      <td><strong>{formatDate(day.data)}</strong><small>{day.horario_previsto || 'Sem jornada informada'}</small></td>
      <td><strong>{day.nome_ginfo || day.nome_kairos}</strong><small>{day.matricula_ginfo || day.matricula_kairos}</small></td>
      <td>{withoutPunches ? <span className="bh-no-punch">Sem batida</span> : canResolve ? <div className="bh-punch-editor"><input value={punchesText} onChange={(event) => setPunchesText(event.target.value)} placeholder="08:00 12:00 13:00 17:00" aria-label={`Corrigir batidas de ${day.nome_ginfo || day.nome_kairos} em ${formatDate(day.data)}`} /><small className={punchValidation.error ? 'error' : 'valid'}>{punchValidation.error || 'Sequência completa. Ela substituirá as batidas do relatório.'}</small></div> : sourcePunches.join(' · ')}</td>
      <td><StatusBadge status={day.classificacao} /></td>
      <td>{canResolve ? <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Justificativa obrigatória" /> : (day.justificativa_admin || day.justificativa_kairos || '—')}</td>
      <td>
        {canResolve && <div className="bh-classification-actions">
          {withoutPunches ? (
            <><button type="button" disabled={Boolean(busy) || reason.trim().length < 5} onClick={() => classify('folga')}>Folga</button><button type="button" className="danger" disabled={Boolean(busy) || reason.trim().length < 5} onClick={() => classify('falta')}>Falta</button></>
          ) : <button type="button" disabled={Boolean(busy) || reason.trim().length < 5 || Boolean(punchValidation.error)} onClick={() => classify('trabalhado')}>Salvar batidas e marcar trabalhado</button>}
        </div>}
      </td>
    </tr>
  );
}

function ReviewPanel({ detail, busy, onBack, onReload, onLink, onBalance, onClassify, onApprove }) {
  const [dayFilter, setDayFilter] = useState('pendencias');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const isDraft = detail.importacao.status === 'rascunho';
  const identities = useMemo(() => {
    const map = new Map();
    [...detail.saldos, ...detail.dias].forEach((row) => {
      const key = identityKey(row);
      if (!map.has(key)) map.set(key, row);
      else if (map.get(key).status_vinculo !== 'vinculado') map.set(key, row);
    });
    return [...map.values()].sort((left, right) => {
      if (left.status_vinculo !== right.status_vinculo) return left.status_vinculo === 'pendente' ? -1 : 1;
      return left.nome_kairos.localeCompare(right.nome_kairos, 'pt-BR');
    });
  }, [detail]);
  const filteredDays = useMemo(() => dayFilter === 'pendencias' ? detail.dias.filter((day) => ['pendente', 'incompleta'].includes(day.classificacao)) : detail.dias, [dayFilter, detail.dias]);
  const pageCount = Math.max(1, Math.ceil(filteredDays.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const visibleDays = filteredDays.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => setPage(1), [dayFilter, detail.importacao.id]);
  useEffect(() => setPage((current) => Math.min(Math.max(current, 1), pageCount)), [pageCount]);

  return (
    <section className="bh-review" aria-labelledby="bh-review-title">
      <div className="bh-review-toolbar"><button type="button" className="bh-text-button" onClick={onBack}><ArrowLeft size={18} />Voltar</button><button type="button" className="bh-text-button" onClick={onReload} disabled={busy}>Atualizar conferência</button></div>
      <div className="bh-review-heading">
        <div><span className="bh-kicker">2. Conferir e resolver</span><h2 id="bh-review-title">Relatório de Conferência</h2><p>{detail.importacao.arquivo_nome} · {formatDate(detail.importacao.periodo_inicio)} até {formatDate(detail.importacao.periodo_fim)}</p></div>
        <span className={`bh-import-status ${detail.importacao.status}`}>{detail.importacao.status}</span>
      </div>

      {detail.importacao.avisos.map((warning) => <div className="bh-alert warning" key={warning}><WarningCircle size={19} />{warning}</div>)}
      <div className="bh-stepper" aria-label="Etapas da importação"><span className="done"><CheckCircle size={18} />Enviar</span><span className="active">2. Conferir</span><span className={detail.importacao.total_pendencias ? '' : 'done'}>3. Resolver pendências</span><span className={detail.importacao.status === 'publicado' ? 'done' : ''}>4. Publicar</span></div>
      <div className="bh-review-metrics">
        <article><small>Saldos lidos</small><strong>{detail.importacao.total_saldos}</strong></article><article><small>Dias lidos</small><strong>{detail.importacao.total_dias}</strong></article><article><small>Colaboradores vinculados</small><strong>{detail.importacao.total_vinculados}</strong></article><article className={detail.importacao.total_pendencias ? 'attention' : 'ok'}><small>Pendências</small><strong>{detail.importacao.total_pendencias}</strong></article>
      </div>

      <section className="bh-review-section">
        <div className="bh-section-title"><div><span className="bh-kicker">Identidades</span><h3>Cruzamento Kairos × Ginfo</h3></div><span>{identities.length} colaborador(es)</span></div>
        <div className="bh-identity-list">{identities.map((identity) => <IdentityReview key={identityKey(identity)} identity={identity} options={detail.opcoes_vinculo} disabled={!isDraft || busy} onLink={onLink} />)}</div>
      </section>

      {detail.saldos.length > 0 && <section className="bh-review-section">
        <div className="bh-section-title"><div><span className="bh-kicker">Valores</span><h3>Banco de horas</h3></div><span>Período e saldo atual recalculados após qualquer correção</span></div>
        <div className="bh-table-wrap"><table className="bh-table"><thead><tr><th>Colaborador</th><th>Vínculo</th><th>Anterior</th><th>Débito</th><th>Crédito</th><th>Período</th><th>Atual</th><th>Ação</th></tr></thead><tbody>{detail.saldos.map((row) => <BalanceReviewRow key={row.id} row={row} disabled={!isDraft || busy} onSave={onBalance} />)}</tbody></table></div>
      </section>}

      {detail.dias.length > 0 && <section className="bh-review-section">
        <div className="bh-section-title bh-days-title"><div><span className="bh-kicker">Calendário</span><h3>Classificação dos dias</h3></div><select value={dayFilter} onChange={(event) => setDayFilter(event.target.value)}><option value="pendencias">Somente pendências</option><option value="todos">Todos os dias</option></select></div>
        {filteredDays.length ? <>
          <div className="bh-table-wrap"><table className="bh-table bh-days-table"><thead><tr><th>Data</th><th>Colaborador</th><th>Batidas</th><th>Situação</th><th>Justificativa</th><th>Classificar</th></tr></thead><tbody>{visibleDays.map((day) => <DayReviewRow key={day.id} day={day} disabled={!isDraft || busy} onClassify={onClassify} />)}</tbody></table></div>
          {pageCount > 1 && <div className="bh-pagination"><button type="button" disabled={safePage === 1} onClick={() => setPage((value) => value - 1)}><CaretLeft /></button><span>Página {safePage} de {pageCount}</span><button type="button" disabled={safePage === pageCount} onClick={() => setPage((value) => value + 1)}><CaretRight /></button></div>}
        </> : <div className="bh-alert success"><CheckCircle size={19} />Nenhum dia pendente de classificação.</div>}
      </section>}

      <section className="bh-approval-panel">
        <div><span className="bh-kicker">4. Publicar</span><h3>{detail.importacao.status === 'publicado' ? 'Relatório publicado' : 'Aprovação final'}</h3>
          {detail.importacao.status === 'publicado' ? <p>Aprovado por {detail.importacao.aprovado_por_nome || 'administrador'} em {formatDateTime(detail.importacao.aprovado_em)}.</p> : detail.pode_aprovar ? <p>Todos os vínculos, saldos e dias estão prontos para publicação.</p> : <div className="bh-blocker-list">{Object.entries(detail.bloqueios).filter(([, total]) => total > 0).map(([key, total]) => <span key={key}><WarningCircle size={17} />{blockerLabels[key]}: {total}</span>)}</div>}
        </div>
        {isDraft && <button type="button" className="bh-button approve" disabled={!detail.pode_aprovar || busy} onClick={onApprove}>{busy ? <SpinnerGap className="bh-spin" size={20} /> : <ShieldCheck size={20} />}Aprovar e publicar</button>}
      </section>
    </section>
  );
}

function CollaboratorsView({ collaborators, imports, loading, onSelect, onOpenImport, onImport }) {
  const [search, setSearch] = useState('');
  const [dataFilter, setDataFilter] = useState('todos');
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return collaborators.filter((item) => {
      const matchesSearch = !term || [item.nome_completo, item.nome_preferido, item.matricula, item.cargo, item.setor].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
      const matchesData = dataFilter === 'todos' || (dataFilter === 'com_dados' ? Boolean(item.saldo) : !item.saldo);
      return matchesSearch && matchesData;
    });
  }, [collaborators, dataFilter, search]);

  if (loading) return <LoadingState />;
  return (
    <div className="bh-browse-view">
      <div className="bh-view-toolbar">
        <label className="bh-search"><MagnifyingGlass size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, matrícula, cargo ou setor" /></label>
        <select value={dataFilter} onChange={(event) => setDataFilter(event.target.value)}><option value="todos">Todos os colaboradores</option><option value="com_dados">Com dados publicados</option><option value="sem_dados">Sem dados publicados</option></select>
        <button type="button" className="bh-button primary" onClick={onImport}><UploadSimple size={18} />Importar relatório</button>
      </div>
      <div className="bh-table-wrap"><table className="bh-table bh-collaborators-table"><thead><tr><th>Colaborador</th><th>Cargo / setor</th><th>Saldo atual</th><th>Folgas</th><th>Faltas</th><th></th></tr></thead><tbody>
        {filtered.map((item) => <tr key={item.id}>
          <td><strong>{item.nome_completo}</strong><small>Matrícula {item.matricula}</small></td><td>{item.cargo || 'Cargo não informado'}<small>{item.setor || item.unidade || 'Setor não informado'}</small></td>
          <td className={item.saldo?.saldo_atual_min < 0 ? 'negative' : 'positive'}><strong>{item.saldo?.saldo_atual || '--:--'}</strong><small>{item.periodo_fim ? `até ${formatDate(item.periodo_fim)}` : 'Nenhum relatório publicado'}</small></td><td>{item.calendario_resumo?.folga || 0}</td><td>{item.calendario_resumo?.falta || 0}</td>
          <td><button type="button" className="bh-open-button" onClick={() => onSelect(item)} aria-label={`Abrir ${item.nome_completo}`}><ArrowRight size={19} /></button></td>
        </tr>)}
      </tbody></table></div>
      {!filtered.length && <div className="bh-no-results">Nenhum colaborador encontrado com esses filtros.</div>}
      <section className="bh-import-history">
        <div className="bh-section-title"><div><span className="bh-kicker">Histórico</span><h3>Importações recentes</h3></div></div>
        {imports.length ? <div className="bh-history-list">{imports.map((item) => <button type="button" key={item.id} onClick={() => onOpenImport(item.id)}><FileText size={21} weight="duotone" /><span><strong>{item.arquivo_nome}</strong><small>{formatDate(item.periodo_inicio)} a {formatDate(item.periodo_fim)} · {item.tipo_relatorio}</small></span><span className={`bh-import-status ${item.status}`}>{item.status}</span><ArrowRight size={18} /></button>)}</div> : <p className="bh-muted">Nenhum relatório importado até o momento.</p>}
      </section>
    </div>
  );
}

function SelectedCollaboratorHeader({ detail, onChoose }) {
  if (!detail) return null;
  return <div className="bh-selected-person"><span><UsersThree size={22} weight="duotone" /></span><div><small>Colaborador selecionado</small><strong>{detail.colaborador.nome_completo}</strong><p>{detail.colaborador.matricula} · {detail.colaborador.cargo || 'Cargo não informado'}</p></div><button type="button" className="bh-text-button" onClick={onChoose}>Trocar</button></div>;
}

function CalendarView({ detail, month, loading, onMonth, onChoose }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const cells = useMemo(() => calendarCells(month), [month]);
  const dayMap = useMemo(() => new Map((detail?.dias || []).map((day) => [String(day.data).slice(0, 10), day])), [detail]);
  const selectedDay = selectedDate ? dayMap.get(selectedDate) : null;
  useEffect(() => setSelectedDate(null), [month, detail?.colaborador?.id]);
  if (!detail && !loading) return <EmptyState icon={CalendarBlank} title="Selecione um colaborador" description="Abra um colaborador na lista para consultar as folgas, faltas e demais situações publicadas." action={<button type="button" className="bh-button primary" onClick={onChoose}>Ver colaboradores</button>} />;
  if (loading) return <LoadingState label="Carregando calendário..." />;
  const [year, monthNumber] = month.split('-');
  return <div className="bh-calendar-view">
    <SelectedCollaboratorHeader detail={detail} onChoose={onChoose} />
    <div className="bh-month-toolbar"><button type="button" onClick={() => onMonth(changeMonth(month, -1))} aria-label="Mês anterior"><CaretLeft size={20} /></button><input type="month" value={month} onChange={(event) => onMonth(event.target.value)} /><button type="button" onClick={() => onMonth(changeMonth(month, 1))} aria-label="Próximo mês"><CaretRight size={20} /></button></div>
    <div className="bh-calendar-legend">{['trabalhado', 'folga', 'falta', 'pendente', 'incompleta'].map((status) => <span key={status}><i className={`bh-dot ${status}`} />{statusLabels[status]}</span>)}</div>
    <div className="bh-calendar-grid" role="grid" aria-label={`Calendário ${monthNumber}/${year}`}>
      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((weekday) => <strong className="bh-weekday" key={weekday}>{weekday}</strong>)}
      {cells.map((day, index) => {
        if (!day) return <span className="bh-calendar-blank" key={`blank-${index}`} />;
        const key = `${month}-${String(day).padStart(2, '0')}`;
        const item = dayMap.get(key);
        return <button type="button" className={`bh-calendar-day ${item?.classificacao || 'sem_dados'} ${selectedDate === key ? 'selected' : ''}`} key={key} onClick={() => setSelectedDate(key)}><span>{day}</span><small>{item ? statusLabels[item.classificacao] : 'Sem dados'}</small></button>;
      })}
    </div>
    <div className="bh-day-detail">{selectedDate ? <><div><span className="bh-kicker">{formatDate(selectedDate)}</span><h3>{selectedDay ? statusLabels[selectedDay.classificacao] : 'Sem informação publicada'}</h3></div>{selectedDay ? <dl><div><dt>Jornada prevista</dt><dd>{selectedDay.horario_previsto || 'Não informada'}</dd></div><div><dt>Batidas no relatório</dt><dd>{selectedDay.batidas.length ? selectedDay.batidas.join(' · ') : 'Nenhuma'}</dd></div><div><dt>Justificativa</dt><dd>{selectedDay.justificativa_admin || selectedDay.justificativa_kairos || 'Sem justificativa'}</dd></div></dl> : <p>O relatório aprovado não trouxe registro para esta data. O sistema não presume folga nem falta.</p>}</> : <p>Selecione um dia para consultar a classificação publicada.</p>}</div>
  </div>;
}

function BalanceView({ detail, loading, onChoose }) {
  if (!detail && !loading) return <EmptyState icon={ClockCounterClockwise} title="Selecione um colaborador" description="Abra um colaborador na lista para consultar o último saldo publicado." action={<button type="button" className="bh-button primary" onClick={onChoose}>Ver colaboradores</button>} />;
  if (loading) return <LoadingState label="Carregando banco de horas..." />;
  const balance = detail.saldo;
  return <div className="bh-balance-view"><SelectedCollaboratorHeader detail={detail} onChoose={onChoose} />
    {!balance ? <EmptyState icon={ClockCounterClockwise} title="Saldo ainda não disponível" description="Nenhum relatório aprovado contém saldo para este colaborador." /> : <>
      <div className="bh-balance-period"><span>Período publicado</span><strong>{formatDate(detail.periodo_saldo?.inicio)} até {formatDate(detail.periodo_saldo?.fim)}</strong></div>
      <div className="bh-balance-cards"><article><small>Saldo anterior</small><strong>{balance.saldo_anterior}</strong></article><article className="debit"><small>Débitos</small><strong>{balance.debito}</strong></article><article className="credit"><small>Créditos</small><strong>{balance.credito}</strong></article><article><small>Saldo do período</small><strong>{balance.saldo_periodo}</strong></article><article className={balance.saldo_atual_min < 0 ? 'negative' : 'current'}><small>Saldo atual</small><strong>{balance.saldo_atual}</strong></article></div>
      <div className="bh-balance-note"><CheckCircle size={20} /><span>Estes valores pertencem ao relatório aprovado mais recente e não são somados a importações anteriores.</span></div>
    </>}
  </div>;
}

export default function AdminBancoHorasPage() {
  const [activeView, setActiveView] = useState('colaboradores');
  const [mode, setMode] = useState('browse');
  const [collaborators, setCollaborators] = useState([]);
  const [imports, setImports] = useState([]);
  const [conference, setConference] = useState(null);
  const [selectedCollaborator, setSelectedCollaborator] = useState(null);
  const [collaboratorDetail, setCollaboratorDetail] = useState(null);
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [peopleResult, importsResult] = await Promise.all([getBancoHorasCollaborators(), getBancoHorasImports()]);
      setCollaborators(peopleResult.colaboradores || []);
      setImports(importsResult.importacoes || []);
    } catch (error) {
      setFeedback({ type: 'error', text: errorMessage(error, 'Não foi possível carregar o painel.') });
    } finally { setLoading(false); }
  }, []);

  const loadCollaborator = useCallback(async (collaborator, selectedMonth = month) => {
    if (!collaborator?.id) return;
    setDetailLoading(true);
    try {
      const result = await getBancoHorasCollaborator(collaborator.id, selectedMonth);
      setSelectedCollaborator(collaborator);
      setCollaboratorDetail(result);
    } catch (error) {
      setFeedback({ type: 'error', text: errorMessage(error, 'Não foi possível abrir o colaborador.') });
    } finally { setDetailLoading(false); }
  }, [month]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const selectCollaborator = async (collaborator) => { setActiveView('calendario'); await loadCollaborator(collaborator); };
  const updateMonth = async (value) => { if (!value) return; setMonth(value); if (selectedCollaborator) await loadCollaborator(selectedCollaborator, value); };
  const openImport = async (id) => {
    setBusy(true);
    try { const result = await getBancoHorasImport(id); setConference(result); setMode('review'); }
    catch (error) { setFeedback({ type: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  const applyConferenceResult = (result, message) => { setConference(result); setMode('review'); setFeedback(message ? { type: 'success', text: message } : null); };
  const conferenceAction = async (action, successText) => {
    setBusy(true); setFeedback(null);
    try {
      const response = await action();
      const detail = response.conferencia || response;
      setConference(detail);
      if (successText || response.message) setFeedback({ type: 'success', text: successText || response.message });
      return detail;
    } catch (error) { setFeedback({ type: 'error', text: errorMessage(error) }); throw error; }
    finally { setBusy(false); }
  };
  const approve = async () => {
    if (!conference?.pode_aprovar || !window.confirm('Confirmar a publicação deste relatório? Depois disso ele ficará somente para consulta.')) return;
    try { await conferenceAction(() => approveBancoHorasImport(conference.importacao.id, conference.importacao.revisao), 'Relatório aprovado e publicado com sucesso.'); await loadOverview(); } catch { /* mensagem já exibida */ }
  };
  const chooseCollaborator = () => { setActiveView('colaboradores'); setMode('browse'); };

  return <div className="page-card admin-card banco-horas-admin-page">
    <header className="banco-horas-admin-heading"><div><span>Gestão de ponto</span><h1>Banco de Horas</h1><p>Importe, confira e publique saldos, folgas e faltas com rastreabilidade.</p></div><div className="bh-heading-actions"><strong>Somente administradores</strong><button type="button" onClick={() => setMode('import')}><UploadSimple size={18} />Importar relatório</button></div></header>
    {feedback && <div className={`bh-toast ${feedback.type}`} role="status">{feedback.type === 'success' ? <CheckCircle size={19} /> : <WarningCircle size={19} />}<span>{feedback.text}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Fechar mensagem"><X size={16} /></button></div>}
    {mode === 'import' ? <ImportPanel onClose={() => setMode('browse')} onImported={applyConferenceResult} /> : mode === 'review' && conference ? <ReviewPanel
      detail={conference} busy={busy} onBack={async () => { setMode('browse'); await loadOverview(); }} onReload={() => openImport(conference.importacao.id)}
      onLink={(name, kairosRegistration, collaboratorId, reason) => conferenceAction(() => linkBancoHorasIdentity(conference.importacao.id, { nome_kairos_normalizado: name, matricula_kairos: kairosRegistration, colaborador_id: collaboratorId, justificativa: reason }))}
      onBalance={(balanceId, payload) => conferenceAction(() => updateBancoHorasBalance(conference.importacao.id, balanceId, payload), 'Saldo corrigido e auditado.')}
      onClassify={(dayId, classification, reason, punches) => conferenceAction(() => classifyBancoHorasDay(conference.importacao.id, dayId, { classificacao: classification, justificativa: reason, ...(Array.isArray(punches) ? { batidas: punches } : {}) }), 'Dia classificado e auditado.')}
      onApprove={approve}
    /> : <section className="banco-horas-workspace">
      <nav className="banco-horas-tabs" aria-label="Visões do Banco de Horas">{Object.entries(tabDefinitions).map(([key, tab]) => { const TabIcon = tab.icon; return <button type="button" className={activeView === key ? 'active' : ''} aria-pressed={activeView === key} onClick={() => setActiveView(key)} key={key}><TabIcon size={20} weight="duotone" aria-hidden="true" />{tab.label}</button>; })}</nav>
      {activeView === 'colaboradores' && <CollaboratorsView collaborators={collaborators} imports={imports} loading={loading} onSelect={selectCollaborator} onOpenImport={openImport} onImport={() => setMode('import')} />}
      {activeView === 'calendario' && <CalendarView detail={collaboratorDetail} month={month} loading={detailLoading} onMonth={updateMonth} onChoose={chooseCollaborator} />}
      {activeView === 'banco' && <BalanceView detail={collaboratorDetail} loading={detailLoading} onChoose={chooseCollaborator} />}
    </section>}
  </div>;
}
