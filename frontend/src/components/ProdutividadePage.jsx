import { useEffect, useMemo, useState } from 'react';
import {
  createAdminProdutividadeArmazemManual,
  exportAdminProdutividade,
  exportAdminProdutividadeArmazem,
  getAdminProdutividade,
  getAdminProdutividadeArmazem,
  getAdminProdutividadeArmazemDetail,
  getAdminProdutividadeArmazemResumo,
  getAdminProdutividadeDetail,
  getAdminProdutividadeResumo,
  getMeuProdutividade,
  getMeuProdutividadeArmazem,
  importProdutividadeFile,
  updateAdminProdutividadeArmazemRegistro,
  updateAdminProdutividadeRegistro
} from '../api.js';

const rotaMetricFields = [
  ['competencia', 'Periodo', ''],
  ['valor_total_previsto', 'Valor', 'money'],
  ['mapas', 'Qnt Mapas', 'number'],
  ['caixas', 'Caixas', 'number'],
  ['recargas', 'Rec', 'number'],
  ['percentual_devolucao', '% Dev', 'percent']
];

const rotaDetailFields = [
  ['competencia', 'Competencia'],
  ['periodo_inicio', 'Periodo inicial', 'date'],
  ['periodo_fim', 'Periodo final', 'date'],
  ['funcao_rv', 'Funcao no periodo'],
  ['caixas', 'Caixas', 'number'],
  ['entregas', 'Entregas', 'number'],
  ['percentual_devolucao', 'Percentual de devolucao', 'percent'],
  ['meta_devolucao', 'Meta de devolucao', 'percent'],
  ['bateu_devolucao', 'Status da devolucao', 'devolucao'],
  ['recargas', 'Recargas', 'number'],
  ['mapas', 'Mapas', 'number'],
  ['valor_recarga', 'Valor recarga', 'money'],
  ['bonus', 'Bonus', 'money'],
  ['valor_total_previsto', 'Valor a receber', 'money'],
  ['status_produtividade', 'Status produtividade'],
  ['status_auditoria', 'Auditoria', 'auditoria'],
  ['metodo_cruzamento', 'Metodo cruzamento'],
  ['confianca_cruzamento', 'Confianca cruzamento', 'percent'],
  ['mensagem_rh', 'Mensagem RH']
];

const armazemMetricFields = [
  ['valor_total_previsto', 'Valor previsto', 'money'],
  ['pontos', 'Pontuacao', 'number'],
  ['faixa', 'Faixa'],
  ['funcao_armazem', 'Funcao'],
  ['erros', 'Erros', 'number'],
  ['rv_nova', 'RV Nova', 'money']
];

const armazemDetailFields = [
  ['competencia', 'Competencia'],
  ['periodo_inicio', 'Periodo inicial', 'date'],
  ['periodo_fim', 'Periodo final', 'date'],
  ['funcao_armazem', 'Funcao no armazem'],
  ['pontos', 'Pontos', 'number'],
  ['faixa', 'Faixa'],
  ['rv_antiga', 'RV antiga', 'money'],
  ['rv_nova', 'RV nova', 'money'],
  ['erros', 'Erros', 'number'],
  ['valor_total_previsto', 'Valor total previsto', 'money'],
  ['status_produtividade', 'Status produtividade'],
  ['origem_calculo', 'Origem do calculo'],
  ['status_auditoria', 'Auditoria', 'auditoria'],
  ['metodo_cruzamento', 'Metodo cruzamento'],
  ['confianca_cruzamento', 'Confianca cruzamento', 'percent'],
  ['usuario_wms', 'Usuario WMS'],
  ['codigo_operacional', 'Codigo operacional'],
  ['mensagem_rh', 'Mensagem RH']
];

