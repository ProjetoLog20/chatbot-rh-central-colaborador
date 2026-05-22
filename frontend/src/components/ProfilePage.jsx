import { useEffect, useState } from 'react';
import { getProfile } from '../api.js';

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
        {Object.entries(profile).map(([key, value]) => (
          <div key={key} className="detail-row">
            <span>{key.replace('_', ' ').toUpperCase()}</span>
            <strong>{value || '-'}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
