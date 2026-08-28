import { useEffect, useMemo, useState } from 'react';
import {
  createAdminProdutividadeArmazemManual,
  approveOnDemandArmazemImport,
  approveProdutividadeImport,
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
  importOnDemandArmazemFile,
  updateAdminProdutividadeArmazemRegistro,
  updateAdminProdutividadeRegistro
} from '../api.js';
import { countPendingIndicatorDecisions } from './produtividadeConference.js';

const rotaMetricFields = [
  ['competencia', 'Período', ''],
  ['valor_total_previsto', 'Valor', 'money'],
  ['mapas', 'Qnt Mapas', 'number'],
  ['caixas', 'Caixas', 'number'],
  ['recargas', 'Rec', 'number'],
  ['percentual_devolucao', '% Dev', 'percent']
];

const rotaDetailFields = [
  ['competencia', 'Competência'],
  ['periodo_inicio', 'Período inicial', 'date'],
  ['periodo_fim', 'Período final', 'date'],
  ['funcao_rv', 'Função no período'],
  ['caixas', 'Caixas', 'number'],
  ['entregas', 'Entregas', 'number'],
  ['percentual_devolucao', 'Percentual de devolução', 'percent'],
  ['meta_devolucao', 'Meta de devolução', 'percent'],
  ['bateu_devolucao', 'Status da devolução', 'devolucao'],
  ['recargas', 'Recargas', 'number'],
  ['mapas', 'Mapas', 'number'],
  ['valor_recarga', 'Valor recarga', 'money'],
  ['bonus', 'Bonus', 'money'],
  ['valor_total_previsto', 'Valor a receber', 'money'],
  ['status_produtividade', 'Status produtividade'],
  ['status_auditoria', 'Auditoria', 'auditoria'],
  ['metodo_cruzamento', 'Metodo cruzamento', 'sourceLabel'],
  ['confianca_cruzamento', 'Confiança do cruzamento', 'confidencePercent'],
  ['mensagem_rh', 'Mensagem RH']
];

const armazemMetricFields = [
  ['valor_total_previsto', 'Valor previsto', 'money'],
  ['valor_indicadores_total', 'Metas confirmadas', 'money'],
  ['valor_adicional_total', 'Valores adicionais', 'money'],
  ['pontos', 'Pontuacao', 'number'],
  ['faixa', 'Faixa'],
  ['funcao_armazem', 'Função'],
  ['erros', 'Erros', 'number'],
  ['rv_nova', 'RV Nova', 'money']
];

const armazemDetailFields = [
  ['competencia', 'Competência'],
  ['periodo_inicio', 'Período inicial', 'date'],
  ['periodo_fim', 'Período final', 'date'],
  ['funcao_armazem', 'Função no armazém'],
  ['pontos', 'Pontos', 'number'],
  ['faixa', 'Faixa'],
  ['rv_antiga', 'RV antiga', 'money'],
  ['rv_nova', 'RV nova', 'money'],
  ['erros', 'Erros', 'number'],
  ['valor_total_previsto', 'Valor total previsto', 'money'],
  ['status_produtividade', 'Status produtividade'],
  ['origem_calculo', 'Origem do calculo', 'sourceLabel'],
  ['status_auditoria', 'Auditoria', 'auditoria'],
  ['metodo_cruzamento', 'Metodo cruzamento', 'sourceLabel'],
  ['confianca_cruzamento', 'Confiança do cruzamento', 'confidencePercent'],
  ['usuario_wms', 'Usuário On Demand'],
  ['codigo_operacional', 'Código operacional'],
  ['mensagem_rh', 'Mensagem RH']
];

