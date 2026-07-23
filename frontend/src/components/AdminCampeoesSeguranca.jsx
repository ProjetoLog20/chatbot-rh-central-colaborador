import { useEffect, useMemo, useState } from 'react';
import {
  createCampeaoSeguranca,
  deleteCampeaoSeguranca,
  getAdminCampeoesSeguranca,
  getCollaborators,
  updateCampeaoSeguranca
} from '../api.js';
import { CampeaoSegurancaCard, campeaoCriteria, formatCompetencia } from './CampeaoSegurancaPage.jsx';

const initialForm = {
  id: null,
  colaborador_id: '',
  competencia: '',
  nome_colaborador: '',
  matricula: '',
  cargo: '',
  setor: '',
  motivo_reconhecimento: '',
  log_on_100: false,
  participacao_matinais: false,
  sem_acidentes: false,
  sem_fluxo_punitivo: false,
  observacao: '',
  status: 'rascunho',
  foto: null,
  foto_url: '',
  remover_foto: false
};

function bool(value) {
  return value === true || value === 1 || value === '1';
}

export default function AdminCampeoesSeguranca() {
  const [items, setItems] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);

  const selectedPreview = preview || (!form.remover_foto ? form.foto_url : '');
  const collaboratorOptions = useMemo(() => colaboradores.map((item) => ({
    ...item,
    label: `${item.matricula} - ${item.nome_preferido || item.nome_completo}`
  })), [colaboradores]);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const [champions, users] = await Promise.all([getAdminCampeoesSeguranca(), getCollaborators()]);
    setItems(champions);
    setColaboradores(users);
  }

  function resetForm() {
    setForm(initialForm);
    setPreview('');
    setShowForm(false);
  }

  function selectColaborador(id) {
    const item = colaboradores.find((colaborador) => String(colaborador.id) === String(id));
    setForm((current) => ({
      ...current,
      colaborador_id: id,
      nome_colaborador: item?.nome_preferido || item?.nome_completo || '',
      matricula: item?.matricula || '',
      cargo: item?.cargo || '',
      setor: item?.setor || ''
    }));
  }

  function handlePhoto(file) {
    if (!file) return;
    setForm((current) => ({ ...current, foto: file, remover_foto: false }));
    setPreview(URL.createObjectURL(file));
  }

  function startEdit(item) {
    setForm({
      id: item.id,
      colaborador_id: item.colaborador_id || '',
      competencia: item.competencia || '',
      nome_colaborador: item.nome_colaborador || '',
      matricula: item.matricula || '',
      cargo: item.cargo || '',
      setor: item.setor || '',
      motivo_reconhecimento: item.motivo_reconhecimento || '',
      log_on_100: bool(item.log_on_100),
      participacao_matinais: bool(item.participacao_matinais),
      sem_acidentes: bool(item.sem_acidentes),
      sem_fluxo_punitivo: bool(item.sem_fluxo_punitivo),
      observacao: item.observacao || '',
      status: item.status || 'rascunho',
      foto: null,
      foto_url: item.foto_url || '',
      remover_foto: false
    });
    setPreview('');
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');

    const payload = {
      ...form,
      log_on_100: form.log_on_100 ? '1' : '0',
      participacao_matinais: form.participacao_matinais ? '1' : '0',
      sem_acidentes: form.sem_acidentes ? '1' : '0',
      sem_fluxo_punitivo: form.sem_fluxo_punitivo ? '1' : '0',
      remover_foto: form.remover_foto ? '1' : '0'
    };

    try {
      if (form.id) await updateCampeaoSeguranca(form.id, payload);
      else await createCampeaoSeguranca(payload);
      setMessage('Campeão de segurança salvo.');
      resetForm();
      await refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao salvar campeão de segurança');
    }
  }

  async function handleDelete(id) {
    try {
      await deleteCampeaoSeguranca(id);
      setMessage('Campeao excluido.');
      await refresh();
    } catch (err) {
      setMessage(err.error || 'Erro ao excluir campeao');
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-heading">
        <div>
          <h2>Campeão de Segurança</h2>
          <p>Cadastre e publique reconhecimentos de segurança para o mural.</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)}>Cadastrar campeao</button>
      </div>

      {message ? <div className="import-message">{message}</div> : null}

      {showForm ? (
        <form className="admin-form champion-admin-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Competência/mês
              <input type="month" value={form.competencia} onChange={(event) => setForm({ ...form, competencia: event.target.value })} required />
            </label>
            <label>
              Colaborador
              <select value={form.colaborador_id} onChange={(event) => selectColaborador(event.target.value)}>
                <option value="">Selecione por nome ou matrícula</option>
                {collaboratorOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              Matrícula
              <input value={form.matricula} onChange={(event) => setForm({ ...form, matricula: event.target.value })} required />
            </label>
            <label>
              Nome
              <input value={form.nome_colaborador} onChange={(event) => setForm({ ...form, nome_colaborador: event.target.value })} required />
            </label>
            <label>
              Cargo
              <input value={form.cargo} onChange={(event) => setForm({ ...form, cargo: event.target.value })} />
            </label>
            <label>
              Setor
              <input value={form.setor} onChange={(event) => setForm({ ...form, setor: event.target.value })} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="rascunho">Rascunho</option>
                <option value="publicado">Publicado</option>
              </select>
            </label>
            <label>
              Foto do campeao
              <input type="file" accept=".jpg,.jpeg,.png" onChange={(event) => handlePhoto(event.target.files[0])} />
            </label>
            <label className="wide-field">
              Motivo do reconhecimento
              <textarea rows="3" value={form.motivo_reconhecimento} onChange={(event) => setForm({ ...form, motivo_reconhecimento: event.target.value })} required />
            </label>
            <label className="wide-field">
              Observacao
              <textarea rows="2" value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} />
            </label>
          </div>

          {selectedPreview ? (
            <div className="champion-photo-preview">
              <img src={selectedPreview} alt="Pre-visualizacao" />
              <button type="button" onClick={() => {
                setForm({ ...form, foto: null, remover_foto: true });
                setPreview('');
              }}>Remover foto</button>
            </div>
          ) : null}

          <div className="module-check-grid">
            {campeaoCriteria.map(([key, label]) => (
              <label className="inline-check" key={key}>
                <input type="checkbox" checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />
                {label}
              </label>
            ))}
          </div>

          <div className="row-actions">
            <button type="submit">Salvar campeao</button>
            <button type="button" onClick={resetForm}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <div className="champion-admin-list">
        {items.map((item) => (
          <div className="champion-admin-item" key={item.id}>
            <CampeaoSegurancaCard item={item} />
            <div className="row-actions">
              <span>{formatCompetencia(item.competencia)} - {item.status}</span>
              <button type="button" onClick={() => startEdit(item)}>Editar</button>
              <button type="button" onClick={() => handleDelete(item.id)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
