import { useEffect, useMemo, useState } from 'react';
import {
  exportAdminProntuarios,
  getAdminProntuarioDetail,
  getAdminProntuarios,
  getProntuarioMe,
  importProntuarioFile
} from '../api.js';

const colorLabels = {
  verde: 'Verde',
  amarelo: 'Amarela',
  vermelho: 'Vermelha',
  sem_faixa: 'Sem faixa'
};

const occurrenceFields = [
  ['quantidade_sonolencia', 'Sonolencia'],
  ['acidentes_fai', 'Acidentes FAI'],
  ['acidentes_lti', 'Acidentes LTI'],
  ['acidentes_mdi', 'Acidentes MDI'],
  ['acidentes_mti', 'Acidentes MTI'],
  ['capotamentos', 'Capotamentos'],
  ['colisoes', 'Colisoes'],
  ['tombamentos', 'Tombamentos']
];

const multaFields = [
  ['multa_leve', 'Leve'],
  ['multa_media', 'Media'],
  ['multa_grave', 'Grave'],
  ['multa_gravissima', 'Gravissima']
];

const telemetriaFields = [
  ['telemetria_excesso_velocidade_1', 'Velocidade 1'],
  ['telemetria_excesso_velocidade_2', 'Velocidade 2'],
  ['telemetria_excesso_velocidade_3', 'Velocidade 3'],
  ['telemetria_forca_g', 'Forca G'],
  ['telemetria_frenagem_brusca', 'Frenagem brusca']
];

const sancaoFields = [
  ['advertencias', 'Advertencias'],
  ['suspensoes', 'Suspensoes']
];

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('pt-BR') : value;
}

function formatDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

function isAdminUser(user) {
  return String(user?.perfil || '').trim().toLowerCase() === 'admin';
}

function FaixaBadge({ color }) {
  const normalized = color || 'sem_faixa';
  return <span className={`driver-badge ${normalized}`}>{colorLabels[normalized] || colorLabels.sem_faixa}</span>;
}

