import { useEffect, useMemo, useState } from 'react';
import { getCampeoesSegurancaPublicos } from '../api.js';

const criteria = [
  ['log_on_100', 'Log On 100%'],
  ['participacao_matinais', 'Participacao em matinais'],
  ['sem_acidentes', 'Sem acidentes'],
  ['sem_fluxo_punitivo', 'Sem fluxo punitivo por seguranca nos ultimos 8 meses']
];

function initials(name) {
  return String(name || 'CS')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CS';
}

function formatCompetencia(value) {
  if (!value) return '-';
  const [year, month] = String(value).split('-');
  if (year?.length === 4 && month) return `${month}/${year}`;
  return value;
}

function CampeaoPhoto({ item }) {
  if (item.foto_url) {
    return <img src={item.foto_url} alt={item.nome_colaborador} />;
  }
  return <div className="champion-avatar-fallback">{initials(item.nome_colaborador)}</div>;
}

export function CampeaoSegurancaCard({ item }) {
  return (
    <article className="champion-card">
      <div className="champion-photo-wrap">
        <CampeaoPhoto item={item} />
        <span className="champion-medal" aria-hidden="true">★</span>
      </div>
      <div className="champion-copy">
        <span className="champion-month">{formatCompetencia(item.competencia)}</span>
        <h2>{item.nome_colaborador}</h2>
        <p className="champion-role">{item.cargo || '-'} {item.setor ? `- ${item.setor}` : ''}</p>
        <p className="champion-reason">{item.motivo_reconhecimento}</p>
        <div className="champion-checklist">
          {criteria.map(([key, label]) => (
            <span key={key} className={item[key] ? 'done' : 'pending'}>
              {item[key] ? '✓' : '-'} {label}
            </span>
          ))}
        </div>
        {item.observacao ? <p className="champion-note">{item.observacao}</p> : null}
      </div>
    </article>
  );
}

export default function CampeaoSegurancaPage() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const sorted = useMemo(() => [...items].sort((a, b) => String(b.competencia).localeCompare(String(a.competencia))), [items]);

  useEffect(() => {
    getCampeoesSegurancaPublicos()
      .then(setItems)
      .catch((err) => setMessage(err.error || 'Erro ao carregar campeoes de seguranca.'));
  }, []);

  return (
    <div className="champion-page">
      <section className="champion-hero">
        <div>
          <span>Reconhecimento LOG20</span>
          <h1>Campeao de Seguranca</h1>
          <p>Colaboradores reconhecidos por atitude segura, disciplina operacional e exemplo para o time.</p>
        </div>
      </section>

      {message ? <div className="empty-state">{message}</div> : null}
      {!message && !sorted.length ? <div className="empty-state">Nenhum campeao publicado no momento.</div> : null}

      <section className="champion-grid">
        {sorted.map((item) => <CampeaoSegurancaCard key={item.id} item={item} />)}
      </section>
    </div>
  );
}

export { criteria as campeaoCriteria, initials as campeaoInitials, formatCompetencia };
