import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminRotogramaResumo, getRotogramaDetail, getRotogramaOpcoes, getRotogramas, importRotogramaFile } from '../api.js';

const filtersInitialState = {
  origem: '',
  destino: '',
  classificacao: ''
};

function normalizePerfil(perfil) {
  return String(perfil || '').trim().toLowerCase();
}

function riskClass(value) {
  const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (text === 'atencao') return 'atencao';
  if (text === 'ok') return 'ok';
  return 'sem';
}

function getErrorMessage(error) {
  if (error?.code === 'MODULO_EM_MANUTENCAO') {
    return error.modulo?.mensagem_manutencao || 'Rotograma Seguro em manutencao.';
  }
  return error?.error || 'Nao foi possivel carregar os rotogramas.';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function RotogramaCard({ item, onSelect }) {
  const classification = item.classificacao_rota || item.nivel_risco || 'OK';

  return (
    <article className="rotograma-card">
      <div className="rotograma-card-top">
        <span className="rotograma-road-icon" aria-hidden="true">🛣️</span>
        <span className={`risk-badge ${riskClass(classification)}`}>{classification}</span>
      </div>
      <h2>{item.nome}</h2>
      <dl>
        <div>
          <dt>Origem</dt>
          <dd>{item.origem || 'Nao informado'}</dd>
        </div>
        <div>
          <dt>Destino</dt>
          <dd>{item.destino || item.cidade || 'Nao informado'}</dd>
        </div>
        <div>
          <dt>Pontos de risco</dt>
          <dd>{item.pontos_risco_count || 0}</dd>
        </div>
      </dl>
      <div className="rotograma-card-footer">
        <span>{classification}</span>
        <button type="button" onClick={() => onSelect(item.id)}>Ver detalhes</button>
      </div>
    </article>
  );
}

function RiskPointCard({ point }) {
  return (
    <article className={`risk-point-card ${riskClass(point.nivel_risco)}`}>
      <div>
        <span className={`risk-badge ${riskClass(point.nivel_risco)}`}>{point.nivel_risco || 'Ponto'}</span>
        <h4>{point.descricao || point.tipo_ponto || 'Ponto de risco'}</h4>
        <p>{point.orientacao || 'Orientacao nao informada.'}</p>
      </div>
      <dl>
        <div>
          <dt>Tipo</dt>
          <dd>{point.tipo_ponto || '-'}</dd>
        </div>
        <div>
          <dt>Rodovia/Endereco</dt>
          <dd>{point.rodovia_endereco || '-'}</dd>
        </div>
        <div>
          <dt>Velocidade segura</dt>
          <dd>{point.velocidade_segura || '-'}</dd>
        </div>
      </dl>
      {point.maps_url ? <a href={point.maps_url} target="_blank" rel="noreferrer">Abrir no Maps</a> : null}
    </article>
  );
}

function DetailSection({ title, children }) {
  return (
    <details className="rotograma-detail-section" open>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

function AdminResumo({ resumo }) {
  if (!resumo) return null;

  return (
    <div className="rotograma-admin-summary">
      <span><b>{resumo.total_rotas}</b> rotas importadas</span>
      <span><b>{resumo.total_atencao}</b> ATENCAO</span>
      <span><b>{resumo.total_ok}</b> OK</span>
      <span><b>{resumo.rotas_ignoradas}</b> ignoradas</span>
      <span><b>{resumo.abas_ignoradas?.length || 0}</b> abas ignoradas</span>
      <span><b>{formatDateTime(resumo.ultima_importacao)}</b> ultima importacao</span>
    </div>
  );
}

function RotogramaDetail({ detail, onClose }) {
  if (!detail) return null;
  const { resumo, pontos = [], telefones = [], checklist = [] } = detail;

  return (
    <section className="rotograma-detail-panel" aria-label="Detalhes do rotograma">
      <div className="rotograma-detail-header">
        <div>
          <span>Detalhe do rotograma</span>
          <h2>{resumo.nome}</h2>
          <p>{resumo.origem || 'Origem nao informada'} → {resumo.destino || resumo.cidade || 'Destino nao informado'}</p>
        </div>
        <button type="button" onClick={onClose}>Fechar</button>
      </div>

      <DetailSection title="Resumo da rota">
        <div className="rotograma-summary-grid">
          {[
            ['Origem', resumo.origem],
            ['Destino', resumo.destino],
            ['Cidade', resumo.cidade],
            ['Classificacao', resumo.classificacao_rota || resumo.nivel_risco],
            ['Ultima atualizacao', resumo.data_atualizacao]
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value || 'Nao informado'}</strong>
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title={`Pontos de risco (${pontos.length})`}>
        <div className="risk-point-grid">
          {pontos.length ? pontos.map((point) => <RiskPointCard point={point} key={point.id} />) : <p>Nenhum ponto de risco importado para esta rota.</p>}
        </div>
      </DetailSection>

      <DetailSection title="Telefones de emergencia">
        <div className="emergency-phone-grid">
          {telefones.map((phone) => (
            <article key={`${phone.orgao}-${phone.telefone}`}>
              <span>{phone.orgao}</span>
              <strong>{phone.telefone}</strong>
              {phone.descricao ? <p>{phone.descricao}</p> : null}
            </article>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Checklist antes da rota">
        <ul className="safety-checklist">
          {checklist.map((item) => <li key={item.id}>{item.item}</li>)}
        </ul>
      </DetailSection>
    </section>
  );
}

export default function RotogramaSeguroPage({ user }) {
  const [filters, setFilters] = useState(filtersInitialState);
  const [rotogramas, setRotogramas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [adminResumo, setAdminResumo] = useState(null);
  const [opcoes, setOpcoes] = useState({ origens: [], destinos: [] });
  const isAdmin = normalizePerfil(user?.perfil) === 'admin';

  const activeFilters = useMemo(() => filters, [filters]);

  useEffect(() => {
    getRotogramaOpcoes()
      .then(setOpcoes)
      .catch(() => setOpcoes({ origens: [], destinos: [] }));
  }, []);

  useEffect(() => {
    setLoading(true);
    getRotogramas(activeFilters)
      .then((rows) => {
        setRotogramas(rows);
        setMessage('');
      })
      .catch((error) => {
        setRotogramas([]);
        setMessage(getErrorMessage(error));
      })
      .finally(() => setLoading(false));
  }, [activeFilters]);

  useEffect(() => {
    if (!isAdmin) return;
    getAdminRotogramaResumo()
      .then(setAdminResumo)
      .catch(() => setAdminResumo(null));
  }, [isAdmin, importStatus]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function openDetail(id) {
    setDetailLoading(true);
    getRotogramaDetail(id)
      .then(setSelected)
      .catch((error) => setMessage(getErrorMessage(error)))
      .finally(() => setDetailLoading(false));
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportStatus('Importando planilha...');
    try {
      const result = await importRotogramaFile(file);
      setImportStatus(`Importacao concluida: ${result.rotogramas_importados} rotogramas, ${result.total_atencao || 0} ATENCAO e ${result.total_ok || 0} OK.`);
      const nextOpcoes = await getRotogramaOpcoes();
      setOpcoes(nextOpcoes);
      const rows = await getRotogramas(activeFilters);
      setRotogramas(rows);
    } catch (error) {
      setImportStatus(getErrorMessage(error));
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className="rotograma-page">
      <section className="rotograma-hero">
        <div>
          <span>Antes de iniciar a rota, confira os pontos de atencao e siga as orientacoes de seguranca.</span>
          <h1>Rotograma Seguro</h1>
          <p>Consulte rotas OK e rotas em atencao para uma operacao mais segura.</p>
        </div>
        <Link to="/">Voltar para a Central</Link>
      </section>

      <section className="speed-alert-card" aria-label="Limite de velocidade permitido">
        <div className="speed-alert-header">
          <span className="speed-alert-icon" aria-hidden="true">⚠️</span>
          <div>
            <h2>Limite de velocidade permitido</h2>
            <p>Respeite os limites da via, as condições climáticas e as orientações de segurança da operação.</p>
          </div>
        </div>

        <div className="speed-alert-grid">
          <div className="speed-alert-item dry">
            <span>Pista seca</span>
            <strong>80 km/h</strong>
          </div>
          <div className="speed-alert-item wet">
            <span>Pista molhada</span>
            <strong>64 km/h</strong>
          </div>
        </div>
      </section>

      <section className="rotograma-toolbar" aria-label="Busca e filtros de rotogramas">
        <div className="rotograma-route-selects">
          <label>
            Cidade de partida
            <select value={filters.origem} onChange={(event) => updateFilter('origem', event.target.value)}>
              <option value="">Todas as partidas</option>
              {opcoes.origens.map((origem) => <option value={origem} key={origem}>{origem}</option>)}
            </select>
          </label>

          <label>
            Cidade de destino
            <select value={filters.destino} onChange={(event) => updateFilter('destino', event.target.value)}>
              <option value="">Todos os destinos</option>
              {opcoes.destinos.map((destino) => <option value={destino} key={destino}>{destino}</option>)}
            </select>
          </label>
        </div>

        <div className="rotograma-classification-filter" aria-label="Filtro por classificacao">
          {[
            ['', 'Todas'],
            ['ATENCAO', 'ATENCAO'],
            ['OK', 'OK']
          ].map(([value, label]) => (
            <button
              type="button"
              className={filters.classificacao === value ? 'active' : ''}
              key={value || 'todas'}
              onClick={() => updateFilter('classificacao', value)}
            >
              {label}
            </button>
          ))}
        </div>

        {isAdmin ? (
          <div className="rotograma-admin-box">
            <strong>Gerenciar Rotogramas</strong>
            <AdminResumo resumo={adminResumo} />
            <label>
              Importar nova planilha
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} />
            </label>
            {importStatus ? <p>{importStatus}</p> : <p>Use a importacao para atualizar rotas OK e rotas em atencao.</p>}
          </div>
        ) : null}
      </section>

      {message ? <section className="rotograma-message">{message}</section> : null}
      {loading ? <section className="rotograma-message">Carregando rotogramas...</section> : null}

      <section className="rotograma-grid" aria-label="Cards de rotogramas">
        {!loading && rotogramas.map((item) => <RotogramaCard item={item} key={item.id} onSelect={openDetail} />)}
      </section>

      {!loading && !rotogramas.length && !message ? (
        <section className="rotograma-message">Nenhum rotograma encontrado com os filtros selecionados.</section>
      ) : null}

      {detailLoading ? <section className="rotograma-message">Carregando detalhes...</section> : null}
      <RotogramaDetail detail={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