const armazemGoalGroups = [
  {
    key: 'turno-a',
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
    key: 'turno-b',
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
    key: 'operadores',
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

function normalizeWarehouseAudience(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function warehouseAudienceKey(registro) {
  const role = normalizeWarehouseAudience(`${registro?.funcao_armazem || ''} ${registro?.cargo || ''}`);
  if (role.includes('operador') || role.includes('empilhadeira')) return 'operadores';

  const declaredShift = normalizeWarehouseAudience(registro?.turno_armazem);
  if (declaredShift === 'c' || /\b(?:turno|turma|equipe|shift)\s*c\b/.test(declaredShift)) return 'turno-c';
  if (declaredShift === 'b' || /\b(?:turno|turma|equipe|shift)\s*b\b/.test(declaredShift)) return 'turno-b';
  if (declaredShift === 'a' || /\b(?:turno|turma|equipe|shift)\s*a\b/.test(declaredShift)) return 'turno-a';

  const indicators = normalizeWarehouseAudience([
    registro?.indicador_1,
    registro?.indicador_2,
    registro?.indicador_3,
    registro?.mensagem_rh
  ].filter(Boolean).join(' '));
  if (indicators.includes('ressuprimento')) return 'turno-b';
  return 'turno-a';
}

function turnoCGoalGroup(registro) {
  const goals = [registro?.indicador_1, registro?.indicador_2, registro?.indicador_3]
    .filter(Boolean)
    .map((indicator, index) => {
      const [label, ...valueParts] = String(indicator).split(':');
      return {
        code: `I${index + 1}`,
        label: label.trim().toUpperCase(),
        meta: 'Conforme apuração',
        value: valueParts.join(':').trim() || 'Consulte o detalhamento',
        accumulated: ''
      };
    });
  return {
    key: 'turno-c',
    title: 'RV AJUDANTES - TURNO C',
    goals,
    items: armazemGoalGroups[0].items
  };
}

function warehouseGoalGroupsFor(registro) {
  const audienceKey = warehouseAudienceKey(registro);
  if (audienceKey === 'turno-c') return [turnoCGoalGroup(registro)];
  return armazemGoalGroups.filter((group) => group.key === audienceKey);
}

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

function formatConfidencePercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${(asNumber(value) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10).split('-').reverse().join('/');
}

function formatValue(value, type) {
  if (type === 'money') return formatMoney(value);
  if (type === 'percent') return formatPercent(value);
  if (type === 'confidencePercent') return formatConfidencePercent(value);
  if (type === 'sourceLabel') return formatSourceLabel(value);
  if (type === 'number') return formatNumber(value);
  if (type === 'date') return formatDate(value);
  if (type === 'devolucao') return value ? 'Dentro da meta' : 'Fora da meta';
  return value || '-';
}

function formatSourceLabel(value) {
  if (!value) return '-';
  return String(value)
    .replace(/one[ _-]?pager/gi, 'On Demand')
    .replace(/wms/gi, 'On Demand')
    .replace(/_/g, ' ');
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
    const normalizedAudit = String(value || '').trim().toLowerCase();
    const auditLabels = {
      revisar_cruzamento: 'Revisar vínculo',
      pendente_indicadores: 'Metas pendentes',
      pendente_conferencia_erros: 'Conferir erros',
      revisar_valores_atividade: 'Revisar valores',
      divergencia_bi: 'Revisar cálculo'
    };
    const auditOk = normalizedAudit === 'ok';
    return <span className={`prod-badge ${auditOk ? 'success' : 'warning'}`}>{auditOk ? 'OK' : (auditLabels[normalizedAudit] || value || 'Revisão pendente')}</span>;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return <span className={`prod-badge ${normalized ? 'success' : 'muted'}`}>{value || 'Sem dados'}</span>;
}

function ProdutividadeMaintenance({ message }) {
  return (
    <div className="maintenance-page">
      <span className="maintenance-modal-icon" aria-hidden="true">!</span>
      <h1>Prêmio de Produtividade em manutenção</h1>
      <p>{message || 'Estamos ajustando os dados deste painel para garantir que as informacoes sejam apresentadas corretamente. Em breve ele estara disponivel.'}</p>
    </div>
  );
}

function ProdTabs({ activeTab, onChange, tabs }) {
  return (
    <div className="prod-tabs" role="tablist" aria-label="Tipos de prêmio de produtividade">
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

function ProdutividadeDetail({ registro, variant = 'rota', detailedTasks = false }) {
  if (!registro) return null;
  const isArmazem = variant === 'armazem';
  const metricFields = isArmazem ? armazemMetricFields : rotaMetricFields;
  const detailFields = isArmazem ? armazemDetailFields : rotaDetailFields;
  const funcao = isArmazem ? formatArmazemFuncao(registro.funcao_armazem) : formatRotaFuncao(registro.funcao_rv);
  const tarefas = isArmazem && Array.isArray(registro.tarefas_detalhadas) ? registro.tarefas_detalhadas : [];
  const valorTotalTarefas = tarefas.reduce((total, tarefa) => total + asNumber(tarefa.total), 0);

  return (
    <section className="prod-detail">
      <div className="prod-detail-heading">
        <div>
          <h2>{registro.nome_completo}</h2>
          <p>{registro.matricula} - {funcao || 'Função não informada'}</p>
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
      {tarefas.length ? (
        <section className="prod-task-breakdown">
          <div className="prod-task-card">
            <div className="prod-task-card-heading">
              <div>
                <span>Detalhamento das tarefas</span>
                <h3>Tarefas consideradas no cálculo</h3>
                <p>{tarefas.length} {tarefas.length === 1 ? 'tarefa considerada' : 'tarefas consideradas'}</p>
              </div>
              <div className="prod-task-total">
                <span>Valor total das tarefas</span>
                <strong>{formatMoney(valorTotalTarefas)}</strong>
              </div>
            </div>
            <div className="prod-task-list">
              {tarefas.map((task, index) => (
                <article className="prod-task-item" key={`${task.atividade}-${index}`}>
                  <div className="prod-task-name">
                    <span>Tarefa {index + 1}</span>
                    <strong>{task.atividade}</strong>
                  </div>
                  <div className="prod-task-values">
                    {detailedTasks ? (
                      <>
                        <div><span>Quantidade</span><strong>{formatNumber(task.quantidade)}</strong></div>
                        <div><span>Valor unitário</span><strong>{formatMoney(task.valuePerUnit)}</strong></div>
                      </>
                    ) : null}
                    <div className="prod-task-item-total"><span>Valor</span><strong>{formatMoney(task.total)}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {isArmazem && registro.valores_adicionais?.length ? (
        <section className="prod-task-breakdown prod-additional-values">
          <h3>Valores adicionais</h3>
          {registro.valores_adicionais.map((item, index) => (
            <div className="prod-additional-value" key={`${item.observacao}-${index}`}>
              <strong>{formatMoney(item.valor)}</strong>
              <span>{item.observacao}</span>
            </div>
          ))}
        </section>
      ) : null}
      {isArmazem && registro.indicadores_confirmados?.length ? (
        <section className="prod-task-breakdown prod-additional-values">
          <h3>Metas e indicadores confirmados</h3>
          {registro.indicadores_confirmados.map((item, index) => (
            <div className="prod-additional-value" key={`${item.nome}-${index}`}>
              <strong>{formatMoney(item.valor)}</strong>
              <span>{item.nome}</span>
            </div>
          ))}
        </section>
      ) : null}
      {isArmazem && registro.correcao_manual_premio ? (
        <section className="prod-task-breakdown prod-manual-correction-detail">
          <h3>Correção manual realizada na conferência</h3>
          <div className="prod-manual-correction-values">
            <div><span>Valor calculado</span><strong>{formatMoney(registro.correcao_manual_premio.valorAnterior)}</strong></div>
            <div><span>Valor final corrigido</span><strong>{formatMoney(registro.correcao_manual_premio.valorFinal)}</strong></div>
            <div><span>Diferença</span><strong>{formatMoney(registro.correcao_manual_premio.diferenca)}</strong></div>
          </div>
          <p>{registro.correcao_manual_premio.observacao}</p>
        </section>
      ) : null}
    </section>
  );
}

function ArmazemGoalsCard({ registro = null }) {
  const goalGroups = registro ? warehouseGoalGroupsFor(registro) : armazemGoalGroups;
  return (
    <section className="prod-armazem-goals" aria-label="Metas Armazém">
      <div className="prod-armazem-goals-heading">
        <h2>Metas Armazém</h2>
      </div>
      <div className="prod-goal-groups">
        {goalGroups.map((group) => (
          <article className="prod-goal-group" key={group.key}>
            <h3>{group.title}</h3>
            {group.goals.length ? (
              <div className="prod-goal-metrics" style={{ '--goal-count': group.goals.length }}>
                {group.goals.map((goal) => (
                  <div className="prod-goal-metric" key={`${group.title}-${goal.code}`}>
                    <div className="prod-goal-code">{goal.code}</div>
                    <div className="prod-goal-label">{goal.label}</div>
                    <div className="prod-goal-copy">
                      <strong>Meta {goal.meta}</strong>
                      <span>Valor {goal.value}</span>
                      {goal.accumulated ? <b>Acumulado: {goal.accumulated}</b> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="prod-goal-empty">Os indicadores deste turno serão exibidos conforme a apuração oficial do período.</p>}
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
  ['valor_total_previsto', 'Prêmio de Produtividade', 'number'],
  ['rv_nova', 'RV nova', 'number'],
  ['bonus', 'Bonus', 'number'],
  ['valor_recarga', 'Valor recarga', 'number'],
  ['extra', 'Extra', 'number'],
  ['status_produtividade', 'Status', 'text']
];

const armazemManualFields = [
  ['matricula', 'Matrícula', 'text'],
  ['competencia', 'Competência', 'text'],
  ['periodo_inicio', 'Período inicial', 'date'],
  ['periodo_fim', 'Período final', 'date'],
  ['funcao_armazem', 'Função no armazém', 'select'],
  ['turno_armazem', 'Grupo de indicadores', 'warehouseShift'],
  ['pontos', 'Pontos', 'number'],
  ['faixa', 'Faixa', 'text'],
  ['rv_antiga', 'RV antiga', 'number'],
  ['rv_nova', 'RV nova', 'number'],
  ['erros', 'Erros', 'number'],
  ['valor_total_previsto', 'Valor total previsto', 'number'],
  ['status_produtividade', 'Status', 'text'],
  ['usuario_wms', 'Usuário On Demand', 'text'],
  ['codigo_operacional', 'Código operacional', 'text']
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
          <h3>{isArmazem ? 'Lançamento manual do armazém' : 'Editar prêmio da rota'}</h3>
          <p>{isArmazem ? 'Preencha os dados que serão exibidos ao colaborador.' : 'Ajuste manualmente os valores do prêmio para motoristas e ajudantes.'}</p>
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
            ) : type === 'warehouseShift' ? (
              <select value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })}>
                <option value="">Definir pela importação</option>
                <option value="A">Turno A</option>
                <option value="B">Turno B</option>
                <option value="C">Turno C</option>
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
  return (
    <>
      {rows.length ? (
        <>
          <section className="prod-summary-grid">
            <div className="prod-highlight-value"><span>Valor previsto nesta competência</span><strong>{formatMoney(selected?.valor_total_previsto)}</strong></div>
            <div><span>Função</span><strong>{formatRotaFuncao(selected?.funcao_rv)}</strong></div>
            <div><span>Competência</span><strong>{selected?.competencia || '-'}</strong></div>
            <div><span>Indicadores principais</span><strong>{formatNumber(selected?.entregas)} entregas</strong></div>
            <div><span>Status</span><strong>{selected?.status_produtividade || 'Sem dados'}</strong></div>
          </section>
          {rows.length > 1 ? (
              <label className="prod-selector">
                Competência / função
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
      {rows.length ? (
        <>
          <section className="prod-summary-grid">
            <div className="prod-highlight-value"><span>Valor previsto nesta competência</span><strong>{formatMoney(selected?.valor_total_previsto)}</strong></div>
            <div><span>Função</span><strong>{formatArmazemFuncao(selected?.funcao_armazem)}</strong></div>
            <div><span>Competência</span><strong>{selected?.competencia || '-'}</strong></div>
            <div><span>Indicadores principais</span><strong>{formatNumber(selected?.pontos)} pontos</strong></div>
            <div><span>Status</span><strong>{selected?.status_produtividade || 'Sem dados'}</strong></div>
          </section>
          {rows.length > 1 ? (
            <label className="prod-selector">
              Competência / função
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {rows.map((row) => <option key={row.id} value={row.id}>{row.competencia} - {formatArmazemFuncao(row.funcao_armazem)}</option>)}
              </select>
            </label>
          ) : null}
          <ProdutividadeDetail registro={selected} variant="armazem" />
          <details className="prod-goals-disclosure">
            <summary>Metas do Armazém</summary>
            <ArmazemGoalsCard registro={selected} />
          </details>
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
          setMessage('Você ainda não possui dados de Prêmio de Produtividade para este período.');
        }
      })
      .catch(() => setMessage('Você ainda não possui dados de Prêmio de Produtividade para este período.'))
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
      <div className="prod-warning">Caso não concorde com alguma informação, procure o seu supervisor.</div>
      {loading ? <p>Carregando produtividade...</p> : null}
      {!loading && !tabs.length ? <div className="empty-state">{message || 'Você ainda não possui dados de Prêmio de Produtividade para este período.'}</div> : null}
      {!loading && tabs.length > 1 ? <ProdTabs activeTab={activeTab} onChange={setActiveTab} tabs={tabs} /> : null}
      {!loading && tabs.length === 1 ? <div className="prod-area-label">{tabs[0].label}</div> : null}
      {!loading && activeTab === 'rota' && rotaRows.length ? <ColaboradorRotaPanel rows={rotaRows} /> : null}
      {!loading && activeTab === 'armazem' && armazemRows.length ? <ColaboradorArmazemPanel rows={armazemRows} /> : null}
    </div>
  );
}

function defaultConferenceIndicators(row = {}) {
  const role = normalizeWarehouseAudience(`${row.funcao_armazem || ''} ${row.cargo || ''}`);
  if (role.includes('operador') || role.includes('empilhadeira')) {
    return [
      { nome: 'Eficiência de carregamento', valor: 50 },
      { nome: 'TMA', valor: 100 },
      { nome: 'Eficiência de descarga', valor: 50 }
    ];
  }
  if (role.includes('ajudante') || role.includes('amarrador')) {
    return [
      { nome: 'Eficiência de carregamento', valor: 50 },
      { nome: 'Ressuprimento', valor: 50 },
      { nome: 'TMA', valor: 100 }
    ];
  }
  return [
    { nome: 'Eficiência de carregamento', valor: 50 },
    { nome: 'Ressuprimento', valor: 50 },
    { nome: 'TMA', valor: 100 },
    { nome: 'Eficiência de descarga', valor: 50 }
  ];
}

function buildIndicatorReviewState(rows = []) {
  return Object.fromEntries(rows.filter((row) => row.matricula).map((row) => [
    String(row.matricula),
    (row.indicadores_disponiveis?.length ? row.indicadores_disponiveis : defaultConferenceIndicators(row)).map((indicator) => ({
      nome: indicator.nome,
      valor: asNumber(indicator.valor),
      confirmado: (row.indicadores_confirmados || []).some((selected) => selected.nome === indicator.nome),
      decisao: (row.indicadores_confirmados || []).some((selected) => selected.nome === indicator.nome) ? 'atingiu' : ''
    }))
  ]));
}

function confirmedIndicatorTotal(indicatorReviews, matricula) {
  return (indicatorReviews[String(matricula)] || [])
    .filter((indicator) => indicator.confirmado)
    .reduce((sum, indicator) => sum + asNumber(indicator.valor), 0);
}

function buildAdditionalValueState(rows = []) {
  return Object.fromEntries(rows.filter((row) => row.matricula).map((row) => [
    String(row.matricula),
    { valor: asNumber(row.valor_adicional) || '', observacao: row.observacao_valor_adicional || '' }
  ]));
}

function buildManualCorrectionState(rows = []) {
  return Object.fromEntries(rows.filter((row) => row.matricula).map((row) => [
    String(row.matricula),
    { valor_final: row.correcao_manual?.valorFinal ?? '', observacao: row.correcao_manual?.observacao || '' }
  ]));
}

function hasManualCorrection(correction = {}) {
  return correction.valor_final !== '' && correction.valor_final !== null && correction.valor_final !== undefined;
}

function WarehouseConferenceCard({ row, reviews, additional, correction, indicatorTotal, publishing, onIndicatorChange, onAdditionalChange, onCorrectionChange }) {
  const calculatedTotal = asNumber(row.valor_total_previsto) + indicatorTotal + asNumber(additional.valor);
  const correctionActive = hasManualCorrection(correction);
  const finalTotal = correctionActive ? asNumber(correction.valor_final) : calculatedTotal;
  const adjustments = Array.isArray(row.ajustes) ? row.ajustes : [];

  return (
    <article className={`warehouse-conference-card${row.vinculado ? '' : ' is-ignored'}`}>
      <header className="warehouse-conference-card-heading">
        <div>
          <span className={`conference-status ${row.vinculado ? 'ok' : 'error'}`}>{row.vinculado ? 'Pronto para conferir' : 'Ignorado'}</span>
          <h3>{row.nome_completo}</h3>
          <p>Matrícula {row.matricula || '-'} · {formatArmazemFuncao(row.funcao_armazem || row.funcao_rv)} · {row.competencia}</p>
        </div>
        <div className="warehouse-conference-total">
          <span>Total após a conferência</span>
          <strong>{formatMoney(finalTotal)}</strong>
        </div>
      </header>

      <div className="warehouse-conference-base-values">
        <div><span>Tarefas/Pontos</span><strong>{formatNumber(row.pontos)}</strong></div>
        <div><span>Valor das tarefas</span><strong>{formatMoney(row.valor_tarefas)}</strong></div>
        <div><span>Indicadores marcados</span><strong>{formatMoney(indicatorTotal)}</strong></div>
        <div><span>Valor adicional</span><strong>{formatMoney(additional.valor)}</strong></div>
      </div>

      {row.vinculado ? (
        <div className="warehouse-conference-editors">
          <section className="warehouse-indicator-editor" aria-label={`Indicadores de ${row.nome_completo}`}>
            <div className="warehouse-editor-heading">
              <div><span>MARCAÇÃO MANUAL</span><h4>TMA e demais indicadores</h4></div>
              <p>Marque somente quando a meta tiver sido atingida. O valor pode ser corrigido antes da publicação.</p>
            </div>
            {reviews.length ? (
              <div className="warehouse-indicator-options">
                {reviews.map((indicator, indicatorIndex) => (
                  <div className={`warehouse-indicator-option${indicator.decisao ? ` is-${indicator.decisao}` : ''}`} key={`${indicator.nome}-${indicatorIndex}`}>
                    <span className="warehouse-indicator-copy">
                      <strong>{indicator.nome}</strong>
                      <small>{indicator.decisao === 'atingiu' ? 'Meta atingida e incluída no total' : indicator.decisao === 'nao_atingiu' ? 'Meta não atingida; valor não somado' : 'Informe obrigatoriamente o resultado'}</small>
                    </span>
                    <span className="warehouse-indicator-decision" role="radiogroup" aria-label={`Resultado de ${indicator.nome}`}>
                      <label className={indicator.decisao === 'atingiu' ? 'selected yes' : ''}>
                        <input
                          type="radio"
                          name={`indicator-${row.matricula}-${indicatorIndex}`}
                          checked={indicator.decisao === 'atingiu'}
                          disabled={publishing}
                          onChange={() => onIndicatorChange(row.matricula, indicatorIndex, { decisao: 'atingiu', confirmado: true })}
                        />
                        Atingiu
                      </label>
                      <label className={indicator.decisao === 'nao_atingiu' ? 'selected no' : ''}>
                        <input
                          type="radio"
                          name={`indicator-${row.matricula}-${indicatorIndex}`}
                          checked={indicator.decisao === 'nao_atingiu'}
                          disabled={publishing}
                          onChange={() => onIndicatorChange(row.matricula, indicatorIndex, { decisao: 'nao_atingiu', confirmado: false })}
                        />
                        Não atingiu
                      </label>
                    </span>
                    <span className="warehouse-indicator-value">
                      <small>Valor do indicador</small>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={indicator.valor}
                        disabled={!indicator.confirmado || publishing}
                        aria-label={`Valor de ${indicator.nome}`}
                        onChange={(event) => onIndicatorChange(row.matricula, indicatorIndex, { valor: event.target.value })}
                      />
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className="prod-warning">Nenhum indicador foi configurado para este colaborador. Não publique antes de revisar o cadastro.</div>}
          </section>

          <section className="warehouse-additional-editor">
            <div className="warehouse-editor-heading">
              <div><span>AJUSTE MANUAL</span><h4>Valor adicional</h4></div>
              <p>Use apenas para um valor que não esteja nas tarefas ou nos indicadores.</p>
            </div>
            <div className="warehouse-additional-inputs">
              <label>
                Valor adicional
                <input type="number" min="0" step="0.01" placeholder="R$ 0,00" value={additional.valor} disabled={publishing} onChange={(event) => onAdditionalChange(row.matricula, 'valor', event.target.value)} />
              </label>
              <label>
                Observação {asNumber(additional.valor) > 0 ? '(obrigatória)' : ''}
                <input type="text" maxLength="500" placeholder="Explique o motivo do valor adicional" value={additional.observacao} disabled={publishing} onChange={(event) => onAdditionalChange(row.matricula, 'observacao', event.target.value)} />
              </label>
            </div>
          </section>

          <section className={`warehouse-manual-correction-editor${correctionActive ? ' is-active' : ''}`}>
            <div className="warehouse-editor-heading">
              <div><span>CORREÇÃO DO PRÊMIO</span><h4>Substituir o valor final calculado</h4></div>
              <p>Preencha somente quando o total calculado estiver incorreto. O novo valor substituirá o total acima.</p>
            </div>
            <div className="warehouse-correction-summary">
              <div><span>Valor calculado</span><strong>{formatMoney(calculatedTotal)}</strong></div>
              <div><span>Valor final após correção</span><strong>{formatMoney(finalTotal)}</strong></div>
              {correctionActive ? <div><span>Diferença manual</span><strong>{formatMoney(finalTotal - calculatedTotal)}</strong></div> : null}
            </div>
            <div className="warehouse-correction-inputs">
              <label>
                Valor final corrigido
                <input type="number" min="0" step="0.01" placeholder={calculatedTotal.toFixed(2)} value={correction.valor_final} disabled={publishing} onChange={(event) => onCorrectionChange(row.matricula, 'valor_final', event.target.value)} />
              </label>
              <label>
                Motivo da correção {correctionActive ? '(obrigatório)' : ''}
                <input type="text" maxLength="500" placeholder="Explique por que o prêmio calculado foi alterado" value={correction.observacao} disabled={publishing} onChange={(event) => onCorrectionChange(row.matricula, 'observacao', event.target.value)} />
              </label>
              {correctionActive ? <button type="button" className="secondary-button" disabled={publishing} onClick={() => onCorrectionChange(row.matricula, 'limpar')}>Remover correção</button> : null}
            </div>
          </section>
        </div>
      ) : <div className="prod-warning">Este registro não possui vínculo válido e não será publicado.</div>}

      {adjustments.length ? <div className="warehouse-conference-adjustments"><strong>Ajustes das tarefas:</strong> {adjustments.map((item) => `${item.atividade}: ${formatMoney(item.total)}`).join('; ')}</div> : null}
    </article>
  );
}

function ImportConference({ variant, data, publishing, onApprove, onCancel }) {
  const isArmazem = variant === 'armazem';
  const report = isArmazem ? data?.report : data?.preview;
  const rows = isArmazem ? report?.linhas || [] : report?.rows || [];
  const [indicatorReviews, setIndicatorReviews] = useState(() => buildIndicatorReviewState(rows));
  const [additionalValues, setAdditionalValues] = useState(() => buildAdditionalValueState(rows));
  const [manualCorrections, setManualCorrections] = useState(() => buildManualCorrectionState(rows));
  if (!data) return null;
  const valid = isArmazem ? report?.cruzamentos?.length || 0 : report?.validRows || 0;
  const ignored = isArmazem ? report?.ignorados || 0 : report?.ignored || 0;
  const total = isArmazem
    ? rows.reduce((sum, row) => {
        if (!row.vinculado) return sum;
        const calculated = asNumber(row.valor_total_previsto) + confirmedIndicatorTotal(indicatorReviews, row.matricula) + asNumber(additionalValues[String(row.matricula)]?.valor);
        const correction = manualCorrections[String(row.matricula)] || {};
        return sum + (hasManualCorrection(correction) ? asNumber(correction.valor_final) : calculated);
      }, 0)
    : report?.totalPremioProdutividade || 0;
  const issues = isArmazem
    ? [...(report?.nao_encontrados || []), ...(report?.tarefas_sem_valor || []), ...(report?.excluidos_regra_oficial || [])]
    : [...(report?.notFound || []), ...(report?.errors || []), ...(report?.periodAlerts || [])];
  const availableIndicatorCount = Object.values(indicatorReviews).reduce((sum, reviews) => sum + reviews.length, 0);
  const pendingIndicatorDecisions = countPendingIndicatorDecisions(variant, rows, indicatorReviews);
  const missingAdditionalNotes = Object.values(additionalValues).filter((item) => asNumber(item.valor) > 0 && !String(item.observacao || '').trim()).length;
  const missingCorrectionNotes = Object.values(manualCorrections).filter((item) => hasManualCorrection(item) && !String(item.observacao || '').trim()).length;

  function updateIndicator(matricula, index, patch) {
    const key = String(matricula);
    setIndicatorReviews((current) => ({
      ...current,
      [key]: (current[key] || []).map((indicator, itemIndex) => itemIndex === index ? { ...indicator, ...patch } : indicator)
    }));
  }

  function updateAdditionalValue(matricula, field, value) {
    const key = String(matricula);
    setAdditionalValues((current) => ({
      ...current,
      [key]: { ...(current[key] || { valor: '', observacao: '' }), [field]: value }
    }));
  }

  function updateManualCorrection(matricula, field, value) {
    const key = String(matricula);
    setManualCorrections((current) => ({
      ...current,
      [key]: field === 'limpar'
        ? { valor_final: '', observacao: '' }
        : { ...(current[key] || { valor_final: '', observacao: '' }), [field]: value }
    }));
  }

  return (
    <section className="import-conference">
      <div className="import-conference-heading">
        <div><span className="conference-step">CONFERÊNCIA OBRIGATÓRIA</span><h2>Revise antes de publicar</h2><p>O arquivo foi apenas lido. Nenhum valor está visível para os colaboradores neste momento.</p></div>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={publishing}>Cancelar</button>
      </div>
      <div className="import-conference-summary">
        <div><span>Arquivo</span><strong>{data.arquivo || 'On Demand CSV'}</strong></div>
        <div><span>Competência</span><strong>{isArmazem ? report?.competencia : report?.competencias?.join(', ')}</strong></div>
        <div><span>Vínculos válidos</span><strong>{valid}</strong></div>
        <div><span>Ignorados</span><strong>{ignored}</strong></div>
        <div><span>Total a publicar</span><strong>{formatMoney(total)}</strong></div>
        <div><span>Expiração</span><strong>{data.expira_em_minutos || 30} min</strong></div>
      </div>
      {issues.length ? <div className="prod-warning">Existem {issues.length} inconsistência(s). Linhas sem vínculo não serão publicadas.</div> : null}
      {isArmazem && availableIndicatorCount ? <div className="prod-warning">TMA e demais metas não vêm no relatório. Marque somente os indicadores comprovados; apenas os marcados serão somados ao valor final.</div> : null}
      {isArmazem ? (
        <div className="warehouse-conference-list">
          {rows.map((row, index) => (
            <WarehouseConferenceCard
              key={`${row.matricula || row.nome_completo}-${index}`}
              row={row}
              reviews={indicatorReviews[String(row.matricula)] || []}
              additional={additionalValues[String(row.matricula)] || { valor: '', observacao: '' }}
              correction={manualCorrections[String(row.matricula)] || { valor_final: '', observacao: '' }}
              indicatorTotal={confirmedIndicatorTotal(indicatorReviews, row.matricula)}
              publishing={publishing}
              onIndicatorChange={updateIndicator}
              onAdditionalChange={updateAdditionalValue}
              onCorrectionChange={updateManualCorrection}
            />
          ))}
        </div>
      ) : (
        <div className="table-scroll import-conference-table">
          <table>
            <thead><tr><th>Situação</th><th>Matrícula</th><th>Nome</th><th>Função</th><th>Competência</th><th>Caixas</th><th>Entregas</th><th>Mapas</th><th>Valor final</th></tr></thead>
            <tbody>
              {rows.map((row, index) => <tr className={row.vinculado ? '' : 'conference-row-error'} key={`${row.matricula || row.nome_completo}-${index}`}><td><span className={`conference-status ${row.vinculado ? 'ok' : 'error'}`}>{row.vinculado ? 'Pronto' : 'Ignorado'}</span></td><td>{row.matricula || '-'}</td><td>{row.nome_completo}</td><td>{formatArmazemFuncao(row.funcao_armazem || row.funcao_rv)}</td><td>{row.competencia}</td><td>{formatNumber(row.caixas)}</td><td>{formatNumber(row.entregas)}</td><td>{formatNumber(row.mapas)}</td><td>{formatMoney(row.valor_total_previsto)}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      <div className="import-conference-approval">
        <p><strong>{pendingIndicatorDecisions ? `Responda se atingiu ou não atingiu ${pendingIndicatorDecisions} indicador(es).` : missingAdditionalNotes ? `Informe a observação de ${missingAdditionalNotes} valor(es) adicional(is) antes de publicar.` : missingCorrectionNotes ? `Informe o motivo de ${missingCorrectionNotes} correção(ões) manual(is) antes de publicar.` : 'Ao confirmar, os valores válidos serão publicados na competência correspondente.'}</strong></p>
        <button type="button" onClick={() => onApprove(isArmazem ? indicatorReviews : undefined, isArmazem ? additionalValues : undefined, isArmazem ? manualCorrections : undefined)} disabled={publishing || !valid || pendingIndicatorDecisions > 0 || missingAdditionalNotes > 0 || missingCorrectionNotes > 0}>{publishing ? 'Publicando...' : `Aprovar e publicar ${valid} registro(s)`}</button>
      </div>
    </section>
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
  const [pendingImport, setPendingImport] = useState(null);
  const [readingImport, setReadingImport] = useState(false);
  const [publishingImport, setPublishingImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importCompetencia, setImportCompetencia] = useState('');

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
      setMessage(result.message || 'Prêmio atualizado manualmente.');
    } catch (err) {
      setMessage(err.error || 'Erro ao salvar prêmio manual');
    }
  }

  async function handleImport(event, tipo) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!importCompetencia) {
      setMessage('Selecione a competência antes de enviar o arquivo.');
      input.value = '';
      return;
    }
    setReadingImport(true);
    setPendingImport(null);
    setMessage(`Lendo a planilha de ${tipo === 'van' ? 'VAN' : 'Rota'} e calculando os valores. Aguarde; arquivos grandes podem levar cerca de 1 minuto.`);
    try {
      const result = await importProdutividadeFile(file, tipo, importCompetencia);
      setPendingImport(result);
      setMessage('Arquivo lido. Confira todos os valores antes de publicar.');
    } catch (err) {
      setMessage(err.error || 'Erro ao importar RV');
    } finally {
      setReadingImport(false);
      input.value = '';
    }
  }

  async function approveRouteConference() {
    setPublishingImport(true);
    try {
      const result = await approveProdutividadeImport(pendingImport.preview_token);
      setPendingImport(null);
      await refresh();
      setMessage(`Prêmio publicado: ${result.created} novo(s), ${result.updated} atualizado(s) e ${result.ignored} ignorado(s).`);
    } catch (err) {
      setMessage(err.error || 'Erro ao publicar a conferência.');
    } finally {
      setPublishingImport(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setMessage('');
    try {
      await exportAdminProdutividade(filters);
      setMessage('Relatório do Prêmio da Rota e VAN exportado com sucesso.');
    } catch (err) {
      setMessage(err.error || 'Erro ao exportar o relatório do Prêmio da Rota e VAN.');
    } finally {
      setExporting(false);
    }
  }

  const summaryCards = [
    ['Colaboradores com prêmio', summary.total_colaboradores, 'number'],
    ['Motoristas', summary.total_motoristas, 'number'],
    ['Ajudantes', summary.total_ajudantes, 'number'],
    ['Prêmio de Produtividade', summary.valor_total_previsto ?? summary.valor_total_nova_rv, 'money'],
    ['Dentro da meta', summary.total_bateu_devolucao, 'number'],
    ['Fora da meta', summary.total_nao_bateu_devolucao, 'number'],
    ['Recargas', summary.total_recargas, 'number'],
    ['Mapas', summary.total_mapas, 'number'],
    ['Revisar vínculo', summary.total_baixa_confianca, 'number']
  ];

  return (
    <>
      <div className="prod-actions">
        <button type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Preparando relatório...' : 'Exportar Rota e VAN'}
        </button>
        <label className="prod-competencia-action">
          Competência do arquivo
          <input type="month" value={importCompetencia} onChange={(event) => setImportCompetencia(event.target.value)} required />
        </label>
        <label className={`prod-file-action${readingImport ? ' disabled' : ''}`}>
          {readingImport ? 'Lendo arquivo...' : 'Importar Rota'}
          <input type="file" accept=".xlsx,.xlsm" disabled={readingImport || publishingImport} onChange={(event) => handleImport(event, 'rota')} />
        </label>
        <label className={`prod-file-action van${readingImport ? ' disabled' : ''}`}>
          {readingImport ? 'Lendo arquivo...' : 'Importar VAN'}
          <input type="file" accept=".xlsx,.xlsm" disabled={readingImport || publishingImport} onChange={(event) => handleImport(event, 'van')} />
        </label>
      </div>
      {message ? <div className="import-message">{message}</div> : null}
      {pendingImport ? <ImportConference data={pendingImport} variant="rota" publishing={publishingImport} onApprove={approveRouteConference} onCancel={() => setPendingImport(null)} /> : null}
      {detail ? (
        <section className="detail-view-panel">
          <div className="detail-view-toolbar">
            <button type="button" className="detail-back-button" onClick={closeDetail}>
              <span aria-hidden="true">&larr;</span> Retornar
            </button>
            <button type="button" className="detail-action-button" onClick={() => setEditing(true)}>Editar prêmio</button>
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
        <label>Buscar por nome, matrícula, CPF, competência, nome RV ou código RV<input value={filters.busca} onChange={(event) => setFilters({ ...filters, busca: event.target.value })} /></label>
        <label>Competência<select value={filters.competencia} onChange={(event) => setFilters({ ...filters, competencia: event.target.value })}><option value="">Todas</option>{options.competencia.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Função<select value={filters.funcao_rv} onChange={(event) => setFilters({ ...filters, funcao_rv: event.target.value })}><option value="">Todas</option><option value="motorista">Motorista</option><option value="ajudante">Ajudante de Motorista</option>{options.funcao_rv.filter((option) => !['motorista', 'ajudante'].includes(String(option).toLowerCase())).map((option) => <option key={option} value={option}>{formatRotaFuncao(option)}</option>)}</select></label>
        <label>Status<select value={filters.status_produtividade} onChange={(event) => setFilters({ ...filters, status_produtividade: event.target.value })}><option value="">Todos</option>{options.status_produtividade.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Devolução<select value={filters.bateu_devolucao} onChange={(event) => setFilters({ ...filters, bateu_devolucao: event.target.value })}><option value="">Todas</option><option value="true">Dentro da meta</option><option value="false">Fora da meta</option></select></label>
        <label>Auditoria<select value={filters.status_auditoria} onChange={(event) => setFilters({ ...filters, status_auditoria: event.target.value })}><option value="">Todas</option>{options.status_auditoria.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      </section>
      {summary.total_baixa_confianca ? <div className="prod-warning">Existem {summary.total_baixa_confianca} registro(s) com baixa confiança de cruzamento para revisão.</div> : null}
      {loading ? <p>Carregando produtividade...</p> : null}
      {!loading && !rows.length ? <div className="empty-state">Nenhum dado de produtividade encontrado.</div> : null}
      {!loading && rows.length ? (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Matrícula</th><th>Nome</th><th>CPF</th><th>Competência</th><th>Função</th><th>Caixas</th><th>Entregas</th><th>Devolução</th><th>Status da devolução</th><th>Recargas</th><th>Mapas</th><th>Prêmio de Produtividade</th><th>Status</th><th>Auditoria</th><th>Ações</th></tr></thead>
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
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [publishingImport, setPublishingImport] = useState(false);
  const [onDemandFile, setOnDemandFile] = useState(null);
  const [operatorFile, setOperatorFile] = useState(null);
  const [importCompetencia, setImportCompetencia] = useState('');

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
      setMessage(err.error || 'Erro ao carregar produtividade do armazém');
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
      setMessage(err.error || 'Erro ao abrir detalhe do armazém');
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
      setMessage(result.message || 'Lançamento manual do armazém salvo.');
    } catch (err) {
      setMessage(err.error || 'Erro ao salvar lançamento manual do armazém');
    }
  }

  async function approveWarehouseConference(indicatorReviews, additionalValues, manualCorrections) {
    setPublishingImport(true);
    try {
      const result = await approveOnDemandArmazemImport(pendingImport.preview_token, indicatorReviews, additionalValues, manualCorrections);
      setPendingImport(null);
      setImportReport(null);
      await refresh();
      setMessage(result.message || 'Valores do On Demand publicados.');
    } catch (err) {
      setMessage(err.error || 'Erro ao publicar a conferência.');
    } finally {
      setPublishingImport(false);
    }
  }

  async function importOnDemand() {
    if (!onDemandFile) {
      setMessage('Selecione o relatório de produtividade do armazém.');
      return;
    }
    if (!importCompetencia) {
      setMessage('Selecione a competência do arquivo antes de iniciar a conferência.');
      return;
    }
    setImporting(true);
    setImportReport(null);
    try {
      const result = await importOnDemandArmazemFile(onDemandFile, operatorFile, importCompetencia);
      setImportReport(result.report || null);
      setPendingImport(result);
      setMessage(result.message || 'Arquivos lidos e cruzados. Confira antes de publicar.');
    } catch (err) {
      setMessage(err.error || 'Erro ao importar o arquivo On Demand.');
    } finally {
      setImporting(false);
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
    ['Revisar vínculo', summary.total_baixa_confianca, 'number']
  ];

  return (
    <>
      <div className="prod-actions">
        <label className="prod-competencia-action">
          Competência do arquivo
          <input type="month" value={importCompetencia} disabled={importing || publishingImport} onChange={(event) => setImportCompetencia(event.target.value)} required />
        </label>
        <label className={`prod-file-action ${importing ? 'disabled' : ''}`}>
          {onDemandFile ? `Arquivo principal: ${onDemandFile.name}` : 'Selecionar arquivo On Demand (.csv)'}
          <input type="file" accept=".csv,text/csv" disabled={importing} onChange={(event) => setOnDemandFile(event.target.files?.[0] || null)} />
        </label>
        <label className={`prod-file-action ${importing ? 'disabled' : ''}`}>
          {operatorFile ? `Atividades: ${operatorFile.name}` : 'Monitorar Tarefas — opcional (.csv)'}
          <input type="file" accept=".csv,text/csv" disabled={importing} onChange={(event) => setOperatorFile(event.target.files?.[0] || null)} />
        </label>
        <button type="button" disabled={importing || !onDemandFile || !importCompetencia} onClick={importOnDemand}>{importing ? 'Calculando RV...' : 'Conferir RV antes de publicar'}</button>
        <button type="button" onClick={() => { setDetail(null); setEditing(false); setCreating(true); }}>Novo lançamento manual</button>
        <button onClick={() => exportAdminProdutividadeArmazem(filters)}>Exportar relatório</button>
      </div>
      {message ? <div className="import-message">{message}</div> : null}
      {pendingImport ? <ImportConference data={pendingImport} variant="armazem" publishing={publishingImport} onApprove={approveWarehouseConference} onCancel={() => { setPendingImport(null); setImportReport(null); }} /> : null}
      {importReport && !pendingImport ? (
        <section className="ondemand-import-report">
          <h3>Relatório da importação On Demand — {importReport.competencia}</h3>
          <div>
            <span><strong>{importReport.criados || 0}</strong> novos valores</span>
            <span><strong>{importReport.atualizados || 0}</strong> atualizados</span>
            <span><strong>{importReport.ignorados || 0}</strong> ignorados</span>
            <span><strong>{importReport.cruzamentos?.length || 0}</strong> vínculos confirmados</span>
          </div>
          {importReport.nao_encontrados?.length ? <p><strong>Não publicados:</strong> {importReport.nao_encontrados.join(', ')}.</p> : null}
          {importReport.tarefas_sem_valor?.length ? <p><strong>Tarefas sem valor:</strong> {importReport.tarefas_sem_valor.join(', ')}.</p> : null}
        </section>
      ) : null}
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
            <button type="button" className="detail-action-button" onClick={() => setEditing(true)}>Editar lançamento</button>
          </div>
          {editing ? <ManualProdutividadeForm registro={detail} variant="armazem" onSubmit={saveManual} onCancel={() => setEditing(false)} /> : null}
          <ProdutividadeDetail registro={detail} variant="armazem" detailedTasks />
        </section>
      ) : (
        <>
      <section className="prod-summary-grid">
        {summaryCards.map(([label, value, type]) => <div key={label}><span>{label}</span><strong>{formatValue(value, type)}</strong></div>)}
      </section>
      <section className="prod-filters">
        <label>Buscar por nome, matrícula, CPF, competência, usuário On Demand ou código operacional<input value={filters.busca} onChange={(event) => setFilters({ ...filters, busca: event.target.value })} /></label>
        <label>Competência<select value={filters.competencia} onChange={(event) => setFilters({ ...filters, competencia: event.target.value })}><option value="">Todas</option>{options.competencia.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Função<select value={filters.funcao_armazem} onChange={(event) => setFilters({ ...filters, funcao_armazem: event.target.value })}><option value="">Todas</option><option value="Ajudante">Ajudante</option><option value="Operador de Empilhadeira">Operador de Empilhadeira</option><option value="Amarrador">Amarrador</option>{options.funcao_armazem.filter((option) => !['ajudante', 'operador de empilhadeira', 'amarrador'].includes(String(option).toLowerCase())).map((option) => <option key={option} value={option}>{formatArmazemFuncao(option)}</option>)}</select></label>
        <label>Status<select value={filters.status_produtividade} onChange={(event) => setFilters({ ...filters, status_produtividade: event.target.value })}><option value="">Todos</option>{options.status_produtividade.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Auditoria<select value={filters.status_auditoria} onChange={(event) => setFilters({ ...filters, status_auditoria: event.target.value })}><option value="">Todas</option>{options.status_auditoria.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Origem do cálculo<select value={filters.origem_calculo} onChange={(event) => setFilters({ ...filters, origem_calculo: event.target.value })}><option value="">Todas</option>{options.origem_calculo.map((option) => <option key={option} value={option}>{formatSourceLabel(option)}</option>)}</select></label>
      </section>
      {summary.total_baixa_confianca ? <div className="prod-warning">Existem {summary.total_baixa_confianca} registro(s) com baixa confiança de cruzamento para revisão.</div> : null}
      {loading ? <p>Carregando produtividade do armazém...</p> : null}
      {!loading && !rows.length ? <div className="empty-state">Nenhum dado de produtividade do armazém encontrado.</div> : null}
      {!loading && rows.length ? (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Matrícula</th><th>Nome</th><th>Função</th><th>Competência</th><th>Pontos</th><th>Faixa</th><th>RV antiga</th><th>RV nova</th><th>Erros</th><th>Valor previsto</th><th>Status</th><th>Auditoria</th><th>Ações</th></tr></thead>
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.allSettled([getAdminProdutividadeResumo(), getAdminProdutividadeArmazemResumo()])
      .then(([rotaResult, armazemResult]) => {
        const failed = [rotaResult, armazemResult].filter((result) => result.status === 'rejected');
        setSummary({
          rota: rotaResult.status === 'fulfilled' ? rotaResult.value : emptyRotaSummary,
          armazem: armazemResult.status === 'fulfilled' ? armazemResult.value : emptyArmazemSummary
        });
        if (failed.length === 2) {
          setLoadError('Não foi possível carregar o resumo. Atualize a página ou entre novamente.');
        } else if (failed.length === 1) {
          setLoadError('Uma parte do resumo não foi carregada. Atualize a página para tentar novamente.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="prod-summary-status">Carregando resumo de produtividade...</p>;
  }

  if (loadError && summary.rota === emptyRotaSummary && summary.armazem === emptyArmazemSummary) {
    return <div className="prod-warning">{loadError}</div>;
  }

  const cards = [
    [`Total Prêmio Rota${summary.rota.competencia_selecionada ? ` (${summary.rota.competencia_selecionada})` : ''}`, summary.rota.valor_total_previsto ?? summary.rota.valor_total_nova_rv, 'money'],
    ['Total RV Armazém', summary.armazem.valor_total_previsto, 'money'],
    ['Total Motoristas', summary.rota.total_motoristas, 'number'],
    ['Total Ajudantes de Motorista', summary.rota.total_ajudantes, 'number'],
    ['Total Ajudantes Armazém', summary.armazem.total_ajudantes, 'number'],
    ['Total Operadores de Empilhadeira', summary.armazem.total_operadores_empilhadeira, 'number'],
    ['Total Amarradores', summary.armazem.total_amarradores, 'number']
  ];

  return (
    <>
      {loadError ? <div className="prod-summary-status">{loadError}</div> : null}
      <section className="prod-summary-grid prod-admin-overview" aria-label="Resumo geral de produtividade">
        {cards.map(([label, value, type]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{formatValue(value, type)}</strong>
          </div>
        ))}
      </section>
    </>
  );
}

function AdminProdutividade() {
  const [activeTab, setActiveTab] = useState('rota');

  return (
    <div className="page-card produtividade-page">
      <div className="admin-heading">
        <div>
          <h1>{activeTab === 'armazem' ? 'Prêmio de Produtividade - Armazém' : 'Prêmio de Produtividade'}</h1>
          <p>{activeTab === 'armazem' ? 'Consulte, filtre, importe e exporte os dados oficiais de RV do Armazém.' : 'Consulte, filtre, importe e exporte os dados oficiais do Prêmio de Produtividade da Rota.'}</p>
        </div>
      </div>
      <AdminProdutividadeResumo />
      <ProdTabs activeTab={activeTab} onChange={setActiveTab} tabs={[{ id: 'rota', label: 'Rota' }, { id: 'armazem', label: 'Armazém' }]} />
      <div className="prod-warning">Caso não concorde com alguma informação, procure o seu supervisor.</div>
      {activeTab === 'rota' ? <AdminRotaPanel /> : <AdminArmazemPanel />}
    </div>
  );
}

export default function ProdutividadePage({ user }) {
  return isAdminUser(user) ? <AdminProdutividade /> : <ColaboradorProdutividade />;
}
