import { useEffect, useState } from 'react';
import { getProfile } from '../api.js';

const profileLabels = {
  matricula: 'Matrícula',
  nome_completo: 'Nome completo',
  nome_preferido: 'Nome preferido',
  perfil: 'Perfil de acesso',
  cargo: 'Cargo',
  setor: 'Setor',
  unidade: 'Unidade',
  operacao: 'Operacao',
  atividade: 'Atividade',
  tipo_colaborador: 'Tipo de colaborador',
  status: 'Status'
};

const hiddenProfileFields = new Set(['id', 'senha_hash', 'senha_temporaria', 'primeiro_acesso']);

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getProfile().then(setProfile).catch((err) => setError(err.error || 'Não foi possível carregar os dados'));
  }, []);

  if (error) return <div className="page-card"><p className="form-error">{error}</p></div>;
  if (!profile) return <div className="page-card"><p>Carregando...</p></div>;

  return (
    <div className="page-card">
      <h1>Meus Dados</h1>
      <div className="detail-grid">
        {Object.entries(profile).filter(([key]) => !hiddenProfileFields.has(key)).map(([key, value]) => (
          <div key={key} className="detail-row">
            <span>{profileLabels[key] || key.replaceAll('_', ' ')}</span>
            <strong>{value || '-'}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