const armazemGoalGroups = [
  {
    title: 'RV AJUDANTES - TURNO A',
    goals: [
      { code: 'EC', label: 'EFICIENCIA DE CARREGAMENTO', meta: '98%', value: 'R$ 50.00', accumulated: 'R$ 0.00' },
      { code: 'TM', label: 'TMA', meta: '02:16', value: 'R$ 100.00', accumulated: 'R$ 0.00' }
    ],
    items: [
      ['@', 'Amarracao', 'R$ 1.25'],
      ['↻', 'Retrabalho', 'R$ 2.00'],
      ['▣', 'Repack', 'R$ 0.30'],
      ['▥', 'Ressuprimento', 'R$ 0.20'],
      ['/', 'Remonte', 'R$ 0.10'],
      ['!', 'Refugo', 'R$ 1.00'],
      ['▤', 'Tarefa Op.', 'R$ 0.10'],
      ['U', 'Separar Chopp', 'R$ 1.00'],
      ['V', 'Carregamento Van', 'R$ 1.25'],
      ['▰', 'Descarga', 'R$ 2.80'],
      ['*', 'Colocar fitilho', 'R$ 0.50'],
      ['+', 'Demais Atividades', 'R$ 1.00']
    ]
  },
  {
    title: 'RV AJUDANTES - TURNO B',
    goals: [
      { code: 'RE', label: 'RESSUPRIMENTO', meta: '90%', value: 'R$ 50.00', accumulated: 'R$ 0.00' },
      { code: 'TM', label: 'TMA', meta: '02:16', value: 'R$ 100.00', accumulated: 'R$ 0.00' }
    ],
    items: [
      ['@', 'Amarracao', 'R$ 1.25'],
      ['↻', 'Retrabalho', 'R$ 2.00'],
      ['▣', 'Repack', 'R$ 0.30'],
      ['▥', 'Ressuprimento', 'R$ 0.20'],
      ['/', 'Remonte', 'R$ 0.10'],
      ['!', 'Refugo', 'R$ 1.00'],
      ['▤', 'Tarefa Op.', 'R$ 0.10'],
      ['U', 'Separar Chopp', 'R$ 1.00'],
      ['V', 'Carregamento Van', 'R$ 1.25'],
      ['▰', 'Descarga', 'R$ 2.80'],
      ['*', 'Colocar fitilho', 'R$ 0.50'],
      ['+', 'Demais Atividades', 'R$ 1.00']
    ]
  },
  {
    title: 'RV OPERADORES',
    goals: [
      { code: 'EC', label: 'EFICIENCIA DE CARREGAMENTO', meta: '98%', value: 'R$ 50.00', accumulated: 'R$ 0.00' },
      { code: 'TM', label: 'TMA', meta: '02:16', value: 'R$ 100.00', accumulated: 'R$ 0.00' },
      { code: 'ED', label: 'EFICIENCIA DE DESCARGA', meta: '90%', value: 'R$ 50.00', accumulated: 'R$ 0.00' }
    ],
    items: [
      ['T', 'Tarefa Operacional', 'R$ 0.10']
    ]
  }
];

const emptyRotaSummary = {
  total_colaboradores: 0,
  total_motoristas: 0,
  total_ajudantes: 0,
  valor_total_previsto: 0,
  valor_total_nova_rv: 0,
  valor_total_antiga_rv: 0,
  diferenca_total: 0,
  total_bateu_devolucao: 0,
  total_nao_bateu_devolucao: 0,
  total_recargas: 0,
  total_mapas: 0,
  total_baixa_confianca: 0
};

const emptyArmazemSummary = {
  total_colaboradores_com_rv: 0,
  total_ajudantes: 0,
  total_operadores_empilhadeira: 0,
  total_amarradores: 0,
  valor_total_previsto: 0,
  valor_total_rv_antiga: 0,
  valor_total_rv_nova: 0,
  total_baixa_confianca: 0
};

function isAdminUser(user) {
  return String(user?.perfil || '').trim().toLowerCase() === 'admin';
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return asNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  return asNumber(value).toLocaleString('pt-BR');
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${asNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10).split('-').reverse().join('/');
}

function formatValue(value, type) {
  if (type === 'money') return formatMoney(value);
  if (type === 'percent') return formatPercent(value);
  if (type === 'number') return formatNumber(value);
  if (type === 'date') return formatDate(value);
  if (type === 'devolucao') return value ? 'Dentro da meta' : 'Fora da meta';
  return value || '-';
}

function formatRotaFuncao(value) {
  const text = String(value || '').trim();
  const normalized = text.toLowerCase();
  if (normalized.includes('motorista') && !normalized.includes('ajudante')) return 'Motorista';
  if (normalized.includes('ajudante')) return 'Ajudante de Motorista';
  return text || '-';
}

function formatArmazemFuncao(value) {
  const text = String(value || '').trim();
  const normalized = text.toLowerCase();
  if (normalized.includes('empilhadeira')) return 'Operador de Empilhadeira';
  if (normalized.includes('amarrador')) return 'Amarrador';
  if (normalized.includes('ajudante')) return 'Ajudante';
  return text || '-';
}

