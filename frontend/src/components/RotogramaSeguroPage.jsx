import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createRotogramaPointManual,
  deleteRotogramaPointManual,
  getAdminRotogramaResumo,
  getRotogramaDetail,
  getRotogramaOpcoes,
  getRotogramaPermissions,
  getRotogramas,
  importRotogramaFile,
  updateRotogramaManual,
  updateRotogramaPointManual
} from '../api.js';

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
    return error.modulo?.mensagem_manutencao || 'Rotograma Seguro em manutenção.';
  }
  return error?.error || 'Não foi possível carregar os rotogramas.';
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
          <dd>{item.origem || 'Não informado'}</dd>
        </div>
        <div>
          <dt>Destino</dt>
          <dd>{item.destino || item.cidade || 'Não informado'}</dd>
        </div>
        <div>
          <dt>Pontos de risco</dt>
          <dd>{item.pontos_risco_count || 0}</dd>
        </div>
      </dl>
      <div className="rotograma-card-footer">
        <span>{classification}</span>
        <button type="button" className="detail-action-button" onClick={() => onSelect(item.id)}>Ver detalhes</button>
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
        <p>{point.orientacao || 'Orientação não informada.'}</p>
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

const emptyPoint = {
  tipo_ponto: 'Ponto',
  descricao: '',
  nivel_risco: 'Moderado',
  rodovia_endereco: '',
  orientacao: '',
  latitude: '',
  longitude: '',
  velocidade_permitida: '',
  velocidade_segura: '',
  cidade: ''
};

function Field({ label, children }) {
  return <label><span>{label}</span>{children}</label>;
}

function PointEditor({ point, rotogramaId, onSaved, onCancel }) {
  const [form, setForm] = useState(point || emptyPoint);
  const [status, setStatus] = useState('');
  const isNew = !point?.id;

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setStatus('Salvando...');
    try {
      if (isNew) await createRotogramaPointManual(rotogramaId, form);
      else await updateRotogramaPointManual(rotogramaId, point.id, form);
      setStatus('');
      await onSaved();
    } catch (error) {
      setStatus(error?.error || 'Não foi possível salvar o ponto.');
    }
  }

  async function remove() {
    if (!window.confirm('Excluir este ponto de risco? A alteração ficará registrada no histórico.')) return;
    setStatus('Excluindo...');
    try {
      await deleteRotogramaPointManual(rotogramaId, point.id);
      await onSaved();
    } catch (error) {
      setStatus(error?.error || 'Não foi possível excluir o ponto.');
    }
  }

  return (
    <form className="rotograma-manual-form point" onSubmit={save}>
      <div className="rotograma-editor-grid">
        <Field label="Tipo"><input value={form.tipo_ponto || ''} onChange={(e) => change('tipo_ponto', e.target.value)} /></Field>
        <Field label="Nível de risco">
          <select value={form.nivel_risco || ''} onChange={(e) => change('nivel_risco', e.target.value)}>
            <option value="Baixo">Baixo</option>
            <option value="Moderado">Moderado</option>
            <option value="Alto">Alto</option>
          </select>
        </Field>
        <Field label="Descrição"><input required value={form.descricao || ''} onChange={(e) => change('descricao', e.target.value)} /></Field>
        <Field label="Rodovia/endereço"><input value={form.rodovia_endereco || ''} onChange={(e) => change('rodovia_endereco', e.target.value)} /></Field>
        <Field label="Latitude"><input value={form.latitude || ''} onChange={(e) => change('latitude', e.target.value)} placeholder="-24.000000" /></Field>
        <Field label="Longitude"><input value={form.longitude || ''} onChange={(e) => change('longitude', e.target.value)} placeholder="-53.000000" /></Field>
        <Field label="Velocidade permitida"><input value={form.velocidade_permitida || ''} onChange={(e) => change('velocidade_permitida', e.target.value)} /></Field>
        <Field label="Velocidade segura"><input value={form.velocidade_segura || ''} onChange={(e) => change('velocidade_segura', e.target.value)} /></Field>
      </div>
      <Field label="Orientação"><textarea rows="3" value={form.orientacao || ''} onChange={(e) => change('orientacao', e.target.value)} /></Field>
      {form.latitude && form.longitude ? (
        <a className="rotograma-map-preview" href={`https://www.google.com/maps?q=${encodeURIComponent(form.latitude)},${encodeURIComponent(form.longitude)}`} target="_blank" rel="noreferrer">
          Conferir coordenadas no Maps
        </a>
      ) : null}
      <div className="rotograma-editor-actions">
        <button type="submit">Salvar ponto</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        {!isNew ? <button type="button" className="danger" onClick={remove}>Excluir ponto</button> : null}
      </div>
      {status ? <p className="rotograma-editor-status">{status}</p> : null}
    </form>
  );
}

