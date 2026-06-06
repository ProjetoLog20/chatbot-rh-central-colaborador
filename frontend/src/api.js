const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: getHeaders(token)
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro de requisição' };
  return body;
}

export async function login(matricula, senha) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ matricula, senha })
  });
}

export async function primeiroAcesso(payload) {
  return request('/auth/primeiro-acesso', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getProfile() {
  return request('/colaboradores/me');
}

export async function getProntuarioMe() {
  return request('/prontuario/meu');
}

export async function getCollaborators() {
  return request('/colaboradores');
}

export async function resetCollaboratorPassword(id) {
  return request(`/colaboradores/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ resetarSenha: true })
  });
}

export async function getProntuarios() {
  const result = await request('/prontuario/admin');
  return result.rows || result;
}

export async function getAdminProntuarios(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/prontuario/admin${query ? `?${query}` : ''}`);
}

export async function getAdminProntuarioDetail(colaboradorId) {
  return request(`/prontuario/admin/${colaboradorId}`);
}

export async function importProntuarioFile(file) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/prontuario/importar`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro na importacao de prontuario' };
  return body;
}

export async function exportAdminProntuarios(filters = {}) {
  const token = localStorage.getItem('token');
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  const res = await fetch(`${API_BASE}/prontuario/admin/exportar${query ? `?${query}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw body || { error: 'Erro ao exportar prontuarios' };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'relatorio_prontuarios_motoristas.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function getMeuSkap() {
  return request('/skap/meu');
}

export async function getAdminSkap(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/skap/admin${query ? `?${query}` : ''}`);
}

export async function getAdminSkapDetail(colaboradorId) {
  return request(`/skap/admin/${colaboradorId}`);
}

export async function checkAdminSkapPercentuais() {
  return request('/skap/admin/check-percentuais');
}

export async function updateAdminSkap(colaboradorId, payload) {
  return request(`/skap/admin/${colaboradorId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function importSkapFile(file) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/skap/importar`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro na importacao SKAP' };
  return body;
}

export async function getMeuProdutividade() {
  return request('/produtividade/meu');
}

export async function getAdminProdutividade(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/produtividade/admin${query ? `?${query}` : ''}`);
}

export async function getAdminProdutividadeResumo(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/produtividade/admin/resumo${query ? `?${query}` : ''}`);
}

export async function getAdminProdutividadeDetail(colaboradorId) {
  return request(`/produtividade/admin/${colaboradorId}`);
}

export async function importProdutividadeFile(file) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/produtividade/importar`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro na importacao de RV' };
  return body;
}

export async function exportAdminProdutividade(filters = {}) {
  const token = localStorage.getItem('token');
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  const res = await fetch(`${API_BASE}/produtividade/admin/exportar${query ? `?${query}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw body || { error: 'Erro ao exportar produtividade' };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'relatorio_produtividade_rv.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function getMeuProdutividadeArmazem() {
  return request('/produtividade-armazem/meu');
}

export async function getAdminProdutividadeArmazem(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/produtividade-armazem/admin${query ? `?${query}` : ''}`);
}

export async function getAdminProdutividadeArmazemResumo(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/produtividade-armazem/admin/resumo${query ? `?${query}` : ''}`);
}

export async function getAdminProdutividadeArmazemDetail(colaboradorId) {
  return request(`/produtividade-armazem/admin/${colaboradorId}`);
}

export async function importProdutividadeArmazemFile(file) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/produtividade-armazem/importar`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro na importacao de RV Armazem' };
  return body;
}

export async function exportAdminProdutividadeArmazem(filters = {}) {
  const token = localStorage.getItem('token');
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  const res = await fetch(`${API_BASE}/produtividade-armazem/admin/exportar${query ? `?${query}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw body || { error: 'Erro ao exportar produtividade do armazem' };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'relatorio_produtividade_armazem.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
 
export async function getRespostas() {
  return request('/respostas_chatbot');
}

export async function getChatbotSuggestions() {
  return request('/respostas_chatbot/sugestoes');
}

export async function getPublicAcoes() {
  return request('/acoes-encontros');
}

export async function getModulos() {
  return request('/modulos');
}

export async function getAdminModulos() {
  return request('/admin/modulos');
}

export async function updateAdminModulo(chave, payload) {
  return request(`/admin/modulos/${chave}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function getAdminAcoes() {
  return request('/admin/acoes-encontros');
}

export async function getCampeoesSegurancaPublicos() {
  return request('/campeoes-seguranca/publicos');
}

export async function getRotogramas(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  const query = params.toString();
  return request(`/rotogramas${query ? `?${query}` : ''}`);
}

export async function getRotogramaOpcoes() {
  return request('/rotogramas/opcoes');
}

export async function getRotogramaDetail(id) {
  return request(`/rotogramas/${id}`);
}

export async function getRotogramaMateriais() {
  return request('/rotogramas/materiais');
}

export async function getAdminRotogramaResumo() {
  return request('/rotogramas/admin/resumo');
}

export async function importRotogramaFile(file) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/rotogramas/importar`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro na importacao de rotogramas' };
  return body;
}

export async function getAdminCampeoesSeguranca() {
  return request('/campeoes-seguranca/admin');
}

function appendCampeaoFormData(payload) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) formData.append(key, value);
  });
  return formData;
}

export async function createCampeaoSeguranca(payload) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/campeoes-seguranca/admin`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: appendCampeaoFormData(payload)
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro ao cadastrar campeao' };
  return body;
}

export async function updateCampeaoSeguranca(id, payload) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/campeoes-seguranca/admin/${id}`, {
    method: 'PUT',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: appendCampeaoFormData(payload)
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro ao atualizar campeao' };
  return body;
}

export async function deleteCampeaoSeguranca(id) {
  return request(`/campeoes-seguranca/admin/${id}`, { method: 'DELETE' });
}

export async function createAcao(payload) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) formData.append(key, value);
  });

  const res = await fetch(`${API_BASE}/admin/acoes-encontros`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro ao criar acao' };
  return body;
}

export async function updateAcao(id, payload) {
  if (payload?.imagem) {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) formData.append(key, value);
    });

    const res = await fetch(`${API_BASE}/admin/acoes-encontros/${id}`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw body || { error: 'Erro ao atualizar acao' };
    return body;
  }

  return request(`/admin/acoes-encontros/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteAcao(id) {
  return request(`/admin/acoes-encontros/${id}`, { method: 'DELETE' });
}

export async function createResposta(payload) {
  return request('/respostas_chatbot', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateResposta(id, payload) {
  return request(`/respostas_chatbot/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteResposta(id) {
  return request(`/respostas_chatbot/${id}`, { method: 'DELETE' });
}

export async function importFile(path, file) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw body || { error: 'Erro na importação' };
  return body;
}

export async function downloadImportTemplate(type) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/import/modelos/${type}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw body || { error: 'Erro ao baixar modelo' };
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `modelo_${type}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function askChatbot(question, previousResponseId) {
  return request('/chatbot/assistance', {
    method: 'POST',
    body: JSON.stringify({ question, previousResponseId })
  });
}

export async function askYuri(message, history = []) {
  return request('/yuri/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history })
  });
}