function StatusBadge({ type, value }) {
  if (type === 'devolucao') {
    return <span className={`prod-badge ${value ? 'success' : 'danger'}`}>{value ? 'Dentro da meta' : 'Fora da meta'}</span>;
  }

  if (type === 'auditoria') {
    const revisar = String(value || '').toLowerCase() === 'revisar_cruzamento';
    return <span className={`prod-badge ${revisar ? 'warning' : 'success'}`}>{revisar ? 'Revisar vinculo' : 'OK'}</span>;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return <span className={`prod-badge ${normalized ? 'success' : 'muted'}`}>{value || 'Sem dados'}</span>;
}

function ProdutividadeMaintenance({ message }) {
  return (
    <div className="maintenance-page">
      <span className="maintenance-modal-icon" aria-hidden="true">!</span>
      <h1>Premio de Produtividade em manutencao</h1>
      <p>{message || 'Estamos ajustando os dados deste painel para garantir que as informacoes sejam apresentadas corretamente. Em breve ele estara disponivel.'}</p>
    </div>
  );
}

function ProdTabs({ activeTab, onChange, tabs }) {
  return (
    <div className="prod-tabs" role="tablist" aria-label="Tipos de premio de produtividade">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeTab === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ProdutividadeDetail({ registro, variant = 'rota' }) {
  if (!registro) return null;
  const isArmazem = variant === 'armazem';
  const metricFields = isArmazem ? armazemMetricFields : rotaMetricFields;
  const detailFields = isArmazem ? armazemDetailFields : rotaDetailFields;
  const funcao = isArmazem ? formatArmazemFuncao(registro.funcao_armazem) : formatRotaFuncao(registro.funcao_rv);

  return (
    <section className="prod-detail">
      <div className="prod-detail-heading">
        <div>
          <h2>{registro.nome_completo}</h2>
          <p>{registro.matricula} - {funcao || 'Funcao nao informada'}</p>
        </div>
        <StatusBadge type="status" value={registro.status_produtividade} />
      </div>

      <div className="prod-metric-grid">
        {metricFields.map(([key, label, type]) => (
          <div className="prod-metric" key={key}>
            <span>{label}</span>
            <strong>{formatValue(registro[key], type)}</strong>
          </div>
        ))}
      </div>

      <div className="prod-info-grid">
        {detailFields.map(([key, label, type]) => (
          <div key={key}>
            <span>{label}</span>
            {type === 'devolucao' ? (
              <StatusBadge type="devolucao" value={registro[key]} />
            ) : type === 'auditoria' ? (
              <StatusBadge type="auditoria" value={registro[key]} />
            ) : key === 'status_produtividade' ? (
              <StatusBadge type="status" value={registro[key]} />
            ) : key === 'funcao_rv' ? (
              <strong>{formatRotaFuncao(registro[key])}</strong>
            ) : key === 'funcao_armazem' ? (
              <strong>{formatArmazemFuncao(registro[key])}</strong>
            ) : (
              <strong>{formatValue(registro[key], type)}</strong>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ArmazemGoalsCard() {
  return (
    <section className="prod-armazem-goals" aria-label="Metas Armazem">
      <div className="prod-armazem-goals-heading">
        <h2>Metas Armazem</h2>
      </div>
      <div className="prod-goal-groups">
        {armazemGoalGroups.map((group) => (
          <article className="prod-goal-group" key={group.title}>
            <h3>{group.title}</h3>
            <div className="prod-goal-metrics" style={{ '--goal-count': group.goals.length }}>
              {group.goals.map((goal) => (
                <div className="prod-goal-metric" key={`${group.title}-${goal.code}`}>
                  <div className="prod-goal-code">{goal.code}</div>
                  <div className="prod-goal-label">{goal.label}</div>
                  <div className="prod-goal-copy">
                    <strong>Meta {goal.meta}</strong>
                    <span>Valor {goal.value}</span>
                    <b>Acumulado: {goal.accumulated}</b>
                  </div>
                </div>
              ))}
            </div>
            <div className="prod-goal-items">
              {group.items.map(([icon, label, value]) => (
                <div className="prod-goal-item" key={`${group.title}-${label}`}>
                  <span className="prod-goal-item-icon" aria-hidden="true">{icon}</span>
                  <strong>{label}</strong>
                  <b>{value}</b>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const rotaManualFields = [
  ['valor_total_previsto', 'Premio de Produtividade', 'number'],
  ['rv_nova', 'RV nova', 'number'],
  ['bonus', 'Bonus', 'number'],
  ['valor_recarga', 'Valor recarga', 'number'],
  ['extra', 'Extra', 'number'],
  ['status_produtividade', 'Status', 'text']
];

const armazemManualFields = [
  ['matricula', 'Matricula', 'text'],
  ['competencia', 'Competencia', 'text'],
  ['periodo_inicio', 'Periodo inicial', 'date'],
  ['periodo_fim', 'Periodo final', 'date'],
  ['funcao_armazem', 'Funcao no armazem', 'select'],
  ['pontos', 'Pontos', 'number'],
  ['faixa', 'Faixa', 'text'],
  ['rv_antiga', 'RV antiga', 'number'],
  ['rv_nova', 'RV nova', 'number'],
  ['erros', 'Erros', 'number'],
  ['valor_total_previsto', 'Valor total previsto', 'number'],
  ['status_produtividade', 'Status', 'text'],
  ['usuario_wms', 'Usuario WMS', 'text'],
  ['codigo_operacional', 'Codigo operacional', 'text']
];

function buildManualState(registro = {}, variant = 'rota') {
  const fields = variant === 'armazem' ? armazemManualFields : rotaManualFields;
  return fields.reduce((acc, [key]) => {
    acc[key] = registro?.[key] ?? '';
    return acc;
  }, { mensagem_rh: registro?.mensagem_rh ?? '' });
}

function ManualProdutividadeForm({ registro, variant = 'rota', onSubmit, onCancel }) {
  const isArmazem = variant === 'armazem';
  const fields = isArmazem ? armazemManualFields : rotaManualFields;
  const [form, setForm] = useState(() => buildManualState(registro, variant));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(buildManualState(registro, variant));
  }, [registro, variant]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="prod-manual-form" onSubmit={handleSubmit}>
      <div className="prod-manual-form-heading">
        <div>
          <h3>{isArmazem ? 'Lancamento manual do armazem' : 'Editar premio de rota'}</h3>
          <p>{isArmazem ? 'Preencha os dados que serao exibidos ao colaborador.' : 'Ajuste manualmente os valores do premio para motoristas e ajudantes.'}</p>
        </div>
        {onCancel ? <button type="button" className="detail-action-button secondary" onClick={onCancel}>Cancelar</button> : null}
      </div>
      <div className="prod-manual-grid">
        {fields.map(([key, label, type]) => (
          <label key={key}>
            {label}
            {type === 'select' ? (
              <select value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={['funcao_armazem'].includes(key)}>
                <option value="">Selecione</option>
                <option value="Ajudante">Ajudante</option>
                <option value="Operador de Empilhadeira">Operador de Empilhadeira</option>
                <option value="Amarrador">Amarrador</option>
              </select>
            ) : (
              <input
                type={type}
                step={type === 'number' ? '0.01' : undefined}
                value={form[key] || ''}
                disabled={Boolean(registro?.id) && key === 'matricula'}
                required={isArmazem && ['matricula', 'competencia'].includes(key)}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              />
            )}
          </label>
        ))}
        <label className="prod-manual-wide">
          Mensagem RH
          <textarea value={form.mensagem_rh || ''} onChange={(event) => setForm({ ...form, mensagem_rh: event.target.value })} rows={3} />
        </label>
      </div>
      <div className="prod-manual-actions">
        <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar manualmente'}</button>
      </div>
    </form>
  );
}

function ColaboradorRotaPanel({ rows }) {
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    setSelectedId(rows[0]?.id ? String(rows[0].id) : '');
  }, [rows]);

  const selected = rows.find((row) => String(row.id) === selectedId) || rows[0];
  const consolidated = rows.reduce((acc, row) => {
    acc.valor_total_previsto += asNumber(row.valor_total_previsto);
    acc.entregas += asNumber(row.entregas);
    acc.caixas += asNumber(row.caixas);
    acc.recargas += asNumber(row.recargas);
    acc.bonus += asNumber(row.bonus);
    return acc;
  }, { valor_total_previsto: 0, entregas: 0, caixas: 0, recargas: 0, bonus: 0 });

  return (
    <>
      {rows.length ? (
        <>
          <section className="prod-summary-grid">
            <div><span>Funcao</span><strong>{formatRotaFuncao(selected?.funcao_rv)}</strong></div>
            <div><span>Competencia</span><strong>{selected?.competencia || '-'}</strong></div>
            <div><span>Indicadores principais</span><strong>{formatNumber(consolidated.entregas)} entregas</strong></div>
            <div><span>Status</span><strong>{selected?.status_produtividade || 'Sem dados'}</strong></div>
          </section>
          {rows.length > 1 ? (
              <label className="prod-selector">
                Competencia / funcao
                <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                  {rows.map((row) => <option key={row.id} value={row.id}>{row.competencia} - {formatRotaFuncao(row.funcao_rv)}</option>)}
                </select>
              </label>
          ) : null}
          <ProdutividadeDetail registro={selected} />
        </>
      ) : null}
    </>
  );
}

function ColaboradorArmazemPanel({ rows }) {
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    setSelectedId(rows[0]?.id ? String(rows[0].id) : '');
  }, [rows]);

  const selected = rows.find((row) => String(row.id) === selectedId) || rows[0];

  return (
    <>
      <ArmazemGoalsCard />
      <div className="prod-info-note">Seu premio do armazem e calculado com base nos dados importados da apuracao oficial da RV.</div>
      {rows.length ? (
        <>
          <section className="prod-summary-grid">
            <div><span>Valor previsto</span><strong>{formatMoney(selected?.valor_total_previsto)}</strong></div>
            <div><span>Funcao</span><strong>{formatArmazemFuncao(selected?.funcao_armazem)}</strong></div>
            <div><span>Competencia</span><strong>{selected?.competencia || '-'}</strong></div>
            <div><span>Indicadores principais</span><strong>{formatNumber(selected?.pontos)} pontos</strong></div>
            <div><span>Status</span><strong>{selected?.status_produtividade || 'Sem dados'}</strong></div>
          </section>
          {rows.length > 1 ? (
            <label className="prod-selector">
              Competencia / funcao
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {rows.map((row) => <option key={row.id} value={row.id}>{row.competencia} - {formatArmazemFuncao(row.funcao_armazem)}</option>)}
              </select>
            </label>
          ) : null}
          {selected?.mensagem_rh ? <div className="prod-info-note">{selected.mensagem_rh}</div> : null}
          <ProdutividadeDetail registro={selected} variant="armazem" />
        </>
      ) : null}
    </>
  );
}

function ColaboradorProdutividade() {
  const [activeTab, setActiveTab] = useState('rota');
  const [rotaRows, setRotaRows] = useState([]);
  const [armazemRows, setArmazemRows] = useState([]);
  const [maintenance, setMaintenance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([getMeuProdutividade(), getMeuProdutividadeArmazem()])
      .then(([rotaResult, armazemResult]) => {
        const rotaRows = rotaResult.status === 'fulfilled' && Array.isArray(rotaResult.value) ? rotaResult.value : [];
        const armazemRows = armazemResult.status === 'fulfilled'
          ? (Array.isArray(armazemResult.value) ? armazemResult.value : (armazemResult.value.rows || []))
          : [];
        const rotaMaintenance = rotaResult.status === 'rejected' && rotaResult.reason?.code === 'MODULO_EM_MANUTENCAO' ? rotaResult.reason.modulo : null;
        const armazemMaintenance = armazemResult.status === 'rejected' && armazemResult.reason?.code === 'MODULO_EM_MANUTENCAO' ? armazemResult.reason.modulo : null;

        setRotaRows(rotaRows);
        setArmazemRows(armazemRows);

        if (rotaMaintenance?.chave === 'premio_produtividade') {
          setMaintenance(rotaMaintenance);
          return;
        }

        if (!rotaRows.length && armazemRows.length) setActiveTab('armazem');
        if (rotaRows.length) setActiveTab('rota');
        if (!rotaRows.length && !armazemRows.length && armazemMaintenance) setMaintenance(armazemMaintenance);
        if (!rotaRows.length && !armazemRows.length && !armazemMaintenance) {
          setMessage('Voce ainda nao possui dados de Premio de Produtividade para este periodo.');
        }
      })
      .catch(() => setMessage('Voce ainda nao possui dados de Premio de Produtividade para este periodo.'))
      .finally(() => setLoading(false));
  }, []);

  const tabs = [
    rotaRows.length ? { id: 'rota', label: 'Rota' } : null,
    armazemRows.length ? { id: 'armazem', label: 'Armazém' } : null
  ].filter(Boolean);

  if (maintenance) {
    return (
      <div className="page-card produtividade-page">
        <ProdutividadeMaintenance message={maintenance.mensagem_manutencao} />
      </div>
    );
  }

  return (
    <div className="page-card produtividade-page">
      <div className="admin-heading">
        <div>
          <h1>{activeTab === 'armazem' ? 'Meu Prêmio de Produtividade - Armazém' : 'Meu Prêmio de Produtividade'}</h1>
          <p>{activeTab === 'armazem' ? 'Consulte os dados oficiais importados da RV do Armazém.' : 'Seu prêmio é calculado com base nos indicadores importados da apuração oficial.'}</p>
        </div>
      </div>
      <div className="prod-warning">Caso não concorde ou não entenda alguma informação, procure o RH.</div>
      {loading ? <p>Carregando produtividade...</p> : null}
      {!loading && !tabs.length ? <div className="empty-state">{message || 'Voce ainda nao possui dados de Premio de Produtividade para este periodo.'}</div> : null}
      {!loading && tabs.length > 1 ? <ProdTabs activeTab={activeTab} onChange={setActiveTab} tabs={tabs} /> : null}
      {!loading && tabs.length === 1 ? <div className="prod-area-label">{tabs[0].label}</div> : null}
      {!loading && activeTab === 'rota' && rotaRows.length ? <ColaboradorRotaPanel rows={rotaRows} /> : null}
      {!loading && activeTab === 'armazem' && armazemRows.length ? <ColaboradorArmazemPanel rows={armazemRows} /> : null}
    </div>
  );
}

function AdminRotaPanel() {
  const [filters, setFilters] = useState({ busca: '', competencia: '', funcao_rv: '', status_produtividade: '', bateu_devolucao: '', status_auditoria: '' });
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(emptyRotaSummary);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const options = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
    return {
      competencia: uniq('competencia'),
      funcao_rv: uniq('funcao_rv'),
      status_produtividade: uniq('status_produtividade'),
      status_auditoria: uniq('status_auditoria')
    };
  }, [rows]);

  useEffect(() => {
    refresh();
  }, [filters]);

  async function refresh() {
    setLoading(true);
    setMessage('');
    try {
      const [listResult, resumoResult] = await Promise.all([
        getAdminProdutividade(filters),
        getAdminProdutividadeResumo(filters)
      ]);
      setRows(listResult.rows || []);
      setSummary(resumoResult || listResult.summary || emptyRotaSummary);
    } catch (err) {
      setMessage(err.error || 'Erro ao carregar produtividade');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(row) {
    try {
      const result = await getAdminProdutividadeDetail(row.colaborador_id);
      setDetail(result.registros?.find((item) => item.id === row.id) || result.registros?.[0] || result.colaborador || null);
      setEditing(false);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } catch (err) {
      setMessage(err.error || 'Erro ao abrir detalhe');
    }
  }

  function closeDetail() {
    setDetail(null);
    setEditing(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  async function saveManual(payload) {
    try {
      const result = await updateAdminProdutividadeRegistro(detail.id, payload);
      setDetail(result.registro);
      setEditing(false);
      await refresh();
      setMessage(result.message || 'Premio atualizado manualmente.');
    } catch (err) {
      setMessage(err.error || 'Erro ao salvar premio manual');
    }
  }

  async function handleImport(files) {
    if (!files.length) return;
    try {
      const result = await importProdutividadeFile(files[0]);
      setMessage(`Importacao Premio de Produtividade: ${result.created} novos, ${result.updated} atualizados, ${result.ignored} ignorados, ${result.errors.length} erros.`);
      await refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao importar RV');
    }
  }

  const summaryCards = [
    ['Colaboradores com premio', summary.total_colaboradores, 'number'],
    ['Motoristas', summary.total_motoristas, 'number'],
    ['Ajudantes', summary.total_ajudantes, 'number'],
    ['Premio de Produtividade', summary.valor_total_previsto ?? summary.valor_total_nova_rv, 'money'],
    ['Dentro da meta', summary.total_bateu_devolucao, 'number'],
    ['Fora da meta', summary.total_nao_bateu_devolucao, 'number'],
    ['Recargas', summary.total_recargas, 'number'],
    ['Mapas', summary.total_mapas, 'number'],
    ['Revisar vinculo', summary.total_baixa_confianca, 'number']
  ];

  return (
    <>
      <div className="prod-actions">
        <button onClick={() => exportAdminProdutividade(filters)}>Exportar relatorio</button>
        <label>Importar Premio<input type="file" accept=".xlsx,.xlsm" onChange={(event) => handleImport(event.target.files)} /></label>
      </div>
      {message ? <div className="import-message">{message}</div> : null}
      {detail ? (
        <section className="detail-view-panel">
          <div className="detail-view-toolbar">
            <button type="button" className="detail-back-button" onClick={closeDetail}>
              <span aria-hidden="true">&larr;</span> Retornar
            </button>
            <button type="button" className="detail-action-button" onClick={() => setEditing(true)}>Editar premio</button>
          </div>
          {editing ? <ManualProdutividadeForm registro={detail} onSubmit={saveManual} onCancel={() => setEditing(false)} /> : null}
          <ProdutividadeDetail registro={detail} />
        </section>
      ) : (
        <>
      <section className="prod-summary-grid">
        {summaryCards.map(([label, value, type]) => <div key={label}><span>{label}</span><strong>{formatValue(value, type)}</strong></div>)}
      </section>
      <section className="prod-filters">
        <label>Buscar por nome, matricula, CPF, competencia, nome RV ou codigo RV<input value={filters.busca} onChange={(event) => setFilters({ ...filters, busca: event.target.value })} /></label>
        <label>Competencia<select value={filters.competencia} onChange={(event) => setFilters({ ...filters, competencia: event.target.value })}><option value="">Todas</option>{options.competencia.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Funcao<select value={filters.funcao_rv} onChange={(event) => setFilters({ ...filters, funcao_rv: event.target.value })}><option value="">Todas</option><option value="motorista">Motorista</option><option value="ajudante">Ajudante de Motorista</option>{options.funcao_rv.filter((option) => !['motorista', 'ajudante'].includes(String(option).toLowerCase())).map((option) => <option key={option} value={option}>{formatRotaFuncao(option)}</option>)}</select></label>
        <label>Status<select value={filters.status_produtividade} onChange={(event) => setFilters({ ...filters, status_produtividade: event.target.value })}><option value="">Todos</option>{options.status_produtividade.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Devolucao<select value={filters.bateu_devolucao} onChange={(event) => setFilters({ ...filters, bateu_devolucao: event.target.value })}><option value="">Todas</option><option value="true">Dentro da meta</option><option value="false">Fora da meta</option></select></label>
        <label>Auditoria<select value={filters.status_auditoria} onChange={(event) => setFilters({ ...filters, status_auditoria: event.target.value })}><option value="">Todas</option>{options.status_auditoria.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      </section>
      {summary.total_baixa_confianca ? <div className="prod-warning">Existem {summary.total_baixa_confianca} registro(s) com baixa confianca de cruzamento para revisao.</div> : null}
      {loading ? <p>Carregando produtividade...</p> : null}
      {!loading && !rows.length ? <div className="empty-state">Nenhum dado de produtividade encontrado.</div> : null}
      {!loading && rows.length ? (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Matricula</th><th>Nome</th><th>CPF</th><th>Competencia</th><th>Funcao</th><th>Caixas</th><th>Entregas</th><th>Devolucao</th><th>Status devolucao</th><th>Recargas</th><th>Mapas</th><th>Premio de Produtividade</th><th>Status</th><th>Auditoria</th><th>Acoes</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.matricula}</td><td>{row.nome_completo}</td><td>{row.cpf}</td><td>{row.competencia}</td><td>{formatRotaFuncao(row.funcao_rv)}</td><td>{formatNumber(row.caixas)}</td><td>{formatNumber(row.entregas)}</td><td>{formatPercent(row.percentual_devolucao)}</td><td><StatusBadge type="devolucao" value={row.bateu_devolucao} /></td><td>{formatNumber(row.recargas)}</td><td>{formatNumber(row.mapas)}</td><td>{formatMoney(row.valor_total_previsto)}</td><td><StatusBadge type="status" value={row.status_produtividade} /></td><td><StatusBadge type="auditoria" value={row.status_auditoria} /></td><td><button className="detail-action-button" onClick={() => openDetail(row)}>Ver detalhes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
        </>
      )}
    </>
  );
}

function AdminArmazemPanel() {
  const [filters, setFilters] = useState({ busca: '', competencia: '', funcao_armazem: '', status_produtividade: '', status_auditoria: '', origem_calculo: '' });
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(emptyArmazemSummary);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const options = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
    return {
      competencia: uniq('competencia'),
      funcao_armazem: uniq('funcao_armazem'),
      status_produtividade: uniq('status_produtividade'),
      status_auditoria: uniq('status_auditoria'),
      origem_calculo: uniq('origem_calculo')
    };
  }, [rows]);

  useEffect(() => {
    refresh();
  }, [filters]);

  async function refresh() {
    setLoading(true);
    setMessage('');
    try {
      const [listResult, resumoResult] = await Promise.all([getAdminProdutividadeArmazem(filters), getAdminProdutividadeArmazemResumo(filters)]);
      setRows(listResult.rows || []);
      setSummary(resumoResult || listResult.summary || emptyArmazemSummary);
    } catch (err) {
      setMessage(err.error || 'Erro ao carregar produtividade do armazem');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(row) {
    try {
      const result = await getAdminProdutividadeArmazemDetail(row.colaborador_id);
      setDetail(result.registros?.find((item) => item.id === row.id) || result.registros?.[0] || result.colaborador || null);
      setEditing(false);
      setCreating(false);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } catch (err) {
      setMessage(err.error || 'Erro ao abrir detalhe do armazem');
    }
  }

  function closeDetail() {
    setDetail(null);
    setEditing(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  async function saveManual(payload) {
    try {
      const result = detail?.id
        ? await updateAdminProdutividadeArmazemRegistro(detail.id, payload)
        : await createAdminProdutividadeArmazemManual(payload);
      setDetail(result.registro);
      setEditing(false);
      setCreating(false);
      await refresh();
      setMessage(result.message || 'Lancamento manual do armazem salvo.');
    } catch (err) {
      setMessage(err.error || 'Erro ao salvar lancamento manual do armazem');
    }
  }

  const summaryCards = [
    ['Colaboradores com RV', summary.total_colaboradores_com_rv, 'number'],
    ['Ajudantes', summary.total_ajudantes, 'number'],
    ['Operadores empilhadeira', summary.total_operadores_empilhadeira, 'number'],
    ['Amarradores', summary.total_amarradores, 'number'],
    ['Valor previsto', summary.valor_total_previsto, 'money'],
    ['RV antiga', summary.valor_total_rv_antiga, 'money'],
    ['RV nova', summary.valor_total_rv_nova, 'money'],
    ['Revisar vinculo', summary.total_baixa_confianca, 'number']
  ];

  return (
    <>
      <div className="prod-actions">
        <button type="button" onClick={() => { setDetail(null); setEditing(false); setCreating(true); }}>Novo lancamento manual</button>
        <button onClick={() => exportAdminProdutividadeArmazem(filters)}>Exportar relatorio</button>
      </div>
      {message ? <div className="import-message">{message}</div> : null}
      {creating ? (
        <ManualProdutividadeForm
          variant="armazem"
          onSubmit={saveManual}
          onCancel={() => setCreating(false)}
        />
      ) : null}
      {detail ? (
        <section className="detail-view-panel">
          <div className="detail-view-toolbar">
            <button type="button" className="detail-back-button" onClick={closeDetail}>
              <span aria-hidden="true">&larr;</span> Retornar
            </button>
            <button type="button" className="detail-action-button" onClick={() => setEditing(true)}>Editar lancamento</button>
          </div>
          {editing ? <ManualProdutividadeForm registro={detail} variant="armazem" onSubmit={saveManual} onCancel={() => setEditing(false)} /> : null}
          <ProdutividadeDetail registro={detail} variant="armazem" />
        </section>
      ) : (
        <>
      <ArmazemGoalsCard />
      <section className="prod-summary-grid">
        {summaryCards.map(([label, value, type]) => <div key={label}><span>{label}</span><strong>{formatValue(value, type)}</strong></div>)}
      </section>
      <section className="prod-filters">
        <label>Buscar por nome, matricula, CPF, competencia, usuario WMS ou codigo operacional<input value={filters.busca} onChange={(event) => setFilters({ ...filters, busca: event.target.value })} /></label>
        <label>Competencia<select value={filters.competencia} onChange={(event) => setFilters({ ...filters, competencia: event.target.value })}><option value="">Todas</option>{options.competencia.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Funcao<select value={filters.funcao_armazem} onChange={(event) => setFilters({ ...filters, funcao_armazem: event.target.value })}><option value="">Todas</option><option value="Ajudante">Ajudante</option><option value="Operador de Empilhadeira">Operador de Empilhadeira</option><option value="Amarrador">Amarrador</option>{options.funcao_armazem.filter((option) => !['ajudante', 'operador de empilhadeira', 'amarrador'].includes(String(option).toLowerCase())).map((option) => <option key={option} value={option}>{formatArmazemFuncao(option)}</option>)}</select></label>
        <label>Status<select value={filters.status_produtividade} onChange={(event) => setFilters({ ...filters, status_produtividade: event.target.value })}><option value="">Todos</option>{options.status_produtividade.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Auditoria<select value={filters.status_auditoria} onChange={(event) => setFilters({ ...filters, status_auditoria: event.target.value })}><option value="">Todas</option>{options.status_auditoria.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Origem calculo<select value={filters.origem_calculo} onChange={(event) => setFilters({ ...filters, origem_calculo: event.target.value })}><option value="">Todas</option>{options.origem_calculo.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      </section>
      {summary.total_baixa_confianca ? <div className="prod-warning">Existem {summary.total_baixa_confianca} registro(s) com baixa confianca de cruzamento para revisao.</div> : null}
      {loading ? <p>Carregando produtividade do armazem...</p> : null}
      {!loading && !rows.length ? <div className="empty-state">Nenhum dado de produtividade do armazem encontrado.</div> : null}
      {!loading && rows.length ? (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Matricula</th><th>Nome</th><th>Funcao</th><th>Competencia</th><th>Pontos</th><th>Faixa</th><th>RV antiga</th><th>RV nova</th><th>Erros</th><th>Valor previsto</th><th>Status</th><th>Auditoria</th><th>Acoes</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.matricula}</td><td>{row.nome_completo}</td><td>{formatArmazemFuncao(row.funcao_armazem)}</td><td>{row.competencia}</td><td>{formatNumber(row.pontos)}</td><td>{row.faixa || '-'}</td><td>{formatMoney(row.rv_antiga)}</td><td>{formatMoney(row.rv_nova)}</td><td>{formatNumber(row.erros)}</td><td>{formatMoney(row.valor_total_previsto)}</td><td><StatusBadge type="status" value={row.status_produtividade} /></td><td><StatusBadge type="auditoria" value={row.status_auditoria} /></td><td><button className="detail-action-button" onClick={() => openDetail(row)}>Ver detalhes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
        </>
      )}
    </>
  );
}

function AdminProdutividadeResumo() {
  const [summary, setSummary] = useState({
    rota: emptyRotaSummary,
    armazem: emptyArmazemSummary
  });

  useEffect(() => {
    Promise.allSettled([getAdminProdutividadeResumo(), getAdminProdutividadeArmazemResumo()])
      .then(([rotaResult, armazemResult]) => {
        setSummary({
          rota: rotaResult.status === 'fulfilled' ? rotaResult.value : emptyRotaSummary,
          armazem: armazemResult.status === 'fulfilled' ? armazemResult.value : emptyArmazemSummary
        });
      });
  }, []);

  const cards = [
    ['Total Premio Rota', summary.rota.valor_total_previsto ?? summary.rota.valor_total_nova_rv, 'money'],
    ['Total RV Armazém', summary.armazem.valor_total_previsto, 'money'],
    ['Total Motoristas', summary.rota.total_motoristas, 'number'],
    ['Total Ajudantes de Motorista', summary.rota.total_ajudantes, 'number'],
    ['Total Ajudantes Armazém', summary.armazem.total_ajudantes, 'number'],
    ['Total Operadores de Empilhadeira', summary.armazem.total_operadores_empilhadeira, 'number'],
    ['Total Amarradores', summary.armazem.total_amarradores, 'number']
  ];

  return (
    <section className="prod-summary-grid prod-admin-overview" aria-label="Resumo geral de produtividade">
      {cards.map(([label, value, type]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{formatValue(value, type)}</strong>
        </div>
      ))}
    </section>
  );
}

function AdminProdutividade() {
  const [activeTab, setActiveTab] = useState('rota');

  return (
    <div className="page-card produtividade-page">
      <div className="admin-heading">
        <div>
          <h1>{activeTab === 'armazem' ? 'Prêmio de Produtividade - Armazém' : 'Prêmio de Produtividade'}</h1>
          <p>{activeTab === 'armazem' ? 'Consulte, filtre, importe e exporte os dados oficiais de RV do Armazém.' : 'Consulte, filtre, importe e exporte os dados oficiais do Premio de Produtividade da Rota.'}</p>
        </div>
      </div>
      <AdminProdutividadeResumo />
      <ProdTabs activeTab={activeTab} onChange={setActiveTab} tabs={[{ id: 'rota', label: 'Rota' }, { id: 'armazem', label: 'Armazém' }]} />
      <div className="prod-warning">Caso não concorde ou não entenda alguma informação, procure o RH.</div>
      {activeTab === 'rota' ? <AdminRotaPanel /> : <AdminArmazemPanel />}
    </div>
  );
}

export default function ProdutividadePage({ user }) {
  return isAdminUser(user) ? <AdminProdutividade /> : <ColaboradorProdutividade />;
}