function RotogramaManualEditor({ detail, onSaved }) {
  const [routeForm, setRouteForm] = useState(detail.resumo);
  const [editingPoint, setEditingPoint] = useState(null);
  const [addingPoint, setAddingPoint] = useState(false);
  const [status, setStatus] = useState('');

  async function saveRoute(event) {
    event.preventDefault();
    setStatus('Salvando alterações...');
    try {
      await updateRotogramaManual(detail.resumo.id, routeForm);
      setStatus('Alterações salvas e registradas no histórico.');
      await onSaved();
    } catch (error) {
      setStatus(error?.error || 'Não foi possível atualizar a rota.');
    }
  }

  async function refreshPoints() {
    setEditingPoint(null);
    setAddingPoint(false);
    await onSaved();
  }

  return (
    <details className="rotograma-editor-panel">
      <summary>Editar Rotograma</summary>
      <p className="rotograma-editor-note">Acesso exclusivo da matrícula autorizada. Todas as alterações são auditadas.</p>
      <form className="rotograma-manual-form" onSubmit={saveRoute}>
        <div className="rotograma-editor-grid">
          {[
            ['nome', 'Nome da rota'],
            ['origem', 'Origem'],
            ['destino', 'Destino'],
            ['cidade', 'Cidade'],
            ['nivel_risco', 'Nível de risco']
          ].map(([field, label]) => (
            <Field label={label} key={field}>
              <input value={routeForm[field] || ''} onChange={(e) => setRouteForm((current) => ({ ...current, [field]: e.target.value }))} />
            </Field>
          ))}
          <Field label="Classificação">
            <select value={String(routeForm.classificacao_rota || '').includes('OK') ? 'OK' : 'ATENCAO'} onChange={(e) => setRouteForm((current) => ({ ...current, classificacao_rota: e.target.value }))}>
              <option value="ATENCAO">ATENÇÃO</option>
              <option value="OK">OK</option>
            </select>
          </Field>
        </div>
        <Field label="Observação">
          <textarea rows="3" value={routeForm.observacao || ''} onChange={(e) => setRouteForm((current) => ({ ...current, observacao: e.target.value }))} />
        </Field>
        <div className="rotograma-editor-actions"><button type="submit">Salvar dados da rota</button></div>
        {status ? <p className="rotograma-editor-status">{status}</p> : null}
      </form>

      <div className="rotograma-editor-points-heading">
        <h3>Pontos de risco</h3>
        <button type="button" onClick={() => { setAddingPoint(true); setEditingPoint(null); }}>Adicionar ponto</button>
      </div>
      {addingPoint ? <PointEditor rotogramaId={detail.resumo.id} onSaved={refreshPoints} onCancel={() => setAddingPoint(false)} /> : null}
      <div className="rotograma-editor-point-list">
        {detail.pontos.map((point) => (
          <article key={point.id}>
            <div><strong>{point.descricao || point.tipo_ponto}</strong><span>{point.rodovia_endereco || 'Sem endereço'}</span></div>
            <button type="button" onClick={() => { setEditingPoint(point); setAddingPoint(false); }}>Editar</button>
            {editingPoint?.id === point.id ? <PointEditor point={point} rotogramaId={detail.resumo.id} onSaved={refreshPoints} onCancel={() => setEditingPoint(null)} /> : null}
          </article>
        ))}
      </div>
    </details>
  );
}

