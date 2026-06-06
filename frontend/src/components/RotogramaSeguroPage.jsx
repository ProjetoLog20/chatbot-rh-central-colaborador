import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRotogramaDetail, getRotogramas, importRotogramaFile } from '../api.js';

const riskLabels = {
  Alto: 'alto',
  Critico: 'alto',
  Crítico: 'alto',
  Moderado: 'medio',
  Medio: 'medio',
  Médio: 'medio',
  Baixo: 'baixo',
  'Sem classificacao': 'sem'
};

const filtersInitialState = {
  busca: '',
  cidade: '',
  nivel_risco: '',
  tipo_ponto: '',
  rodovia: '',
  rota_critica: false,
  area_rural: false,
  lista_vermelha: false
};

function normalizePerfil(perfil) {
  return String(perfil || '').trim().toLowerCase();
}

function riskClass(value) {
  return riskLabels[value] || riskLabels[String(value || '').trim()] || 'sem';
}

function getErrorMessage(error) {
  if (error?.code === 'MODULO_EM_MANUTENCAO') {
    return error.modulo?.mensagem_manutencao || 'Rotograma Seguro em manutencao.';
  }
  return error?.error || 'Nao foi possivel carregar os rotogramas.';
}

function RotogramaCard({ item, onSelect }) {
  return (
    <article className="rotograma-card">
      <div className="rotograma-card-top">
        <span className="rotograma-road-icon" aria-hidden="true">🛣️</span>
        <span className={`risk-badge ${riskClass(item.nivel_risco)}`}>{item.nivel_risco || 'Sem classificacao'}</span>
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
        <div>
          <dt>Telefones</dt>
          <dd>{item.telefones_count || 0}</dd>
        </div>
      </dl>
      <div className="rotograma-card-footer">
        <span>{item.status || 'ativo'}</span>
        <button type="button" onClick={() => onSelect(item.id)}>Ver detalhes</button>
      </div>
    </article>
  );
}

function RiskPointCard({ point }) {
  return (
    <article className={`risk-point-card ${riskClass(point.nivel_risco)}`}>
      <div>
        <span className={`risk-badge ${riskClass(point.nivel_risco)}`}>{point.nivel_risco || 'Sem classificacao'}</span>
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

function RotogramaDetail({ detail, onClose }) {
  if (!detail) return null;
  const { resumo, pontos = [], telefones = [], checklist = [], premissas = [], materiais = [] } = detail;

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
            ['Transportadora', resumo.transportadora],
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

      <DetailSection title="Premissas de condutor/veiculo">
        <div className="premissas-grid">
          {premissas.slice(0, 12).map((item) => (
            <article key={item.id}>
              <span>{item.categoria || 'Premissa'}</span>
              <strong>{item.titulo}</strong>
              <p>{item.descricao}</p>
            </article>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Materiais de Seguranca">
        <div className="materials-grid">
          {materiais.map((material) => (
            <article key={material.id}>
              <span>{material.tipo}</span>
              <strong>{material.titulo}</strong>
              <p>{material.descricao || 'Material importado da planilha.'}</p>
            </article>
          ))}
        </div>
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
  const isAdmin = normalizePerfil(user?.perfil) === 'admin';

  const activeFilters = useMemo(() => ({
    ...filters,
    rota_critica: filters.rota_critica ? '1' : '',
    area_rural: filters.area_rural ? '1' : '',
    lista_vermelha: filters.lista_vermelha ? '1' : ''
  }), [filters]);

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
      setImportStatus(`Importacao concluida: ${result.rotogramas_importados} rotogramas e ${result.pontos_risco_importados} pontos de risco.`);
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
          <span>Seguranca vem antes de qualquer rota.</span>
          <h1>Rotograma Seguro</h1>
          <p>Consulte rotas, pontos de risco e orientacoes de seguranca para uma operacao mais segura.</p>
        </div>
        <Link to="/">Voltar para a Central</Link>
      </section>

      <section className="rotograma-toolbar" aria-label="Busca e filtros de rotogramas">
        <label className="rotograma-search">
          <span>Busca principal</span>
          <input
            value={filters.busca}
            onChange={(event) => updateFilter('busca', event.target.value)}
            placeholder="Buscar por cidade, rota, destino ou ponto de risco"
          />
        </label>

        <div className="rotograma-filters">
          <label>
            Cidade/Destino
            <input value={filters.cidade} onChange={(event) => updateFilter('cidade', event.target.value)} placeholder="Ex.: Cascavel" />
          </label>
          <label>
            Nivel de risco
            <select value={filters.nivel_risco} onChange={(event) => updateFilter('nivel_risco', event.target.value)}>
              <option value="">Todos</option>
              <option value="Alto">Alto</option>
              <option value="Moderado">Moderado</option>
              <option value="Baixo">Baixo</option>
            </select>
          </label>
          <label>
            Tipo de ponto
            <select value={filters.tipo_ponto} onChange={(event) => updateFilter('tipo_ponto', event.target.value)}>
              <option value="">Todos</option>
              <option value="Ponto">Ponto</option>
              <option value="Trecho">Trecho</option>
            </select>
          </label>
          <label>
            Rodovia/Regiao
            <input value={filters.rodovia} onChange={(event) => updateFilter('rodovia', event.target.value)} placeholder="BR 277, PR..." />
          </label>
        </div>

        <div className="rotograma-switches">
          {[
            ['rota_critica', 'Rota critica'],
            ['area_rural', 'Area rural'],
            ['lista_vermelha', 'Lista vermelha']
          ].map(([field, label]) => (
            <label key={field}>
              <input type="checkbox" checked={filters[field]} onChange={(event) => updateFilter(field, event.target.checked)} />
              {label}
            </label>
          ))}
        </div>

        {isAdmin ? (
          <div className="rotograma-admin-box">
            <strong>Gerenciar Rotogramas</strong>
            <label>
              Importar nova planilha
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} />
            </label>
            {importStatus ? <p>{importStatus}</p> : <p>Use a importacao para atualizar rotas, pontos e materiais.</p>}
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
