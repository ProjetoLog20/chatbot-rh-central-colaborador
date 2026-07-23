import { useEffect, useState } from 'react';
import {
  getCollaborators,
  createCollaborator,
  updateCollaborator,
  removeCollaborator,
  getProntuarios,
  getRespostas,
  importFile,
  downloadImportTemplate,
  createResposta,
  updateResposta,
  deleteResposta,
  getAdminAcoes,
  createAcao,
  updateAcao,
  deleteAcao,
  resetCollaboratorPassword,
  getAdminModulos,
  updateAdminModulo,
  getAdminAccessMetrics
} from '../api.js';
import AdminCampeoesSeguranca from './AdminCampeoesSeguranca.jsx';
import AdminNotifications from './AdminNotifications.jsx';

const actionCategories = [
  ['cipa', 'CIPA'],
  ['cafe_com_gerente', 'Café com o Gerente'],
  ['comite_de_gente', 'Comitê de Gente']
];

const emptyCollaboratorForm = {
  matricula: '',
  nome_completo: '',
  nome_preferido: '',
  cpf: '',
  telefone_whatsapp: '',
  email: '',
  cargo: '',
  setor: '',
  unidade: 'Cascavel',
  tipo_colaborador: '',
  status: 'Ativo',
  data_admissao: '',
  perfil: 'colaborador',
  usuario_wms: '',
  codigo_operacional: '',
  senha: ''
};

const accessDescriptions = {
  admin: 'Acesso total à Central do Administrador, cadastros, importações e configurações.',
  motorista: 'Acesso aos recursos operacionais da rota, conforme os módulos liberados para Motorista/Ajudante.',
  colaborador: 'Acesso comum aos serviços e informações do colaborador, conforme os módulos liberados.'
};

function labelForActionCategory(category) {
  return actionCategories.find(([value]) => value === category)?.[1] || 'CIPA';
}

function AdminActionImage({ item }) {
  const [failed, setFailed] = useState(false);

  if (failed || !item.imagem_url) {
    return (
      <div className="actions-admin-image-fallback">
        <span>Imagem indisponivel</span>
      </div>
    );
  }

  return <img src={item.imagem_url} alt={item.titulo} onError={() => setFailed(true)} />;
}

const importOptions = [
  {
    type: 'colaboradores',
    title: 'Colaboradores',
    description: 'Cadastre ou atualize matrícula, perfil, setor, unidade, contato e status.',
    path: '/import/colaboradores'
  },
  {
    type: 'prontuario_motoristas',
    title: 'Prontuario dos motoristas',
    description: 'Importe a planilha analitica limpa com CPF, pontuacao, faixa e ocorrencias.',
    path: '/prontuario/importar'
  },
  {
    type: 'respostas_chatbot',
    title: 'Base do Yuri',
    description: 'Alimente perguntas, respostas e categorias usadas pela IA em modo local.',
    path: '/import/respostas_chatbot'
  }
];

function AccessChart({ history = [] }) {
  const values = history.map((item) => Number(item.total || 0));
  const maxValue = Math.max(...values, 1);

  if (!history.length) {
    return <p>Nenhum dado de acesso registrado ainda.</p>;
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '0.6rem', alignItems: 'end' }}>
        {history.slice(-7).map((item) => {
          const height = Math.max(10, (Number(item.total || 0) / maxValue) * 100);
          return (
            <div key={item.data} style={{ textAlign: 'center' }}>
              <div style={{ height: '90px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: '36px', height: `${height}%`, background: '#2563eb', borderRadius: '6px 6px 0 0' }} />
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.35rem', color: '#475569' }}>{item.data}</div>
              <div style={{ fontWeight: 600 }}>{item.total}</div>
            </div>
          );
        })}
      </div>
      <p style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.9rem' }}>Histórico retroativo a partir do momento em que o contador passou a ser registrado.</p>
    </div>
  );
}

