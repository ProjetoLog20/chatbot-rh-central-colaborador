import { useEffect, useMemo, useState } from 'react';
import {
  checkAdminSkapPercentuais,
  getAdminSkap,
  getAdminSkapDetail,
  getMeuSkap,
  importSkapFile,
  updateAdminSkap
} from '../api.js';

const levelOptions = ['', 'Bronze', 'Prata', 'Ouro'];
const emptyObservation = 'Nenhuma observação registrada para este item.';

const skills = [
  ['atingimento_habilidade_tecnica', 'observacao_habilidade_tecnica', 'Habilidade Técnica'],
  ['atingimento_habilidade_especifica', 'observacao_habilidade_especifica', 'Habilidade Específica'],
  ['atingimento_habilidade_empoderamento', 'observacao_habilidade_empoderamento', 'Habilidade de Empoderamento']
];

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatPercent(value, digits = 0) {
  return `${asNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function normalizePercentInput(value) {
  const number = asNumber(String(value).replace(',', '.'));
  return Math.max(0, Math.min(100, number));
}

function formatDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10).split('-').reverse().join('/');
}

function formatLevel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'ouro') return 'Ouro';
  if (normalized === 'prata') return 'Prata';
  return 'Bronze';
}

function levelMessage(detail) {
  const level = formatLevel(detail?.nivel_skap);
  if (level === 'Ouro') return 'Você já está no nível mais alto do SKAP.';
  return `Faltam ${formatPercent(detail?.percentual_para_proximo_nivel)} para alcançar o nível ${detail?.proximo_nivel || '-'}.`;
}

function isAdminUser(user) {
  return String(user?.perfil || '').trim().toLowerCase() === 'admin';
}

function ProgressBar({ value }) {
  const percent = Math.max(0, Math.min(100, asNumber(value)));
  return (
    <div className="skap-progress">
      <span style={{ width: `${percent}%` }} />
      <i style={{ left: `${percent}%` }} />
    </div>
  );
}

function SkillCard({ detail, skill }) {
  const [percentKey, observationKey, title] = skill;
  const percent = asNumber(detail?.[percentKey]);
  return (
    <article className="skap-skill-card">
      <div>
        <h3>{title}</h3>
        <strong>{formatPercent(percent)}</strong>
      </div>
      <ProgressBar value={percent} />
      <p>{detail?.[observationKey] || emptyObservation}</p>
    </article>
  );
}

function SkapDetail({ detail, showIdentity = true, editable = false, onChange, onSave, saving }) {
  if (!detail) return null;
  const level = formatLevel(detail.nivel_skap);

  return (
    <section className="skap-detail">
      <div className="skap-detail-header">
        <div>
          <h2>{showIdentity ? detail.nome_completo : `Você está no nível ${level}.`}</h2>
          <p>{showIdentity ? `${detail.matricula} • ${detail.cargo || 'Cargo não informado'} • ${detail.setor || 'Setor não informado'}` : levelMessage(detail)}</p>
        </div>
        <div className={`skap-level ${level.toLowerCase()}`}>{level}</div>
      </div>

      <div className="skap-summary-grid">
        <div><span>Nível atual</span><strong>{level}</strong></div>
        <div><span>Proficiência geral</span><strong>{formatPercent(detail.proficiencia, 2)}</strong></div>
        <div><span>Próximo nível</span><strong>{detail.proximo_nivel || 'Nível máximo'}</strong></div>
        <div><span>Falta para próximo nível</span><strong>{formatPercent(detail.percentual_para_proximo_nivel, 2)}</strong></div>
      </div>

      <section className="skap-progress-card">
        <div>
          <span>Bronze</span>
          <span>Prata 75%</span>
          <span>Ouro 90%</span>
        </div>
        <ProgressBar value={detail.proficiencia} />
        <strong>Proficiência atual: {formatPercent(detail.proficiencia, 2)}</strong>
      </section>

      {editable ? (
        <section className="skap-edit-grid">
          <label>
            Proficiência
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={detail.proficiencia || ''}
              onChange={(e) => onChange({ ...detail, proficiencia: e.target.value })}
            />
          </label>
          <label>
            Data da avaliação
            <input type="date" value={String(detail.data_avaliacao || '').slice(0, 10)} onChange={(e) => onChange({ ...detail, data_avaliacao: e.target.value })} />
          </label>
        </section>
      ) : null}

      <section className="skap-skills-grid" aria-label="Percentual por habilidade">
        {skills.map((skill) => <SkillCard key={skill[0]} detail={detail} skill={skill} />)}
      </section>

      <section className="skap-action-plan">
        <div className="section-title-row">
          <div>
            <h2>Observações da liderança e plano de ação</h2>
            <p>Confira os pontos indicados pela liderança para apoiar sua evolução no SKAP.</p>
          </div>
        </div>
        <div className="skap-skills-grid">
          {skills.map((skill) => <SkillCard key={`obs-${skill[0]}`} detail={detail} skill={skill} />)}
        </div>
      </section>

      {editable ? (
        <section className="skap-edit-grid">
          {skills.map(([percentKey, observationKey, title]) => (
            <div className="skap-correction-group" key={observationKey}>
              <label>
                Percentual - {title}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={detail[percentKey] ?? ''}
                  onChange={(e) => onChange({ ...detail, [percentKey]: e.target.value })}
                />
              </label>
              <label>
                Observação - {title}
                <textarea rows="3" value={detail[observationKey] || ''} onChange={(e) => onChange({ ...detail, [observationKey]: e.target.value })} />
              </label>
            </div>
          ))}
          <button className="skap-primary" onClick={onSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar avaliação'}</button>
        </section>
      ) : null}

      <div className="skap-footer-note">Em caso de dúvida sobre sua avaliação, procure sua liderança ou o RH.</div>

      {detail.historico ? (
        <div className="skap-history">
          <h3>Histórico de evolução</h3>
          {detail.historico.length ? detail.historico.map((item) => (
            <div className="history-row" key={item.id}>
              <strong>{item.nivel_anterior ? formatLevel(item.nivel_anterior) : 'Início'} → {formatLevel(item.nivel_novo)}</strong>
              <span>{item.motivo} • {formatDate(item.criado_em)}</span>
            </div>
          )) : <p>Sem histórico registrado.</p>}
        </div>
      ) : null}
    </section>
  );
}

function buildSummary(rows) {
  const total = rows.length || 0;
  const avg = (key) => total ? rows.reduce((sum, item) => sum + asNumber(item[key]), 0) / total : 0;
  return {
    total,
    bronze: rows.filter((item) => formatLevel(item.nivel_skap) === 'Bronze').length,
    prata: rows.filter((item) => formatLevel(item.nivel_skap) === 'Prata').length,
    ouro: rows.filter((item) => formatLevel(item.nivel_skap) === 'Ouro').length,
    proficiencia: avg('proficiencia'),
    tecnica: avg('atingimento_habilidade_tecnica'),
    especifica: avg('atingimento_habilidade_especifica'),
    empoderamento: avg('atingimento_habilidade_empoderamento')
  };
}

export default function SkapPage({ user }) {
  const [filters, setFilters] = useState({ busca: '', nivel: '', setor: '', cargo: '', unidade: '', tipo_colaborador: '' });
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [message, setMessage] = useState('');
  const [percentCheck, setPercentCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isAdmin = isAdminUser(user);

  const filterOptions = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map((item) => item[key]).filter(Boolean))].sort();
    return {
      setor: uniq('setor'),
      cargo: uniq('cargo'),
      unidade: uniq('unidade'),
      tipo_colaborador: uniq('tipo_colaborador')
    };
  }, [rows]);

  const summary = useMemo(() => buildSummary(rows), [rows]);

  useEffect(() => {
    setLoading(true);
    setMessage('');
    if (isAdmin) {
      getAdminSkap(filters)
        .then((data) => setRows(Array.isArray(data) ? data : []))
        .catch((err) => setMessage(err.error || 'Erro ao carregar SKAP'))
        .finally(() => setLoading(false));
      return;
    }

    getMeuSkap()
      .then(setDetail)
      .catch((err) => setMessage(err.error || 'Você ainda não possui avaliação SKAP registrada.'))
      .finally(() => setLoading(false));
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
      const payload = {
        ...detail,
        proficiencia: normalizePercentInput(detail.proficiencia),
        atingimento_habilidade_tecnica: normalizePercentInput(detail.atingimento_habilidade_tecnica),
        atingimento_habilidade_especifica: normalizePercentInput(detail.atingimento_habilidade_especifica),
        atingimento_habilidade_empoderamento: normalizePercentInput(detail.atingimento_habilidade_empoderamento)
      };
      await updateAdminSkap(detail.colaborador_id, payload);
      setMessage('Avaliação SKAP salva.');
      await openDetail(detail.colaborador_id);
      setRows(await getAdminSkap(filters));
    } catch (err) {
      setMessage(err.error || 'Erro ao salvar SKAP');
    } finally {
      setSaving(false);
    }
  }

  async function checkPercentuais() {
    try {
      const result = await checkAdminSkapPercentuais();
      setPercentCheck(result);
      setMessage(result.total_problemas
        ? `Check SKAP: ${result.total_problemas} problema(s) encontrado(s).`
        : `Check SKAP: ${result.total_avaliacoes} avaliações revisadas, nenhum problema encontrado.`);
    } catch (err) {
      setMessage(err.error || 'Erro ao checar percentuais SKAP');
    }
  }

  async function handleImport(files) {
    if (!files.length) return;
    try {
      const result = await importSkapFile(files[0]);
      setMessage(`Importação SKAP: ${result.created} novas, ${result.updated} atualizadas, ${result.ignored} ignoradas.`);
      setRows(await getAdminSkap(filters));
    } catch (err) {
      setMessage(err.error || 'Erro ao importar SKAP');
    }
  }

  function exportReport() {
    const header = [
      'matricula',
      'nome_completo',
      'cargo',
      'setor',
      'unidade',
      'tipo_colaborador',
      'proficiencia',
      'nivel_skap',
      'proximo_nivel',
      'percentual_para_proximo_nivel',
      'atingimento_habilidade_tecnica',
      'atingimento_habilidade_especifica',
      'atingimento_habilidade_empoderamento',
      'updated_at'
    ];
    const csv = [
      header.join(';'),
      ...rows.map((row) => header.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(';'))
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
            <p>Acompanhe sua evolução, nível atual e pontos indicados pela liderança.</p>
          </div>
        </div>
        {message ? <div className="empty-state">{message}</div> : null}
        {loading ? <p>Carregando SKAP...</p> : <SkapDetail detail={detail} showIdentity={false} />}
      </div>
    );
  }

  return (
    <div className="page-card skap-page">
      <div className="admin-heading">
        <div>
          <h1>Gestão SKAP</h1>
          <p>Consulte, acompanhe e analise a evolução SKAP dos colaboradores.</p>
        </div>
        <div className="skap-actions">
          <button type="button" onClick={checkPercentuais}>Checar percentuais</button>
          <button type="button" onClick={exportReport}>Exportar relatório</button>
          <label>
            Importar SKAP
            <input type="file" accept=".xlsx" onChange={(e) => handleImport(e.target.files)} />
          </label>
        </div>
      </div>

      {message ? <div className="import-message">{message}</div> : null}

      {percentCheck?.total_problemas ? (
        <section className="skap-check-panel">
          <h2>Problemas encontrados nos percentuais</h2>
          {percentCheck.problemas.slice(0, 12).map((item, index) => (
            <p key={`${item.colaborador_id}-${item.campo}-${index}`}>
              <strong>{item.nome_completo} ({item.matricula})</strong>: {item.campo} = {item.valor} - {item.problema}
            </p>
          ))}
        </section>
      ) : null}

      <section className="skap-summary-grid">
        <div><span>Total de avaliados</span><strong>{summary.total}</strong></div>
        <div><span>Total Bronze</span><strong>{summary.bronze}</strong></div>
        <div><span>Total Prata</span><strong>{summary.prata}</strong></div>
        <div><span>Total Ouro</span><strong>{summary.ouro}</strong></div>
        <div><span>Média proficiência geral</span><strong>{formatPercent(summary.proficiencia, 2)}</strong></div>
        <div><span>Média habilidade técnica</span><strong>{formatPercent(summary.tecnica, 2)}</strong></div>
        <div><span>Média habilidade específica</span><strong>{formatPercent(summary.especifica, 2)}</strong></div>
        <div><span>Média empoderamento</span><strong>{formatPercent(summary.empoderamento, 2)}</strong></div>
      </section>

      <section className="skap-filters">
        <label>Buscar por nome ou matrícula<input value={filters.busca} onChange={(e) => setFilters({ ...filters, busca: e.target.value })} /></label>
        <label>Nível SKAP<select value={filters.nivel} onChange={(e) => setFilters({ ...filters, nivel: e.target.value })}>{levelOptions.map((option) => <option key={option} value={option}>{option || 'Todos'}</option>)}</select></label>
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

      {loading ? <p>Carregando SKAP...</p> : null}
      {!loading && !rows.length ? <div className="empty-state">Nenhuma avaliação SKAP encontrada.</div> : null}

      {!loading && rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nome</th><th>Matrícula</th><th>Cargo</th><th>Setor</th><th>Proficiência</th><th>Nível atual</th><th>Próximo nível</th><th>Falta</th><th>Técnica</th><th>Específica</th><th>Empoderamento</th><th>Atualização</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.colaborador_id}>
                  <td>{item.nome_completo}</td>
                  <td>{item.matricula}</td>
                  <td>{item.cargo || '-'}</td>
                  <td>{item.setor || '-'}</td>
                  <td>{formatPercent(item.proficiencia, 2)}</td>
                  <td><span className={`skap-level ${formatLevel(item.nivel_skap).toLowerCase()}`}>{formatLevel(item.nivel_skap)}</span></td>
                  <td>{item.proximo_nivel || '-'}</td>
                  <td>{formatPercent(item.percentual_para_proximo_nivel, 2)}</td>
                  <td>{formatPercent(item.atingimento_habilidade_tecnica)}</td>
                  <td>{formatPercent(item.atingimento_habilidade_especifica)}</td>
                  <td>{formatPercent(item.atingimento_habilidade_empoderamento)}</td>
                  <td>{formatDate(item.updated_at || item.data_avaliacao)}</td>
                  <td><button onClick={() => openDetail(item.colaborador_id)}>Ver detalhes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <SkapDetail detail={detail} editable onChange={setDetail} onSave={saveDetail} saving={saving} />
    </div>
  );
}
