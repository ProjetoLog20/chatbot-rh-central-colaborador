import { useEffect, useState } from 'react';
import {
  getCollaborators,
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
  resetCollaboratorPassword
} from '../api.js';

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
    description: 'Cadastre ou atualize matricula, perfil, setor, unidade, contato e status.',
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
    title: 'Base do chatbot',
    description: 'Alimente perguntas, respostas e categorias usadas pela IA em modo local.',
    path: '/import/respostas_chatbot'
  }
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('excel');
  const [colaboradores, setColaboradores] = useState([]);
  const [prontuarios, setProntuarios] = useState([]);
  const [respostas, setRespostas] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [message, setMessage] = useState('');
  const [importErrors, setImportErrors] = useState(null);
  const [respostaText, setRespostaText] = useState({ pergunta: '', resposta: '', categoria: '', ativo: true });
  const [acaoForm, setAcaoForm] = useState({
    categoria: 'cipa',
    titulo: '',
    descricao: '',
    data_evento: '',
    imagem: null,
    ativo: true
  });

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const [col, pr, resp, acoesData] = await Promise.all([getCollaborators(), getProntuarios(), getRespostas(), getAdminAcoes()]);
      setColaboradores(col);
      setProntuarios(pr);
      setRespostas(resp);
      setAcoes(acoesData);
    } catch (err) {
      console.error(err);
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

  async function handleCreateAcao(e) {
    e.preventDefault();
    if (!acaoForm.imagem) {
      setMessage('Selecione uma imagem para publicar a acao.');
      return;
    }

    try {
      await createAcao({
        categoria: acaoForm.categoria,
        titulo: acaoForm.titulo,
        descricao: acaoForm.descricao,
        data_evento: acaoForm.data_evento,
        ativo: acaoForm.ativo ? 1 : 0,
        imagem: acaoForm.imagem
      });
      setMessage('Acao publicada com sucesso.');
      setAcaoForm({ categoria: 'cipa', titulo: '', descricao: '', data_evento: '', imagem: null, ativo: true });
      e.target.reset();
      refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao publicar acao');
    }
  }

  async function handleToggleAcao(item) {
    try {
      await updateAcao(item.id, { ...item, ativo: item.ativo ? 0 : 1 });
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

  return (
    <div className="page-card admin-card">
      <div className="admin-heading">
        <div>
          <h1>Central do Administrador</h1>
          <p>Baixe modelos Excel, preencha os dados e envie para atualizar a Central do Colaborador.</p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Areas administrativas">
        <button className={activeTab === 'excel' ? 'active' : ''} onClick={() => setActiveTab('excel')}>Exportar para a pagina via Excel</button>
        <button className={activeTab === 'dados' ? 'active' : ''} onClick={() => setActiveTab('dados')}>Dados publicados</button>
        <button className={activeTab === 'acoes' ? 'active' : ''} onClick={() => setActiveTab('acoes')}>Acoes e Eventos</button>
        <button className={activeTab === 'chatbot' ? 'active' : ''} onClick={() => setActiveTab('chatbot')}>Chatbot</button>
      </div>

      {message && <div className="import-message">{message}</div>}

      {activeTab === 'dados' ? (
        <>
          <section className="admin-section">
            <h2>Colaboradores</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Matricula</th><th>Nome</th><th>Perfil</th><th>Status</th><th>Primeiro acesso</th><th>Acoes</th></tr>
                </thead>
                <tbody>
                  {colaboradores.map((item) => (
                    <tr key={item.id}>
                      <td>{item.matricula}</td>
                      <td>{item.nome_preferido || item.nome_completo}</td>
                      <td>{item.perfil}</td>
                      <td>{item.status}</td>
                      <td>{item.primeiro_acesso || item.senha_temporaria ? 'Pendente' : 'Concluido'}</td>
                      <td><button onClick={() => handleResetPassword(item)}>Resetar senha</button></td>
                    </tr>
                  ))}
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
          <h2>Exportar dados para a pagina</h2>
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
          <h2>Respostas do Chatbot</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Categoria</th><th>Pergunta</th><th>Resposta</th><th>Ativo</th><th>Acoes</th></tr>
              </thead>
              <tbody>
                {respostas.map((item) => (
                  <tr key={item.id}>
                    <td>{item.categoria}</td>
                    <td>{item.pergunta}</td>
                    <td>{item.resposta}</td>
                    <td>{item.ativo ? 'Sim' : 'Nao'}</td>
                    <td>
                      <button onClick={() => handleToggleResposta(item)}>{item.ativo ? 'Desativar' : 'Ativar'}</button>
                      <button onClick={() => deleteResposta(item.id).then(refresh)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {activeTab === 'acoes' ? (
        <section className="admin-section">
          <h2>Acoes da CIPA e Cafe com o Gerente</h2>
          <p className="section-help">Publique imagens e descricoes das reunioes e encontros. Todos visualizam na Central do Colaborador; somente admin altera.</p>

          <form className="admin-form action-form" onSubmit={handleCreateAcao}>
            <div className="form-grid">
              <label>
                Tipo de publicacao
                <select value={acaoForm.categoria} onChange={(e) => setAcaoForm({ ...acaoForm, categoria: e.target.value })}>
                  <option value="cipa">CIPA</option>
                  <option value="cafe_com_gerente">Cafe com o Gerente</option>
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
                Imagem
                <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setAcaoForm({ ...acaoForm, imagem: e.target.files[0] })} required />
              </label>
              <label className="wide-field">
                Descricao
                <textarea value={acaoForm.descricao} onChange={(e) => setAcaoForm({ ...acaoForm, descricao: e.target.value })} rows="4" required />
              </label>
            </div>
            <label className="inline-check">
              <input type="checkbox" checked={acaoForm.ativo} onChange={(e) => setAcaoForm({ ...acaoForm, ativo: e.target.checked })} />
              Publicar imediatamente
            </label>
            <button type="submit">Publicar no carrossel</button>
          </form>

          <div className="actions-admin-list">
            {acoes.map((item) => (
              <article className="actions-admin-item" key={item.id}>
                <AdminActionImage item={item} />
                <div>
                  <span>{item.categoria === 'cafe_com_gerente' ? 'Cafe com o Gerente' : 'CIPA'}</span>
                  <h3>{item.titulo}</h3>
                  <p>{item.descricao}</p>
                  <small>{item.ativo ? 'Publicado' : 'Oculto'} {item.data_evento ? `- ${item.data_evento}` : ''}</small>
                  <div className="row-actions">
                    <button onClick={() => handleToggleAcao(item)}>{item.ativo ? 'Ocultar' : 'Publicar'}</button>
                    <button onClick={() => deleteAcao(item.id).then(refresh)}>Excluir</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