function ModuleConfigItem({ modulo, onSave }) {
  const [form, setForm] = useState({
    ativo: Boolean(modulo.ativo),
    em_manutencao: Boolean(modulo.em_manutencao),
    visivel_para_admin: Boolean(modulo.visivel_para_admin),
    visivel_para_motorista: Boolean(modulo.visivel_para_motorista),
    visivel_para_colaborador: Boolean(modulo.visivel_para_colaborador),
    mensagem_manutencao: modulo.mensagem_manutencao || '',
    ordem: modulo.ordem || 0
  });

  useEffect(() => {
    setForm({
      ativo: Boolean(modulo.ativo),
      em_manutencao: Boolean(modulo.em_manutencao),
      visivel_para_admin: Boolean(modulo.visivel_para_admin),
      visivel_para_motorista: Boolean(modulo.visivel_para_motorista),
      visivel_para_colaborador: Boolean(modulo.visivel_para_colaborador),
      mensagem_manutencao: modulo.mensagem_manutencao || '',
      ordem: modulo.ordem || 0
    });
  }, [modulo]);

  function setBoolean(field, checked) {
    setForm((current) => ({ ...current, [field]: checked }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave(modulo.chave, {
      ...form,
      ordem: Number(form.ordem || 0)
    });
  }

  return (
    <article className="module-config-card">
      <div className="module-config-header">
        <div>
          <h3>{modulo.nome}</h3>
          <span>{modulo.chave}</span>
        </div>
        <div className="module-status-row">
          <span className={form.ativo ? 'module-status active' : 'module-status inactive'}>{form.ativo ? 'Ativo' : 'Inativo'}</span>
          <span className={form.em_manutencao ? 'module-status maintenance' : 'module-status active'}>{form.em_manutencao ? 'Manutenção' : 'Normal'}</span>
        </div>
      </div>

      <p>{modulo.descricao || 'Sem descrição cadastrada.'}</p>

      <form className="admin-form module-config-form" onSubmit={handleSubmit}>
        <div className="module-check-grid">
          <label className="inline-check">
            <input type="checkbox" checked={form.ativo} onChange={(event) => setBoolean('ativo', event.target.checked)} />
            Ativo
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={form.em_manutencao} onChange={(event) => setBoolean('em_manutencao', event.target.checked)} />
            Em manutenção
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={form.visivel_para_admin} onChange={(event) => setBoolean('visivel_para_admin', event.target.checked)} />
            Admin
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={form.visivel_para_motorista} onChange={(event) => setBoolean('visivel_para_motorista', event.target.checked)} />
            Motorista/Ajudante
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={form.visivel_para_colaborador} onChange={(event) => setBoolean('visivel_para_colaborador', event.target.checked)} />
            Colaborador
          </label>
        </div>
        <div className="form-grid">
          <label>
            Ordem
            <input type="number" value={form.ordem} onChange={(event) => setForm({ ...form, ordem: event.target.value })} />
          </label>
          <label className="wide-field">
            Mensagem de manutenção
            <textarea rows="3" value={form.mensagem_manutencao} onChange={(event) => setForm({ ...form, mensagem_manutencao: event.target.value })} />
          </label>
        </div>
        <button type="submit">Salvar</button>
      </form>
    </article>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('excel');
  const [colaboradores, setColaboradores] = useState([]);
  const [prontuarios, setProntuarios] = useState([]);
  const [respostas, setRespostas] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [accessMetrics, setAccessMetrics] = useState(null);
  const [message, setMessage] = useState('');
  const [collaboratorForm, setCollaboratorForm] = useState(emptyCollaboratorForm);
  const [editingCollaboratorId, setEditingCollaboratorId] = useState(null);
  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [collaboratorStatusFilter, setCollaboratorStatusFilter] = useState('ativos');
  const [savingCollaborator, setSavingCollaborator] = useState(false);
  const [importErrors, setImportErrors] = useState(null);
  const [respostaText, setRespostaText] = useState({ pergunta: '', resposta: '', categoria: '', ativo: true });
  const [editingRespostaId, setEditingRespostaId] = useState(null);
  const [respostaEditText, setRespostaEditText] = useState({ pergunta: '', resposta: '', categoria: '', ativo: true });
  const [editingAcaoId, setEditingAcaoId] = useState(null);
  const [acaoAdminFilter, setAcaoAdminFilter] = useState('todas');
  const [acaoForm, setAcaoForm] = useState({
    categoria: 'cipa',
    titulo: '',
    descricao: '',
    data_evento: '',
    responsavel: '',
    status: 'publicado',
    encaminhamento: '',
    imagem: null,
    ativo: true
  });
  const [acaoEditForm, setAcaoEditForm] = useState({
    categoria: 'cipa',
    titulo: '',
    descricao: '',
    data_evento: '',
    responsavel: '',
    status: 'publicado',
    encaminhamento: '',
    imagem: null,
    ativo: true
  });

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const [col, pr, resp, acoesData, modulosData, accessData] = await Promise.allSettled([
      getCollaborators(),
      getProntuarios(),
      getRespostas(),
      getAdminAcoes(),
      getAdminModulos(),
      getAdminAccessMetrics()
    ]);

    if (col.status === 'fulfilled') setColaboradores(col.value);
    if (pr.status === 'fulfilled') setProntuarios(pr.value);
    if (resp.status === 'fulfilled') setRespostas(resp.value);
    if (acoesData.status === 'fulfilled') setAcoes(acoesData.value);
    if (modulosData.status === 'fulfilled') setModulos(modulosData.value);
    if (accessData.status === 'fulfilled') setAccessMetrics(accessData.value);

    const failed = [
      col.status === 'rejected' ? 'colaboradores' : null,
      pr.status === 'rejected' ? 'prontuarios' : null,
      resp.status === 'rejected' ? 'chatbot' : null,
      acoesData.status === 'rejected' ? 'acoes' : null,
      modulosData.status === 'rejected' ? 'modulos' : null,
      accessData.status === 'rejected' ? 'contador de acessos' : null
    ].filter(Boolean);

    if (failed.length) {
      console.error('Falha ao carregar areas administrativas:', failed, { col, pr, resp, acoesData, modulosData });
      setMessage(`Não foi possível carregar: ${failed.join(', ')}.`);
    }
  }

  async function handleImport(path, files) {
    if (!files.length) return;
    try {
      const result = await importFile(path, files[0]);
      const total = result.imported ?? ((result.created || 0) + (result.updated || 0));
      setMessage(`Importacao concluida: ${total} registro(s).`);
      setImportErrors(result.errors || []);
      refresh();
    } catch (err) {
      setMessage(err.error || 'Falha na importacao');
    }
  }

  async function handleDownloadTemplate(type) {
    try {
      await downloadImportTemplate(type);
      setMessage('Modelo baixado. Preencha a primeira aba do arquivo e importe aqui novamente.');
    } catch (err) {
      setMessage(err.error || 'Erro ao baixar modelo');
    }
  }

  async function handleCreateResposta(e) {
    e.preventDefault();
    try {
      await createResposta(respostaText);
      setMessage('Resposta criada.');
      setRespostaText({ pergunta: '', resposta: '', categoria: '', ativo: true });
      refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao criar resposta');
    }
  }

  async function handleToggleResposta(item) {
    try {
      await updateResposta(item.id, { ...item, ativo: item.ativo ? 0 : 1 });
      refresh();
    } catch (err) {
      console.error(err);
    }
  }

  function startEditResposta(item) {
    setEditingRespostaId(item.id);
    setRespostaEditText({
      pergunta: item.pergunta || '',
      resposta: item.resposta || '',
      categoria: item.categoria || '',
      ativo: Boolean(item.ativo)
    });
    setMessage('');
  }

  function cancelEditResposta() {
    setEditingRespostaId(null);
    setRespostaEditText({ pergunta: '', resposta: '', categoria: '', ativo: true });
  }

  async function handleUpdateResposta(e) {
    e.preventDefault();
    if (!editingRespostaId) return;

    try {
      await updateResposta(editingRespostaId, respostaEditText);
      setMessage('Resposta atualizada.');
      cancelEditResposta();
      refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao atualizar resposta');
    }
  }

  async function handleCreateAcao(e) {
    e.preventDefault();
    try {
      await createAcao({
        categoria: acaoForm.categoria,
        titulo: acaoForm.titulo,
        descricao: acaoForm.descricao,
        data_evento: acaoForm.data_evento,
        responsavel: acaoForm.responsavel,
        status: acaoForm.status,
        encaminhamento: acaoForm.encaminhamento,
        ativo: acaoForm.ativo ? 1 : 0,
        imagem: acaoForm.imagem
      });
      setMessage('Acao publicada com sucesso.');
      setAcaoForm({ categoria: 'cipa', titulo: '', descricao: '', data_evento: '', responsavel: '', status: 'publicado', encaminhamento: '', imagem: null, ativo: true });
      e.target.reset();
      refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao publicar acao');
    }
  }

  async function handleToggleAcao(item) {
    try {
      const nextActive = item.ativo ? 0 : 1;
      await updateAcao(item.id, { ...item, ativo: nextActive, status: nextActive ? 'publicado' : 'oculto' });
      refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao atualizar acao');
    }
  }

  function startEditAcao(item) {
    setEditingAcaoId(item.id);
    setAcaoEditForm({
      categoria: item.categoria || 'cipa',
      titulo: item.titulo || '',
      descricao: item.descricao || '',
      data_evento: item.data_evento || '',
      responsavel: item.responsavel || '',
      status: item.status || 'publicado',
      encaminhamento: item.encaminhamento || '',
      imagem: null,
      ativo: Boolean(item.ativo)
    });
    setMessage('');
  }

  function cancelEditAcao() {
    setEditingAcaoId(null);
    setAcaoEditForm({ categoria: 'cipa', titulo: '', descricao: '', data_evento: '', responsavel: '', status: 'publicado', encaminhamento: '', imagem: null, ativo: true });
  }

  async function handleUpdateAcao(e) {
    e.preventDefault();
    if (!editingAcaoId) return;

    try {
      await updateAcao(editingAcaoId, {
        categoria: acaoEditForm.categoria,
        titulo: acaoEditForm.titulo,
        descricao: acaoEditForm.descricao,
        data_evento: acaoEditForm.data_evento,
        responsavel: acaoEditForm.responsavel,
        status: acaoEditForm.status,
        encaminhamento: acaoEditForm.encaminhamento,
        ativo: acaoEditForm.ativo ? 1 : 0,
        imagem: acaoEditForm.imagem
      });
      setMessage('Acao atualizada com sucesso.');
      cancelEditAcao();
      refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao atualizar acao');
    }
  }

  async function handleResetPassword(item) {
    try {
      await resetCollaboratorPassword(item.id);
      setMessage(`Senha de ${item.nome_completo} resetada para log20.`);
      refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao resetar senha');
    }
  }

  function startCreateCollaborator() {
    setEditingCollaboratorId(null);
    setCollaboratorForm(emptyCollaboratorForm);
  }

  function startEditCollaborator(item) {
    setEditingCollaboratorId(item.id);
    setCollaboratorForm({
      ...emptyCollaboratorForm,
      ...Object.fromEntries(Object.keys(emptyCollaboratorForm).map((key) => [key, item[key] ?? ''])),
      senha: ''
    });
    setMessage('');
  }

  async function handleSaveCollaborator(event) {
    event.preventDefault();
    setSavingCollaborator(true);
    try {
      if (editingCollaboratorId) {
        await updateCollaborator(editingCollaboratorId, collaboratorForm);
        setMessage('Cadastro atualizado. Os acessos já refletem o perfil e o status escolhidos.');
      } else {
        const result = await createCollaborator(collaboratorForm);
        setMessage(`Usuário criado. Senha temporária: ${result.senha_temporaria || 'log20'}.`);
      }
      startCreateCollaborator();
      await refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao salvar o cadastro.');
    } finally {
      setSavingCollaborator(false);
    }
  }

  async function handleDeactivateCollaborator(item) {
    if (!window.confirm(`Desligar ${item.nome_completo}? O acesso será bloqueado imediatamente e o histórico será preservado.`)) return;
    try {
      await updateCollaborator(item.id, { status: 'Desligado' });
      setMessage(`${item.nome_completo} foi desligado e não pode mais acessar o Yuri.`);
      await refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao desligar o usuário.');
    }
  }

  async function handleRemoveCollaborator(item) {
    if (!window.confirm(`Remover o cadastro de ${item.nome_completo}? O acesso e os vínculos operacionais serão revogados, mas o histórico continuará protegido.`)) return;
    try {
      await removeCollaborator(item.id);
      setMessage(`Cadastro de ${item.nome_completo} removido com o histórico preservado.`);
      if (editingCollaboratorId === item.id) startCreateCollaborator();
      await refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao remover o usuário.');
    }
  }

  async function handleSaveModulo(chave, payload) {
    try {
      await updateAdminModulo(chave, payload);
      setMessage('Configuração de módulo salva.');
      refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao salvar módulo');
    }
  }

  const filteredAcoes = acaoAdminFilter === 'todas'
    ? acoes
    : acoes.filter((item) => item.categoria === acaoAdminFilter);
  const filteredCollaborators = colaboradores.filter((item) => {
    const inactive = ['desligado', 'removido', 'inativo'].includes(String(item.status || '').toLowerCase());
    if (collaboratorStatusFilter === 'ativos' && inactive) return false;
    if (collaboratorStatusFilter === 'inativos' && !inactive) return false;
    const query = collaboratorSearch.trim().toLowerCase();
    if (!query) return true;
    return [item.matricula, item.nome_completo, item.nome_preferido, item.cargo, item.setor, item.usuario_wms]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  return (
    <div className="page-card admin-card">
      <div className="admin-heading">
        <div>
          <h1>Central do Administrador</h1>
          <p>Baixe modelos Excel, preencha os dados e envie para atualizar a Central do Colaborador.</p>
        </div>
      </div>

      <section className="admin-section">
        <h2>Contador de acessos</h2>
        <p>Dados de uso do aplicativo disponíveis somente para administradores.</p>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.9rem' }}>
            <strong>Total de acessos</strong>
            <div style={{ fontSize: '1.5rem', marginTop: '0.3rem' }}>{accessMetrics?.total_acessos ?? 0}</div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.9rem' }}>
            <strong>Acessos hoje</strong>
            <div style={{ fontSize: '1.5rem', marginTop: '0.3rem' }}>{accessMetrics?.total_acessos_hoje ?? 0}</div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.9rem' }}>
            <strong>Última atualização</strong>
            <div style={{ fontSize: '1rem', marginTop: '0.3rem' }}>{accessMetrics?.ultima_data ? accessMetrics.ultima_data : 'Sem dados'}</div>
          </div>
        </div>
        <AccessChart history={accessMetrics?.history || []} />
      </section>

      <div className="admin-tabs" role="tablist" aria-label="Areas administrativas">
        <button className={activeTab === 'excel' ? 'active' : ''} onClick={() => setActiveTab('excel')}>Exportar para a página via Excel</button>
        <button className={activeTab === 'dados' ? 'active' : ''} onClick={() => setActiveTab('dados')}>Dados publicados</button>
        <button className={activeTab === 'acoes' ? 'active' : ''} onClick={() => setActiveTab('acoes')}>Ações e Eventos</button>
        <button className={activeTab === 'campeoes' ? 'active' : ''} onClick={() => setActiveTab('campeoes')}>Campeao Segurança</button>
        <button className={activeTab === 'modulos' ? 'active' : ''} onClick={() => setActiveTab('modulos')}>Configuração de Módulos</button>
        <button className={activeTab === 'chatbot' ? 'active' : ''} onClick={() => setActiveTab('chatbot')}>Yuri</button>
        <button className={activeTab === 'notificacoes' ? 'active' : ''} onClick={() => setActiveTab('notificacoes')}>Notificacoes do Yuri</button>
      </div>

      {message && <div className="import-message">{message}</div>}

      {activeTab === 'dados' ? (
        <>
          <section className="admin-section">
            <div className="user-management-heading">
              <div>
                <h2>Gestão de usuários</h2>
                <p className="section-help">Cadastre colaboradores, determine o nível de acesso e desligue usuários sem perder os históricos do RH.</p>
              </div>
              {editingCollaboratorId ? <button type="button" onClick={startCreateCollaborator}>+ Novo usuário</button> : null}
            </div>
            <form className="admin-form user-form" onSubmit={handleSaveCollaborator}>
              <div className="user-form-title">
                <div>
                  <h3>{editingCollaboratorId ? 'Editar cadastro' : 'Cadastrar novo usuário'}</h3>
                  <small>Campos com * são obrigatórios. A senha inicial padrão é <strong>log20</strong>.</small>
                </div>
                <span className={`user-access-badge ${collaboratorForm.perfil}`}>{collaboratorForm.perfil}</span>
              </div>
              <div className="form-grid user-form-grid">
                <label>Matrícula *<input required value={collaboratorForm.matricula} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, matricula: e.target.value })} /></label>
                <label>Nome completo *<input required value={collaboratorForm.nome_completo} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, nome_completo: e.target.value })} /></label>
                <label>Nome preferido<input value={collaboratorForm.nome_preferido} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, nome_preferido: e.target.value })} /></label>
                <label>CPF<input value={collaboratorForm.cpf} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, cpf: e.target.value })} /></label>
                <label>Cargo<input value={collaboratorForm.cargo} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, cargo: e.target.value })} /></label>
                <label>Tipo de colaborador<input placeholder="Ex.: Motorista, Ajudante, Operador" value={collaboratorForm.tipo_colaborador} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, tipo_colaborador: e.target.value })} /></label>
                <label>Setor<input value={collaboratorForm.setor} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, setor: e.target.value })} /></label>
                <label>Unidade<input value={collaboratorForm.unidade} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, unidade: e.target.value })} /></label>
                <label>Telefone / WhatsApp<input type="tel" value={collaboratorForm.telefone_whatsapp} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, telefone_whatsapp: e.target.value })} /></label>
                <label>E-mail<input type="email" value={collaboratorForm.email} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, email: e.target.value })} /></label>
                <label>Data de admissão<input type="date" value={collaboratorForm.data_admissao || ''} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, data_admissao: e.target.value })} /></label>
                <label>Status<select value={collaboratorForm.status} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, status: e.target.value })}><option value="Ativo">Ativo</option><option value="Afastado">Afastado</option><option value="Desligado">Desligado</option></select></label>
                <label>Usuário WMS<input value={collaboratorForm.usuario_wms} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, usuario_wms: e.target.value })} /></label>
                <label>Código operacional<input value={collaboratorForm.codigo_operacional} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, codigo_operacional: e.target.value })} /></label>
                <label>Senha temporária<input type="password" placeholder={editingCollaboratorId ? 'Vazio mantém a senha atual' : 'Padrão: log20'} value={collaboratorForm.senha} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, senha: e.target.value })} /></label>
              </div>
              <fieldset className="user-access-selector">
                <legend>Perfil e acessos *</legend>
                {Object.entries(accessDescriptions).map(([profile, description]) => (
                  <label className={collaboratorForm.perfil === profile ? 'selected' : ''} key={profile}>
                    <input type="radio" name="perfil" value={profile} checked={collaboratorForm.perfil === profile} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, perfil: e.target.value })} />
                    <span><strong>{profile === 'admin' ? 'Administrador' : profile === 'motorista' ? 'Motorista / Ajudante' : 'Colaborador'}</strong><small>{description}</small></span>
                  </label>
                ))}
              </fieldset>
              <div className="user-form-actions">
                <button type="submit" disabled={savingCollaborator}>{savingCollaborator ? 'Salvando...' : editingCollaboratorId ? 'Salvar alterações' : 'Criar usuário'}</button>
                {editingCollaboratorId ? <button type="button" className="secondary-button" onClick={startCreateCollaborator}>Cancelar edição</button> : null}
              </div>
            </form>
            <div className="user-list-tools">
              <input aria-label="Buscar usuário" placeholder="Buscar por nome, matrícula, cargo ou WMS" value={collaboratorSearch} onChange={(e) => setCollaboratorSearch(e.target.value)} />
              <select aria-label="Filtrar status" value={collaboratorStatusFilter} onChange={(e) => setCollaboratorStatusFilter(e.target.value)}><option value="ativos">Ativos</option><option value="inativos">Desligados e removidos</option><option value="todos">Todos</option></select>
              <span>{filteredCollaborators.length} cadastro(s)</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Matrícula</th><th>Nome</th><th>Perfil</th><th>Status</th><th>Primeiro acesso</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {filteredCollaborators.map((item) => (
                    <tr key={item.id}>
                      <td>{item.matricula}</td>
                      <td>{item.nome_preferido || item.nome_completo}</td>
                      <td><span className={`user-access-badge ${item.perfil}`}>{item.perfil}</span></td>
                      <td><span className={`user-status ${String(item.status || '').toLowerCase()}`}>{item.status || 'Ativo'}</span></td>
                      <td>{item.primeiro_acesso || item.senha_temporaria ? 'Pendente' : 'Concluido'}</td>
                      <td><div className="user-row-actions">
                        <button type="button" onClick={() => startEditCollaborator(item)}>Editar</button>
                        <button type="button" onClick={() => handleResetPassword(item)}>Resetar senha</button>
                        {!['desligado', 'removido'].includes(String(item.status || '').toLowerCase()) ? <button type="button" className="warning-button" onClick={() => handleDeactivateCollaborator(item)}>Desligar</button> : null}
                        {String(item.status || '').toLowerCase() !== 'removido' ? <button type="button" className="danger-button" onClick={() => handleRemoveCollaborator(item)}>Remover</button> : null}
                      </div></td>
                    </tr>
                  ))}
                  {!filteredCollaborators.length ? <tr><td colSpan="6">Nenhum cadastro encontrado com esses filtros.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section">
            <h2>Prontuarios</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Motorista</th><th>Pontuacao</th><th>Faixa</th><th>Cor</th><th>Ultima importacao</th></tr>
                </thead>
                <tbody>
                  {prontuarios.map((item) => (
                    <tr key={item.id}><td>{item.nome_condutor || item.nome_completo}</td><td>{item.pontuacao_ponderada}</td><td>{item.faixa}</td><td>{item.cor_faixa}</td><td>{item.data_importacao}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'excel' ? (
        <section className="admin-section">
          <h2>Exportar dados para a página</h2>
          <p className="section-help">Use este fluxo: baixe o modelo, preencha no Excel e envie o arquivo preenchido. Ao importar, os dados ficam publicados nas telas do sistema.</p>
          <div className="import-grid">
            {importOptions.map((option) => (
              <div className="import-card" key={option.type}>
                <h3>{option.title}</h3>
                <p>{option.description}</p>
                <div className="import-card-actions">
                  <button type="button" onClick={() => handleDownloadTemplate(option.type)}>1. Baixar modelo Excel</button>
                  <label>
                    2. Enviar Excel preenchido
                    <input type="file" accept={option.type === 'prontuario_motoristas' ? '.xls,.xlsx' : '.csv,.xlsx'} onChange={(e) => handleImport(option.path, e.target.files)} />
                  </label>
                </div>
              </div>
            ))}
          </div>
          {importErrors && importErrors.length > 0 && (
            <div className="import-errors">
              <h3>Erros de importacao</h3>
              <ul>{importErrors.map((item, index) => <li key={index}>{item.row}: {item.error}</li>)}</ul>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'chatbot' ? (
        <section className="admin-section">
          <h2>Respostas do Yuri</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Categoria</th><th>Pergunta</th><th>Resposta</th><th>Ativo</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {respostas.map((item) => (
                  <tr key={item.id}>
                    <td>{item.categoria}</td>
                    <td>{item.pergunta}</td>
                    <td>{item.resposta}</td>
                    <td>{item.ativo ? 'Sim' : 'Não'}</td>
                    <td>
                      <button onClick={() => startEditResposta(item)}>Editar</button>
                      <button onClick={() => handleToggleResposta(item)}>{item.ativo ? 'Desativar' : 'Ativar'}</button>
                      <button onClick={() => deleteResposta(item.id).then(refresh)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editingRespostaId ? (
            <form className="admin-form action-edit-form" onSubmit={handleUpdateResposta}>
              <div className="form-grid">
                <label>
                  Categoria
                  <input value={respostaEditText.categoria} onChange={(e) => setRespostaEditText({ ...respostaEditText, categoria: e.target.value })} />
                </label>
                <label>
                  Pergunta
                  <input value={respostaEditText.pergunta} onChange={(e) => setRespostaEditText({ ...respostaEditText, pergunta: e.target.value })} required />
                </label>
                <label className="wide-field">
                  Resposta
                  <textarea value={respostaEditText.resposta} onChange={(e) => setRespostaEditText({ ...respostaEditText, resposta: e.target.value })} rows="4" required />
                </label>
              </div>
              <label className="inline-check">
                <input type="checkbox" checked={respostaEditText.ativo} onChange={(e) => setRespostaEditText({ ...respostaEditText, ativo: e.target.checked })} />
                Ativa
              </label>
              <div className="row-actions">
                <button type="submit">Salvar alterações</button>
                <button type="button" onClick={cancelEditResposta}>Cancelar</button>
              </div>
            </form>
          ) : null}
          <form className="admin-form" onSubmit={handleCreateResposta}>
            <div className="form-grid">
              <label>
                Categoria
                <input value={respostaText.categoria} onChange={(e) => setRespostaText({ ...respostaText, categoria: e.target.value })} />
              </label>
              <label>
                Pergunta
                <input value={respostaText.pergunta} onChange={(e) => setRespostaText({ ...respostaText, pergunta: e.target.value })} required />
              </label>
              <label>
                Resposta
                <input value={respostaText.resposta} onChange={(e) => setRespostaText({ ...respostaText, resposta: e.target.value })} required />
              </label>
            </div>
            <button type="submit">Criar resposta</button>
          </form>
        </section>
      ) : null}

      {activeTab === 'modulos' ? (
        <section className="admin-section">
          <h2>Configuração de Módulos</h2>
          <p className="section-help">Controle quais cards aparecem para cada perfil e coloque painéis em manutenção quando necessário.</p>
          <div className="module-config-list">
            {modulos.map((modulo) => (
              <ModuleConfigItem key={modulo.chave} modulo={modulo} onSave={handleSaveModulo} />
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === 'campeoes' ? <AdminCampeoesSeguranca /> : null}

      {activeTab === 'notificacoes' ? <AdminNotifications /> : null}

      {activeTab === 'acoes' ? (
        <section className="admin-section">
          <h2>Gerenciar Ações e Encontros</h2>
          <p className="section-help">Publique registros, imagens e encaminhamentos da CIPA, Café com o Gerente e Comitê de Gente. Todos visualizam na Central do Colaborador; somente admin altera.</p>

          <form className="admin-form action-form" onSubmit={handleCreateAcao}>
            <div className="form-grid">
              <label>
                Tipo de publicacao
                <select value={acaoForm.categoria} onChange={(e) => setAcaoForm({ ...acaoForm, categoria: e.target.value })}>
                  {actionCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label>
                Titulo
                <input value={acaoForm.titulo} onChange={(e) => setAcaoForm({ ...acaoForm, titulo: e.target.value })} required />
              </label>
              <label>
                Data da acao
                <input type="date" value={acaoForm.data_evento} onChange={(e) => setAcaoForm({ ...acaoForm, data_evento: e.target.value })} />
              </label>
              <label>
                Responsável ou área
                <input value={acaoForm.responsavel} onChange={(e) => setAcaoForm({ ...acaoForm, responsavel: e.target.value })} />
              </label>
              <label>
                Status
                <select value={acaoForm.status} onChange={(e) => setAcaoForm({ ...acaoForm, status: e.target.value, ativo: e.target.value === 'publicado' })}>
                  <option value="publicado">Publicado</option>
                  <option value="oculto">Oculto</option>
                  <option value="rascunho">Rascunho</option>
                </select>
              </label>
              <label>
                Imagem/banner
                <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setAcaoForm({ ...acaoForm, imagem: e.target.files[0] || null })} />
              </label>
              <label className="wide-field">
                Descricao
                <textarea value={acaoForm.descricao} onChange={(e) => setAcaoForm({ ...acaoForm, descricao: e.target.value })} rows="4" required />
              </label>
              <label className="wide-field">
                Encaminhamento
                <textarea value={acaoForm.encaminhamento} onChange={(e) => setAcaoForm({ ...acaoForm, encaminhamento: e.target.value })} rows="3" />
              </label>
            </div>
            <label className="inline-check">
              <input type="checkbox" checked={acaoForm.ativo} onChange={(e) => setAcaoForm({ ...acaoForm, ativo: e.target.checked })} />
              Publicar imediatamente
            </label>
            <button type="submit">Publicar no carrossel</button>
          </form>

          <div className="actions-admin-filter">
            <label>
              Filtrar por categoria
              <select value={acaoAdminFilter} onChange={(e) => setAcaoAdminFilter(e.target.value)}>
                <option value="todas">Todas</option>
                {actionCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <div className="actions-admin-list">
            {filteredAcoes.map((item) => (
              <article className="actions-admin-item" key={item.id}>
                <AdminActionImage item={item} />
                <div>
                  <span>{labelForActionCategory(item.categoria)}</span>
                  <h3>{item.titulo}</h3>
                  <p>{item.descricao}</p>
                  <small>{item.ativo ? 'Publicado' : 'Oculto'} {item.data_evento ? `- ${item.data_evento}` : ''} {item.responsavel ? `- ${item.responsavel}` : ''} {item.status ? `- ${item.status}` : ''}</small>
                  {item.encaminhamento ? <p><strong>Encaminhamento:</strong> {item.encaminhamento}</p> : null}
                  <div className="row-actions">
                    <button onClick={() => startEditAcao(item)}>Editar</button>
                    <button onClick={() => handleToggleAcao(item)}>{item.ativo ? 'Ocultar' : 'Publicar'}</button>
                    <button onClick={() => deleteAcao(item.id).then(refresh)}>Excluir</button>
                  </div>
                  {editingAcaoId === item.id ? (
                    <form className="admin-form action-edit-form" onSubmit={handleUpdateAcao}>
                      <div className="form-grid">
                        <label>
                          Tipo de publicacao
                          <select value={acaoEditForm.categoria} onChange={(e) => setAcaoEditForm({ ...acaoEditForm, categoria: e.target.value })}>
                            {actionCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                          </select>
                        </label>
                        <label>
                          Titulo
                          <input value={acaoEditForm.titulo} onChange={(e) => setAcaoEditForm({ ...acaoEditForm, titulo: e.target.value })} required />
                        </label>
                        <label>
                          Data da acao
                          <input type="date" value={acaoEditForm.data_evento} onChange={(e) => setAcaoEditForm({ ...acaoEditForm, data_evento: e.target.value })} />
                        </label>
                        <label>
                          Responsável ou área
                          <input value={acaoEditForm.responsavel} onChange={(e) => setAcaoEditForm({ ...acaoEditForm, responsavel: e.target.value })} />
                        </label>
                        <label>
                          Status
                          <select value={acaoEditForm.status} onChange={(e) => setAcaoEditForm({ ...acaoEditForm, status: e.target.value, ativo: e.target.value === 'publicado' })}>
                            <option value="publicado">Publicado</option>
                            <option value="oculto">Oculto</option>
                            <option value="rascunho">Rascunho</option>
                          </select>
                        </label>
                        <label>
                          Trocar imagem
                          <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setAcaoEditForm({ ...acaoEditForm, imagem: e.target.files[0] || null })} />
                        </label>
                        <label className="wide-field">
                          Descricao
                          <textarea value={acaoEditForm.descricao} onChange={(e) => setAcaoEditForm({ ...acaoEditForm, descricao: e.target.value })} rows="4" required />
                        </label>
                        <label className="wide-field">
                          Encaminhamento
                          <textarea value={acaoEditForm.encaminhamento} onChange={(e) => setAcaoEditForm({ ...acaoEditForm, encaminhamento: e.target.value })} rows="3" />
                        </label>
                      </div>
                      <label className="inline-check">
                        <input type="checkbox" checked={acaoEditForm.ativo} onChange={(e) => setAcaoEditForm({ ...acaoEditForm, ativo: e.target.checked })} />
                        Publicar
                      </label>
                      <div className="row-actions">
                        <button type="submit">Salvar alterações</button>
                        <button type="button" onClick={cancelEditAcao}>Cancelar</button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
