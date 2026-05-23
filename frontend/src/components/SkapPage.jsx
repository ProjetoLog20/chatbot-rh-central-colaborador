import { useEffect, useMemo, useState } from 'react';
import {
  getAdminSkap,
  getAdminSkapDetail,
  getMeuSkap,
  importSkapFile,
  updateAdminSkap
} from '../api.js';

const criteria = [
  ['atendimento', 'Atendimento'],
  ['cinco_s', '5S'],
  ['retorno_rota', 'Retorno de rota'],
  ['seguranca', 'Seguranca'],
  ['evolucao_atendimento', 'Evolucao atendimento'],
  ['evolucao_cinco_s', 'Evolucao 5S'],
  ['evolucao_retorno_rota', 'Evolucao retorno rota'],
  ['evolucao_seguranca', 'Evolucao seguranca'],
  ['empoderamento', 'Empoderamento'],
  ['longa_distancia', 'Longa distancia'],
  ['campeao_seguranca', 'Campeao de seguranca'],
  ['autonomia', 'Autonomia']
];

const levelOptions = ['', 'bronze', 'verde', 'ouro'];
const criterionOptions = ['pendente', 'em_evolucao', 'concluido'];

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '0%';
  return `${Number(value).toFixed(0)}%`;
}

function formatDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function SkapDetail({ detail, editable, onChange, onSave, saving }) {
  if (!detail) return null;

  return (
    <section className="skap-detail">
      <div className="skap-detail-header">
        <div>
          <h2>{detail.nome_completo}</h2>
          <p>{detail.matricula} • {detail.cargo || 'Cargo nao informado'} • {detail.setor || 'Setor nao informado'}</p>
        </div>
        <div className={`skap-level ${detail.nivel_skap || 'pendente'}`}>{detail.nivel_skap || 'Sem nivel'}</div>
      </div>

      <div className="skap-summary-grid">
        <div>
          <span>Progresso</span>
          <strong>{formatPercent(detail.progresso_percentual)}</strong>
        </div>
        <div>
          <span>Unidade</span>
          <strong>{detail.unidade || '-'}</strong>
        </div>
        <div>
          <span>Tipo</span>
          <strong>{detail.tipo_colaborador || '-'}</strong>
        </div>
        <div>
          <span>Ultima avaliacao</span>
          <strong>{formatDate(detail.data_avaliacao) || '-'}</strong>
        </div>
      </div>

      {editable ? (
        <div className="skap-edit-grid">
          <label>
            Nivel atual
            <select value={detail.nivel_skap || 'bronze'} onChange={(e) => onChange({ ...detail, nivel_skap: e.target.value })}>
              <option value="bronze">bronze</option>
              <option value="verde">verde</option>
              <option value="ouro">ouro</option>
            </select>
          </label>
          <label>
            Data da avaliacao
            <input type="date" value={formatDate(detail.data_avaliacao)} onChange={(e) => onChange({ ...detail, data_avaliacao: e.target.value })} />
          </label>
        </div>
      ) : null}

      <div className="criteria-grid">
        {criteria.map(([key, label]) => (
          <label className="criteria-item" key={key}>
            <span>{label}</span>
            {editable ? (
              <select value={detail[key] || 'pendente'} onChange={(e) => onChange({ ...detail, [key]: e.target.value })}>
                {criterionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <strong>{detail[key] || 'pendente'}</strong>
            )}
          </label>
        ))}
      </div>

      <label className="skap-observation">
        Observacao da lideranca
        {editable ? (
          <textarea rows="3" value={detail.observacao_lideranca || ''} onChange={(e) => onChange({ ...detail, observacao_lideranca: e.target.value })} />
        ) : (
          <p>{detail.observacao_lideranca || 'Sem observacao registrada.'}</p>
        )}
      </label>

      {editable ? <button className="skap-primary" onClick={onSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar avaliacao'}</button> : null}

      <div className="skap-history">
        <h3>Historico de evolucao</h3>
        {detail.historico?.length ? (
          detail.historico.map((item) => (
            <div className="history-row" key={item.id}>
              <strong>{item.nivel_anterior || 'inicio'} → {item.nivel_novo}</strong>
              <span>{item.motivo} • {item.criado_em}</span>
            </div>
          ))
        ) : (
          <p>Sem historico registrado.</p>
        )}
      </div>
    </section>
  );
}

export default function SkapPage({ user }) {
  const [filters, setFilters] = useState({ busca: '', nivel: '', setor: '', cargo: '', unidade: '', tipo_colaborador: '' });
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.perfil === 'admin';

  const filterOptions = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map((item) => item[key]).filter(Boolean))].sort();
    return {
      setor: uniq('setor'),
      cargo: uniq('cargo'),
      unidade: uniq('unidade'),
      tipo_colaborador: uniq('tipo_colaborador')
    };
  }, [rows]);

  useEffect(() => {
    if (isAdmin) {
      getAdminSkap(filters).then(setRows).catch((err) => setMessage(err.error || 'Erro ao carregar SKAP'));
    } else {
      getMeuSkap().then(setDetail).catch((err) => setMessage(err.error || 'Seu SKAP ainda nao foi encontrado.'));
    }
  }, [isAdmin, filters]);

  async function openDetail(colaboradorId) {
    try {
      setDetail(await getAdminSkapDetail(colaboradorId));
    } catch (err) {
      setMessage(err.error || 'Erro ao abrir detalhe');
    }
  }

  async function saveDetail() {
    setSaving(true);
    try {
      await updateAdminSkap(detail.id, detail);
      setMessage('Avaliacao SKAP salva.');
      await openDetail(detail.id);
      setRows(await getAdminSkap(filters));
    } catch (err) {
      setMessage(err.error || 'Erro ao salvar SKAP');
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(files) {
    if (!files.length) return;
    try {
      const result = await importSkapFile(files[0]);
      setMessage(`Importacao SKAP: ${result.created} novas, ${result.updated} atualizadas, ${result.ignored} ignoradas.`);
      setRows(await getAdminSkap(filters));
    } catch (err) {
      setMessage(err.error || 'Erro ao importar SKAP');
    }
  }

  function exportReport() {
    const header = ['matricula', 'nome_completo', 'cargo', 'setor', 'unidade', 'tipo_colaborador', 'nivel_skap', 'progresso_percentual', 'data_avaliacao'];
    const csv = [
      header.join(';'),
      ...rows.map((row) => header.map((key) => {
        const value = key === 'data_avaliacao' ? formatDate(row[key]) : row[key];
        return `"${String(value ?? '').replace(/"/g, '""')}"`;
      }).join(';'))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'relatorio_skap.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!isAdmin) {
    return (
      <div className="page-card skap-page">
        <div className="admin-heading">
          <div>
            <h1>Meu SKAP</h1>
            <p>Acompanhe seu nivel atual, progresso e criterios avaliados.</p>
          </div>
        </div>
        {message && <div className="import-message">{message}</div>}
        <SkapDetail detail={detail} editable={false} />
      </div>
    );
  }

  return (
    <div className="page-card skap-page">
      <div className="admin-heading">
        <div>
          <h1>Gestao SKAP</h1>
          <p>Consulte e acompanhe a evolucao dos colaboradores.</p>
        </div>
        <div className="skap-actions">
          <button onClick={exportReport}>Exportar relatorio</button>
          <label>
            Importar SKAP
            <input type="file" accept=".xlsx" onChange={(e) => handleImport(e.target.files)} />
          </label>
        </div>
      </div>

      {message && <div className="import-message">{message}</div>}

      <section className="skap-filters">
        <label>
          Buscar por nome ou matricula
          <input value={filters.busca} onChange={(e) => setFilters({ ...filters, busca: e.target.value })} />
        </label>
        <label>
          Nivel SKAP
          <select value={filters.nivel} onChange={(e) => setFilters({ ...filters, nivel: e.target.value })}>
            {levelOptions.map((option) => <option key={option} value={option}>{option || 'Todos'}</option>)}
          </select>
        </label>
        {['setor', 'cargo', 'unidade', 'tipo_colaborador'].map((key) => (
          <label key={key}>
            {key === 'tipo_colaborador' ? 'Tipo de colaborador' : key}
            <select value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}>
              <option value="">Todos</option>
              {filterOptions[key].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
      </section>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Matricula</th>
              <th>Nome</th>
              <th>Cargo</th>
              <th>Setor</th>
              <th>Nivel</th>
              <th>Progresso</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.matricula}</td>
                <td>{item.nome_completo}</td>
                <td>{item.cargo}</td>
                <td>{item.setor}</td>
                <td>{item.nivel_skap || '-'}</td>
                <td>{formatPercent(item.progresso_percentual)}</td>
                <td><button onClick={() => openDetail(item.id)}>Ver detalhes</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SkapDetail detail={detail} editable onChange={setDetail} onSave={saveDetail} saving={saving} />
    </div>
  );
}
