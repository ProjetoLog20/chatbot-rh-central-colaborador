import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMeuSkap, getProntuarioMe, getPublicAcoes } from '../api.js';
import ActionsCarousel from './ActionsCarousel.jsx';

const generalCards = [
  {
    id: 'pesquisa',
    icon: '📊',
    title: 'Pesquisa de Clima',
    description: 'Acompanhe e participe das pesquisas de satisfação da empresa.',
    action: 'Acessar pesquisa',
    color: '#005A8C',
    route: '/pesquisa-clima'
  },
  {
    id: 'skap',
    icon: '🎖️',
    title: 'SKAP',
    description: 'Consulte sua evolução, nível atual e habilidades avaliadas pela liderança.',
    action: 'Ver meu SKAP',
    color: '#003B68',
    route: '/skap'
  },
  {
    id: 'campeao',
    icon: '🏆',
    title: 'Campeão de Segurança',
    description: 'Reconheça atitudes seguras e acompanhe destaques da operação.',
    action: 'Acessar',
    color: '#E87522',
    route: '/profile'
  },
  {
    id: 'tres-rs',
    icon: '♻️',
    title: '3 Rs',
    description: 'Registre e acompanhe ações de reduzir, reutilizar e reciclar.',
    action: 'Acessar',
    color: '#005A8C',
    route: '/profile'
  },
  {
    id: 'produtividade',
    icon: '⭐',
    title: 'Prêmio de Produtividade',
    description: 'Veja reconhecimentos, metas e resultados de produtividade.',
    action: 'Acessar',
    color: '#003B68',
    route: '/profile'
  },
  {
    id: 'prontuario',
    icon: '🚛',
    title: 'Prontuário do Motorista',
    description: 'Consulte sua pontuação, faixa atual e orientações de evolução.',
    action: 'Ver prontuário',
    color: '#E87522',
    route: '/motorista'
  },
  {
    id: 'ouvidoria',
    icon: '📣',
    title: 'Ouvidoria',
    description: 'Acesse o canal oficial para registrar solicitações, dúvidas ou relatos.',
    action: 'Abrir canal',
    color: '#003B68',
    href: 'https://www.log20.com.br/ouvidorias'
  }
];

const adminCard = {
  id: 'admin',
  icon: '🛠️',
  title: 'Central do Administrador',
  description: 'Gerencie colaboradores, importações, indicadores e configurações do sistema.',
  action: 'Acessar painel',
  color: '#E87522',
  route: '/admin',
  badge: 'Admin',
  featured: true
};

function getFirstName(user) {
  const name = user?.nome_preferido || user?.nome_completo || 'colaborador';
  return String(name).trim().split(/\s+/)[0] || 'colaborador';
}

function DashboardCard({ card, index }) {
  const content = (
    <>
      <div className="dashboard-card-top">
        <span className="dashboard-card-icon" aria-hidden="true">{card.icon}</span>
        {card.badge ? <span className="dashboard-card-badge">{card.badge}</span> : null}
      </div>
      <div className="dashboard-card-copy">
        <h3>{card.title}</h3>
        <p>{card.description}</p>
      </div>
      <span className="dashboard-card-action">{card.action}</span>
    </>
  );

  const style = {
    borderTopColor: card.color,
    animationDelay: `${index * 70}ms`
  };

  if (card.disabled) {
    return (
      <article className="dashboard-card-item dashboard-card-disabled" style={style}>
        {content}
      </article>
    );
  }

  if (card.href) {
    return (
      <a className={`dashboard-card-item ${card.featured ? 'dashboard-card-featured' : ''}`} style={style} href={card.href} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }

  return (
    <Link className={`dashboard-card-item ${card.featured ? 'dashboard-card-featured' : ''}`} style={style} to={card.route}>
      {content}
    </Link>
  );
}

export default function Dashboard({ user }) {
  const [acoes, setAcoes] = useState([]);
  const [skap, setSkap] = useState(null);
  const [prontuario, setProntuario] = useState(null);
  const isAdmin = user?.perfil === 'admin';
  const isMotorista = user?.perfil === 'motorista';

  useEffect(() => {
    getPublicAcoes()
      .then(setAcoes)
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!user || isAdmin) return;

    getMeuSkap()
      .then(setSkap)
      .catch(() => setSkap(null));

    if (isMotorista) {
      getProntuarioMe()
        .then(setProntuario)
        .catch(() => setProntuario(null));
    }
  }, [user, isAdmin, isMotorista]);

  const cards = useMemo(() => {
    const shapedCards = generalCards.map((card) => {
      if (card.id === 'skap') {
        return {
          ...card,
          badge: isAdmin ? 'Painel geral' : (skap?.nivel_skap ? `Nível ${skap.nivel_skap}` : 'Meu acompanhamento'),
          featured: isMotorista
        };
      }

      if (card.id === 'prontuario') {
        if (isMotorista) {
          return {
            ...card,
            badge: prontuario?.faixa_atual ? `Faixa ${prontuario.faixa_atual}` : 'Motorista',
            featured: true
          };
        }

        if (isAdmin) {
          return {
            ...card,
            badge: 'Consulta admin'
          };
        }

        return {
          ...card,
          action: 'Acesso limitado',
          badge: 'Somente motoristas',
          disabled: true
        };
      }

      return card;
    });

    return isAdmin ? [adminCard, ...shapedCards] : shapedCards;
  }, [isAdmin, isMotorista, prontuario, skap]);

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <img src="/rh-logo.jpg" alt="RH LOG20 Cascavel" />
          <div>
            <span className="brand-tagline">Logística que faz bem.</span>
            <h1>Olá, {getFirstName(user)}!</h1>
            <p className="dashboard-hero-lead">Bem-vindo à sua Central do Colaborador LOG20.</p>
            <p className="dashboard-hero-help">Escolha uma opção abaixo para continuar.</p>
            {isAdmin ? <span className="admin-access-note">Você possui acesso administrativo.</span> : null}
          </div>
        </div>
      </section>

      <section className="dashboard-card-section" aria-label="Atalhos da Central do Colaborador">
        <div className="card-grid">
          {cards.map((card, index) => (
            <DashboardCard card={card} index={index} key={card.id} />
          ))}
        </div>
      </section>

      <ActionsCarousel items={acoes} />
    </div>
  );
}
