import { useEffect, useMemo, useState } from 'react';
import {
  exportAdminProdutividade,
  getAdminProdutividade,
  getAdminProdutividadeDetail,
  getAdminProdutividadeResumo,
  getMeuProdutividade,
  importProdutividadeFile
} from '../api.js';

const metricFields = [
  ['valor_total_previsto', 'Valor previsto do premio', 'money'],
  ['entregas', 'Entregas', 'number'],
  ['caixas', 'Caixas', 'number'],
  ['percentual_devolucao', 'Devolucao', 'percent'],
  ['recargas', 'Recargas', 'number'],
  ['bonus', 'Bonus', 'money']
];

const detailFields = [
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
  ['antiga_rv', 'Antiga RV', 'money'],
  ['nova_rv', 'Nova RV', 'money'],
  ['diferenca_rv', 'Diferenca RV', 'money'],
  ['valor_total_previsto', 'Valor total previsto', 'money'],
  ['status_produtividade', 'Status produtividade'],
  ['status_auditoria', 'Auditoria', 'auditoria'],
  ['metodo_cruzamento', 'Metodo cruzamento'],
  ['confianca_cruzamento', 'Confianca cruzamento', 'percent'],
  ['mensagem_rh', 'Mensagem RH']
];

const emptySummary = {
  total_colaboradores: 0,
  total_motoristas: 0,
  total_ajudantes: 0,
  valor_total_nova_rv: 0,
  valor_total_antiga_rv: 0,
  diferenca_total: 0,
  total_bateu_devolucao: 0,
  total_nao_bateu_devolucao: 0,
  total_recargas: 0,
  total_mapas: 0,
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

function StatusBadge({ type, value }) {
  if (type === 'devolucao') {
    return (
      <span className={`prod-badge ${value ? 'success' : 'danger'}`}>
        {value ? 'Dentro da meta' : 'Fora da meta'}
      </span>
    );
  }

  if (type === 'auditoria') {
    const revisar = String(value || '').toLowerCase() === 'revisar_cruzamento';
    return (
      <span className={`prod-badge ${revisar ? 'warning' : 'success'}`}>
        {revisar ? 'Revisar vinculo' : 'OK'}
      </span>
    );
  }

  const normalized = String(value || '').trim().toLowerCase();
  const className = normalized ? 'success' : 'muted';
  return <span className={`prod-badge ${className}`}>{value || 'Sem dados'}</span>;
}

function ProdutividadeMaintenance({ message }) {
  return (
    <div className="page-card maintenance-page">
      <span className="maintenance-modal-icon" aria-hidden="true">!</span>
      <h1>Prêmio de Produtividade em manutenção</h1>
      <p>{message || 'Estamos ajustando os dados deste painel para garantir que as informações sejam apresentadas corretamente. Em breve ele estará disponível.'}</p>
      <a className="maintenance-back-link" href="/">Voltar para a Central</a>
    </div>
  );
}

function ProdutividadeDetail({ registro }) {
  if (!registro) return null;

  return (
    <section className="prod-detail">
      <div className="prod-detail-heading">
        <div>
          <h2>{registro.nome_completo}</h2>
          <p>{registro.matricula} - {registro.funcao_rv || 'Funcao nao informada'}</p>
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
            ) : (
              <strong>{formatValue(registro[key], type)}</strong>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ColaboradorProdutividade() {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [maintenance, setMaintenance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMeuProdutividade()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRows(list);
        setSelectedId(list[0]?.id ? String(list[0].id) : '');
      })
      .catch((err) => {
        if (err.code === 'MODULO_EM_MANUTENCAO') {
          setMaintenance(err.modulo);
          return;
        }
        setMessage(err.error || 'Voce ainda nao possui dados de Premio de Produtividade para este periodo.');
      })
      .finally(() => setLoading(false));
  }, []);

  const selected = rows.find((row) => String(row.id) === selectedId) || rows[0];
  const consolidated = rows.reduce((acc, row) => {
    acc.valor_total_previsto += asNumber(row.valor_total_previsto);
    acc.entregas += asNumber(row.entregas);
    acc.caixas += asNumber(row.caixas);
    acc.recargas += asNumber(row.recargas);
    acc.bonus += asNumber(row.bonus);
    return acc;
  }, { valor_total_previsto: 0, entregas: 0, caixas: 0, recargas: 0, bonus: 0 });

  if (maintenance) {
    return <ProdutividadeMaintenance message={maintenance.mensagem_manutencao} />;
  }

  return (
    <div className="page-card produtividade-page">
      <div className="admin-heading">
        <div>
          <h1>Meu Premio de Produtividade</h1>
          <p>Seu premio e calculado com base nos indicadores importados da apuracao oficial de RV.</p>
        </div>
      </div>

      <div className="prod-warning">Caso nao concorde ou nao entenda alguma informacao, procure o RH.</div>

      {loading ? <p>Carregando produtividade...</p> : null}
      {!loading && message ? <div className="empty-state">{message}</div> : null}

      {!loading && rows.length ? (
        <>
          {rows.length > 1 ? (
            <>
              <section className="prod-summary-grid">
                <div><span>Total previsto</span><strong>{formatMoney(consolidated.valor_total_previsto)}</strong></div>
                <div><span>Entregas</span><strong>{formatNumber(consolidated.entregas)}</strong></div>
                <div><span>Caixas</span><strong>{formatNumber(consolidated.caixas)}</strong></div>
                <div><span>Recargas</span><strong>{formatNumber(consolidated.recargas)}</strong></div>
                <div><span>Bonus</span><strong>{formatMoney(consolidated.bonus)}</strong></div>
              </section>
              <label className="prod-selector">
                Competencia / funcao
                <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>{row.competencia} - {row.funcao_rv}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <ProdutividadeDetail registro={selected} />
        </>
      ) : null}
    </div>
  );
}

function AdminProdutividade() {
  const [filters, setFilters] = useState({
    busca: '',
    competencia: '',
    funcao_rv: '',
    status_produtividade: '',
    bateu_devolucao: '',
    status_auditoria: ''
  });
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [detail, setDetail] = useState(null);
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
      setSummary(resumoResult || listResult.summary || emptySummary);
    } catch (err) {
      setMessage(err.error || 'Erro ao carregar produtividade');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(colaboradorId) {
    try {
      const result = await getAdminProdutividadeDetail(colaboradorId);
      setDetail(result.registros?.[0] || result.colaborador || null);
    } catch (err) {
      setMessage(err.error || 'Erro ao abrir detalhe');
    }
  }

  async function handleImport(files) {
    if (!files.length) return;
    try {
      const result = await importProdutividadeFile(files[0]);
      setMessage(`Importacao RV: ${result.created} novos, ${result.updated} atualizados, ${result.ignored} ignorados, ${result.errors.length} erros.`);
      await refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao importar RV');
    }
  }

  async function handleExport() {
    try {
      await exportAdminProdutividade(filters);
    } catch (err) {
      setMessage(err.error || 'Erro ao exportar relatorio');
    }
  }

  const summaryCards = [
    ['Colaboradores com RV', summary.total_colaboradores, 'number'],
    ['Motoristas', summary.total_motoristas, 'number'],
    ['Ajudantes', summary.total_ajudantes, 'number'],
    ['Nova RV', summary.valor_total_nova_rv, 'money'],
    ['Antiga RV', summary.valor_total_antiga_rv, 'money'],
    ['Diferenca total', summary.diferenca_total, 'money'],
    ['Dentro da meta', summary.total_bateu_devolucao, 'number'],
    ['Fora da meta', summary.total_nao_bateu_devolucao, 'number'],
    ['Recargas', summary.total_recargas, 'number'],
    ['Mapas', summary.total_mapas, 'number'],
    ['Revisar vinculo', summary.total_baixa_confianca, 'number']
  ];

  return (
    <div className="page-card produtividade-page">
      <div className="admin-heading">
        <div>
          <h1>Painel de Produtividade</h1>
          <p>Consulte, filtre, importe e exporte os dados oficiais de RV.</p>
        </div>
        <div className="prod-actions">
          <button onClick={handleExport}>Exportar relatorio</button>
          <label>
            Importar RV
            <input type="file" accept=".xlsx" onChange={(event) => handleImport(event.target.files)} />
          </label>
        </div>
      </div>

      {message ? <div className="import-message">{message}</div> : null}

      <section className="prod-summary-grid">
        {summaryCards.map(([label, value, type]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{formatValue(value, type)}</strong>
          </div>
        ))}
      </section>

      <section className="prod-filters">
        <label>
          Buscar por nome, matricula, CPF, nome RV ou codigo RV
          <input value={filters.busca} onChange={(event) => setFilters({ ...filters, busca: event.target.value })} />
        </label>
        <label>
          Competencia
          <select value={filters.competencia} onChange={(event) => setFilters({ ...filters, competencia: event.target.value })}>
            <option value="">Todas</option>
            {options.competencia.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Funcao
          <select value={filters.funcao_rv} onChange={(event) => setFilters({ ...filters, funcao_rv: event.target.value })}>
            <option value="">Todas</option>
            <option value="motorista">Motorista</option>
            <option value="ajudante">Ajudante</option>
            {options.funcao_rv.filter((option) => !['motorista', 'ajudante'].includes(String(option).toLowerCase())).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status_produtividade} onChange={(event) => setFilters({ ...filters, status_produtividade: event.target.value })}>
            <option value="">Todos</option>
            {options.status_produtividade.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Devolucao
          <select value={filters.bateu_devolucao} onChange={(event) => setFilters({ ...filters, bateu_devolucao: event.target.value })}>
            <option value="">Todas</option>
            <option value="true">Dentro da meta</option>
            <option value="false">Fora da meta</option>
          </select>
        </label>
        <label>
          Auditoria
          <select value={filters.status_auditoria} onChange={(event) => setFilters({ ...filters, status_auditoria: event.target.value })}>
            <option value="">Todas</option>
            {options.status_auditoria.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </section>

      {summary.total_baixa_confianca ? (
        <div className="prod-warning">Existem {summary.total_baixa_confianca} registro(s) com baixa confianca de cruzamento para revisao.</div>
      ) : null}

      {loading ? <p>Carregando produtividade...</p> : null}
      {!loading && !rows.length ? <div className="empty-state">Nenhum dado de produtividade encontrado.</div> : null}

      {!loading && rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Matricula</th>
                <th>Nome</th>
                <th>CPF</th>
                <th>Competencia</th>
                <th>Funcao</th>
                <th>Caixas</th>
                <th>Entregas</th>
                <th>Devolucao</th>
                <th>Status devolucao</th>
                <th>Recargas</th>
                <th>Mapas</th>
                <th>RV antiga</th>
                <th>Nova RV</th>
                <th>Diferenca</th>
                <th>Status</th>
                <th>Auditoria</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.matricula}</td>
                  <td>{row.nome_completo}</td>
                  <td>{row.cpf}</td>
                  <td>{row.competencia}</td>
                  <td>{row.funcao_rv}</td>
                  <td>{formatNumber(row.caixas)}</td>
                  <td>{formatNumber(row.entregas)}</td>
                  <td>{formatPercent(row.percentual_devolucao)}</td>
                  <td><StatusBadge type="devolucao" value={row.bateu_devolucao} /></td>
                  <td>{formatNumber(row.recargas)}</td>
                  <td>{formatNumber(row.mapas)}</td>
                  <td>{formatMoney(row.antiga_rv)}</td>
                  <td>{formatMoney(row.nova_rv)}</td>
                  <td>{formatMoney(row.diferenca_rv)}</td>
                  <td><StatusBadge type="status" value={row.status_produtividade} /></td>
                  <td><StatusBadge type="auditoria" value={row.status_auditoria} /></td>
                  <td><button onClick={() => openDetail(row.colaborador_id)}>Ver detalhes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ProdutividadeDetail registro={detail} />
    </div>
  );
}

export default function ProdutividadePage({ user }) {
  return isAdminUser(user) ? <AdminProdutividade /> : <ColaboradorProdutividade />;
}