function AdminResumo({ resumo }) {
  if (!resumo) return null;

  return (
    <div className="rotograma-admin-summary">
      <span><b>{resumo.total_rotas}</b> rotas importadas</span>
      <span><b>{resumo.total_atencao}</b> ATENÇÃO</span>
      <span><b>{resumo.total_ok}</b> OK</span>
      <span><b>{resumo.rotas_ignoradas}</b> ignoradas</span>
      <span><b>{resumo.abas_ignoradas?.length || 0}</b> abas ignoradas</span>
      <span><b>{formatDateTime(resumo.ultima_importacao)}</b> ultima importacao</span>
    </div>
  );
}

function RotogramaDetail({ detail, onClose, canEdit, onSaved }) {
  if (!detail) return null;
  const { resumo, pontos = [], telefones = [], checklist = [] } = detail;

  return (
    <section className="rotograma-detail-panel" aria-label="Detalhes do rotograma">
      <div className="rotograma-detail-header">
        <div>
          <span>Detalhe do rotograma</span>
          <h2>{resumo.nome}</h2>
          <p>{resumo.origem || 'Origem não informada'} → {resumo.destino || resumo.cidade || 'Destino não informado'}</p>
        </div>
        <button type="button" onClick={onClose}>Retornar</button>
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
              <strong>{value || 'Não informado'}</strong>
            </div>
          ))}
        </div>
      </DetailSection>

      {canEdit ? <RotogramaManualEditor detail={detail} onSaved={onSaved} /> : null}

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
  const [canEdit, setCanEdit] = useState(false);
  const isAdmin = normalizePerfil(user?.perfil) === 'admin';

  const activeFilters = useMemo(() => filters, [filters]);

  useEffect(() => {
    getRotogramaOpcoes()
      .then(setOpcoes)
      .catch(() => setOpcoes({ origens: [], destinos: [] }));
  }, []);

  useEffect(() => {
    getRotogramaPermissions()
      .then((result) => setCanEdit(Boolean(result?.pode_editar)))
      .catch(() => setCanEdit(false));
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
      .then((detail) => {
        setSelected(detail);
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      })
      .catch((error) => setMessage(getErrorMessage(error)))
      .finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setSelected(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  async function refreshDetail() {
    if (!selected?.resumo?.id) return;
    const detail = await getRotogramaDetail(selected.resumo.id);
    setSelected(detail);
    const rows = await getRotogramas(activeFilters);
    setRotogramas(rows);
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportStatus('Importando planilha...');
    try {
      const result = await importRotogramaFile(file);
      setImportStatus(`Importação concluída: ${result.rotogramas_importados} rotogramas, ${result.total_atencao || 0} ATENÇÃO e ${result.total_ok || 0} OK.`);
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
          <span>Antes de iniciar a rota, confira os pontos de atenção e siga as orientações de segurança.</span>
          <h1>Rotograma Seguro</h1>
          <p>Consulte rotas OK e rotas em atenção para uma operação mais segura.</p>
        </div>
        <Link to="/">Voltar para a Central</Link>
      </section>

      {selected ? (
        <section className="detail-view-panel">
          <div className="detail-view-toolbar">
            <button type="button" className="detail-back-button" onClick={closeDetail}>
              <span aria-hidden="true">&larr;</span> Retornar
            </button>
          </div>
          <RotogramaDetail detail={selected} onClose={closeDetail} canEdit={canEdit} onSaved={refreshDetail} />
        </section>
      ) : (
        <>
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
            ['ATENCAO', 'ATENÇÃO'],
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
            {importStatus ? <p>{importStatus}</p> : <p>Use a importação para atualizar rotas OK e rotas em atenção.</p>}
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
        </>
      )}
    </div>
  );
}
