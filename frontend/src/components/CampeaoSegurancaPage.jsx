import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCampeoesSegurancaPublicos } from '../api.js';

const criteria = [
  ['log_on_100', 'Log On 100%'],
  ['participacao_matinais', 'Participacao em matinais'],
  ['sem_acidentes', 'Sem acidentes'],
  ['sem_fluxo_punitivo', 'Sem fluxo punitivo por segurança nos últimos 8 meses']
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

function isAdminUser(user) {
  return String(user?.perfil || '').trim().toLowerCase() === 'admin';
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

const criteriaInfo = [
  ['Log On 100%', 'Manter presença e participação nas rotinas de segurança.'],
  ['Participação em matinais', 'Participar dos alinhamentos e reforços diários de segurança.'],
  ['Não ter acidentes', 'Cumprir práticas seguras e atuar de forma preventiva durante a operação.'],
  ['Não ter fluxo punitivo por segurança nos últimos 8 meses', 'Manter histórico disciplinar adequado em segurança.']
];

const assignments = [
  ['Orientar atos inseguros', 'Orientar os colaboradores quando observar qualquer ato inseguro.'],
  ['Passar recados de segurança', 'Passar recados de segurança e participar das matinais de segurança.'],
  ['Solicitar conformidade ou manutenção', 'Solicitar conformidade ou manutenção quando algo estiver prejudicando ou colocando a segurança das pessoas em risco.'],
  ['Participar de treinamentos', 'Participar de treinamentos quando solicitado.'],
  ['Cobrar comportamento seguro', 'Cobrar comportamentos seguros dos colegas e da liderança.'],
  ['Comunicar riscos ao TST', 'Comunicar ao TST da unidade/transportadora quando observar risco iminente.']
];

function InfoCard({ title, text, icon = '✓' }) {
  return (
    <article className="champion-info-card" tabIndex="0">
      <span aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

export default function CampeaoSegurancaPage({ user }) {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const sorted = useMemo(() => [...items].sort((a, b) => String(b.competencia).localeCompare(String(a.competencia))), [items]);
  const isAdmin = isAdminUser(user);

  useEffect(() => {
    getCampeoesSegurancaPublicos()
      .then(setItems)
      .catch((err) => setMessage(err.error || 'Erro ao carregar campeões de segurança.'));
  }, []);

  return (
    <div className="champion-page">
      <section className="champion-hero">
        <div>
          <span>Reconhecimento LOG20</span>
          <h1>Campeão de Segurança</h1>
          <p>Colaboradores reconhecidos por atitude segura, disciplina operacional e exemplo para o time.</p>
        </div>
        {isAdmin ? (
          <div className="champion-admin-actions">
            <Link to="/admin">Cadastrar Campeão</Link>
            <Link to="/admin">Gerenciar Campeões</Link>
          </div>
        ) : null}
      </section>

      <section className="champion-section">
        <div className="champion-section-heading">
          <span>Mural dos Campeões</span>
          <h2>Mural dos Campeões</h2>
        </div>
        {message ? <div className="empty-state">{message}</div> : null}
        {!message && !sorted.length ? <div className="empty-state">Nenhum campeão publicado no momento.</div> : null}

        <div className="champion-grid">
          {sorted.map((item) => <CampeaoSegurancaCard key={item.id} item={item} />)}
        </div>
      </section>

      <section className="champion-info-band champion-what">
        <div>
          <span>O que é</span>
          <h2>O que é o Campeão de Segurança?</h2>
          <p>O Campeão de Segurança é o colaborador que se destaca por atitudes seguras, disciplina operacional e exemplo para o time. Ele ajuda a fortalecer a cultura de segurança, orientando colegas e apoiando a prevenção de riscos no dia a dia.</p>
        </div>
        <strong>Segurança vem antes de qualquer meta.</strong>
      </section>

      <section className="champion-section">
        <div className="champion-section-heading">
          <span>Trilha de reconhecimento</span>
          <h2>Como se tornar Campeão de Segurança?</h2>
          <p>Para ser reconhecido, o colaborador deve manter uma rotina segura e cumprir os principais critérios de segurança.</p>
        </div>
        <div className="champion-info-grid">
          {criteriaInfo.map(([title, text]) => <InfoCard key={title} title={title} text={text} icon="✓" />)}
          <article className="champion-trophy-card" aria-label="Reconhecimento final">
            <span aria-hidden="true">★</span>
            <strong>Reconhecimento</strong>
          </article>
        </div>
      </section>

      <section className="champion-section">
        <div className="champion-section-heading">
          <span>Papel ativo</span>
          <h2>Atribuições do Campeão</h2>
          <p>O Campeão de Segurança também tem papel ativo em orientar, comunicar e fortalecer comportamentos seguros.</p>
        </div>
        <div className="champion-info-grid assignments">
          {assignments.map(([title, text]) => <InfoCard key={title} title={title} text={text} icon="盾" />)}
        </div>
      </section>

      <section className="champion-policy-callout">
        <p>Nem metas de produção ou desafios financeiros são desculpa para o descumprimento da Política de Segurança.</p>
      </section>
    </div>
  );
}

export { criteria as campeaoCriteria, initials as campeaoInitials, formatCompetencia };