function MetricGroup({ title, fields, prontuario }) {
  return (
    <section className="driver-section">
      <h2>{title}</h2>
      <div className="driver-mini-grid">
        {fields.map(([key, label]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{formatNumber(prontuario?.[key] || 0)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProntuarioDetail({ prontuario }) {
  if (!prontuario) return null;

  return (
    <div className="driver-detail">
      <section className="driver-summary">
        <div>
          <span>Nome</span>
          <strong>{prontuario.nome_condutor || prontuario.nome_completo}</strong>
        </div>
        <div>
          <span>Matricula</span>
          <strong>{formatValue(prontuario.matricula)}</strong>
        </div>
        <div>
          <span>Cargo</span>
          <strong>{formatValue(prontuario.cargo)}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{formatValue(prontuario.status_prontuario)}</strong>
        </div>
        <div>
          <span>Pontuacao ponderada</span>
          <strong>{formatNumber(prontuario.pontuacao_ponderada)}</strong>
        </div>
        <div>
          <span>Faixa</span>
          <strong>{formatValue(prontuario.faixa)}</strong>
        </div>
        <div>
          <span>Cor da faixa</span>
          <FaixaBadge color={prontuario.cor_faixa} />
        </div>
        <div>
          <span>Pontuacao CNH</span>
          <strong>{formatNumber(prontuario.pontuacao_cnh)}</strong>
        </div>
        <div>
          <span>Vencimento CNH</span>
          <strong>{formatDate(prontuario.vencimento_cnh)}</strong>
        </div>
        <div>
          <span>Ultima importacao</span>
          <strong>{formatDate(prontuario.data_importacao)}</strong>
        </div>
      </section>

      <MetricGroup title="Principais ocorrencias" fields={occurrenceFields} prontuario={prontuario} />
      <MetricGroup title="Multas" fields={multaFields} prontuario={prontuario} />
      <MetricGroup title="Telemetria" fields={telemetriaFields} prontuario={prontuario} />
      <MetricGroup title="Sancoes" fields={sancaoFields} prontuario={prontuario} />
    </div>
  );
}

function AdminProntuarioPanel() {
  const [filters, setFilters] = useState({ busca: '', faixa: '', cor_faixa: '', status: '', cargo: '', operacao: '', atividade: '' });
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, colors: {}, faixas: {} });
  const [detail, setDetail] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const filterOptions = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map((item) => item[key]).filter(Boolean))].sort();
    return {
      faixa: uniq('faixa'),
      status: uniq('status_prontuario'),
      cargo: uniq('cargo'),
      operacao: uniq('operacao'),
      atividade: uniq('atividade')
    };
  }, [rows]);

  useEffect(() => {
    refresh();
  }, [filters]);

  async function refresh() {
    setLoading(true);
    setMessage('');
    console.warn('[Prontuario] perfil admin detectado; chamando /api/prontuario/admin');
    try {
      const result = await getAdminProntuarios(filters);
      setRows(result.rows || []);
      setSummary(result.summary || { total: 0, colors: {}, faixas: {} });
    } catch (err) {
      setMessage(err.error || 'Erro ao carregar prontuarios');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(colaboradorId) {
    try {
      setDetail(await getAdminProntuarioDetail(colaboradorId));
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } catch (err) {
      setMessage(err.error || 'Erro ao abrir prontuario');
    }
  }

  function closeDetail() {
    setDetail(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  async function handleImport(files) {
    if (!files.length) return;
    try {
      const result = await importProntuarioFile(files[0]);
      setMessage(`Importacao: ${result.created} novos, ${result.updated} atualizados, ${result.notFound} nao encontrados, ${result.conflicts} conflitos.`);
      await refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao importar prontuario');
    }
  }

  async function handleExport() {
    try {
      await exportAdminProntuarios(filters);
    } catch (err) {
      setMessage(err.error || 'Erro ao exportar prontuarios');
    }
  }

  return (
    <div className="driver-admin">
      <div className="driver-actions">
        <button onClick={handleExport}>Exportar relatorio</button>
        <label>
          Importar Prontuário
          <input type="file" accept=".xls,.xlsx" onChange={(e) => handleImport(e.target.files)} />
        </label>
      </div>

      {message ? <div className="import-message">{message}</div> : null}

      {detail ? (
        <section className="detail-view-panel">
          <div className="detail-view-toolbar">
            <button type="button" className="detail-back-button" onClick={closeDetail}>
              <span aria-hidden="true">&larr;</span> Retornar
            </button>
          </div>
          <ProntuarioDetail prontuario={detail} />
        </section>
      ) : (
        <>
          <section className="driver-stats">
            <div><span>Total</span><strong>{summary.total || 0}</strong></div>
            <div><span>Verde</span><strong>{summary.colors?.verde || 0}</strong></div>
            <div><span>Amarela</span><strong>{summary.colors?.amarelo || 0}</strong></div>
            <div><span>Vermelha</span><strong>{summary.colors?.vermelho || 0}</strong></div>
            <div><span>Sem faixa</span><strong>{summary.colors?.sem_faixa || 0}</strong></div>
          </section>

      <section className="driver-filters">
        <label>
          Buscar por nome, matrícula ou CPF
          <input value={filters.busca} onChange={(e) => setFilters({ ...filters, busca: e.target.value })} />
        </label>
        <label>
          Cor da faixa
          <select value={filters.cor_faixa} onChange={(e) => setFilters({ ...filters, cor_faixa: e.target.value })}>
            <option value="">Todas</option>
            <option value="verde">Verde</option>
            <option value="amarelo">Amarela</option>
            <option value="vermelho">Vermelha</option>
            <option value="sem_faixa">Sem faixa</option>
          </select>
        </label>
        {['faixa', 'status', 'cargo', 'operacao', 'atividade'].map((key) => (
          <label key={key}>
            {key === 'operacao' ? 'Operacao' : key}
            <select value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}>
              <option value="">Todos</option>
              {filterOptions[key].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
      </section>

      {loading ? <p>Carregando prontuários...</p> : null}
      {!loading && !rows.length ? (
        <div className="empty-state">Nenhum prontuário encontrado. Importe a planilha de prontuário para visualizar os dados.</div>
      ) : null}

      {!loading && rows.length > 0 ? <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Matricula</th>
              <th>Nome</th>
              <th>Cargo</th>
              <th>Status</th>
              <th>Pontuacao</th>
              <th>Faixa</th>
              <th>Cor</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.matricula}</td>
                <td>{item.nome_condutor || item.nome_completo}</td>
                <td>{item.cargo}</td>
                <td>{item.status_prontuario}</td>
                <td>{formatNumber(item.pontuacao_ponderada)}</td>
                <td>{item.faixa || '-'}</td>
                <td><FaixaBadge color={item.cor_faixa} /></td>
                <td><button className="detail-action-button" onClick={() => openDetail(item.colaborador_id)}>Ver detalhes</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div> : null}
        </>
      )}
    </div>
  );
}

export default function DriverPage({ user }) {
  const [prontuario, setProntuario] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const isAdmin = isAdminUser(user);

  useEffect(() => {
    if (isAdmin) {
      setLoading(false);
      return;
    }

    getProntuarioMe()
      .then(setProntuario)
      .catch((err) => setError(err.error || 'Voce ainda nao possui prontuario registrado.'))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (isAdmin) {
    return (
      <div className="page-card driver-page">
        <div className="admin-heading">
          <div>
            <h1>Gestão de Prontuários</h1>
            <p>Consulte, filtre, importe e exporte os prontuarios vinculados aos colaboradores.</p>
          </div>
        </div>
        <AdminProntuarioPanel />
      </div>
    );
  }

  if (loading) return <div className="page-card driver-page"><p>Carregando...</p></div>;

  return (
    <div className="page-card driver-page">
      <div className="admin-heading">
        <div>
          <h1>Prontuario de Distribuicao</h1>
          <p>Acompanhe sua faixa, pontuacao e ocorrencias registradas.</p>
        </div>
      </div>
      {error ? <div className="empty-state">{error}</div> : <ProntuarioDetail prontuario={prontuario} />}
    </div>
  );
}
