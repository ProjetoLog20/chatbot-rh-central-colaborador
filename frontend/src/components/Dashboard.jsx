import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMeuSkap, getModulos, getProntuarioMe, getPublicAcoes } from '../api.js';
import ActionsCarousel from './ActionsCarousel.jsx';

const generalCards = [
  {
    id: 'pesquisa_clima',
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
    id: 'campeao_seguranca',
    icon: '🏆',
    title: 'Campeão de Segurança',
    description: 'Reconheça atitudes seguras e acompanhe destaques da operação.',
    action: 'Acessar',
    color: '#E87522',
    route: '/campeao-seguranca'
  },
  {
    id: 'tres_rs',
    icon: '♻️',
    title: '3 Rs',
    description: 'Conheça responsabilidades, recursos e reconhecimentos da metodologia 3Rs.',
    action: 'Acessar 3Rs',
    color: '#005A8C',
    route: '/3rs'
  },
  {
    id: 'premio_produtividade',
    icon: '⭐',
    title: 'Prêmio de Produtividade',
    description: 'Veja seus indicadores, metas batidas e valor previsto do prêmio.',
    action: 'Acessar',
    color: '#003B68',
    route: '/produtividade'
  },
  {
    id: 'indicadores_rota',
    icon: '🎯',
    title: 'Indicadores da Rota',
    description: 'Acompanhe as metas e entenda os indicadores que ajudam sua rota a ser mais produtiva, organizada e segura.',
    action: 'Ver indicadores',
    color: '#005A8C',
    route: '/indicadores-rota',
    distributionOnly: true
  },
  {
    id: 'rotograma_seguro',
    icon: '🛣️',
    title: 'Rotograma Seguro',
    description: 'Consulte rotas, pontos de risco e orientações de segurança antes da operação.',
    action: 'Consultar',
    color: '#E87522',
    route: '/rotograma-seguro'
  },
  {
    id: 'prontuario_motorista',
    icon: '🚚',
    title: 'Prontuário do Motorista',
    description: 'Consulte sua pontuação, faixa atual e ocorrências registradas.',
    action: 'Ver prontuário',
    color: '#E87522',
    route: '/prontuario'
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

const unitDreamPillars = [
  ['🌱', 'Sustentabilidade', 'Cuidar dos recursos e reduzir desperdícios.'],
  ['🛡️', 'Segurança', 'Garantir uma operação segura para todos.'],
  ['🤝', 'Engajamento', 'Fortalecer participação, união e pertencimento.'],
  ['📦', 'Nível de Serviço', 'Entregar qualidade e atendimento ao cliente.'],
  ['💰', 'Orçamento', 'Respeitar custos e usar recursos com responsabilidade.']
];

function normalizePerfil(perfil) {
  return String(perfil || '').trim().toLowerCase();
}

function isDistributionProfile(user) {
  const text = [
    user?.perfil,
    user?.cargo,
    user?.tipo_colaborador
  ].map((value) => String(value || '').trim().toLowerCase()).join(' ');

  return text.includes('motorista') || text.includes('ajudante');
}

function getFirstName(user) {
  const name = user?.nome_preferido || user?.nome_completo || 'colaborador';
  return String(name).trim().split(/\s+/)[0] || 'colaborador';
}

function formatLevel(value) {
  const labels = {
    ouro: 'Ouro',
    prata: 'Prata',
    verde: 'Prata',
    bronze: 'Bronze'
  };
  return labels[value] || value;
}

function MaintenanceNotice({ module, onClose }) {
  if (!module) return null;
  const title = module.id === 'premio_produtividade'
    ? 'Prêmio de Produtividade em manutenção'
    : 'Painel em manutenção';
  const message = module.mensagem_manutencao || 'Estamos ajustando este painel para garantir que as informações sejam apresentadas corretamente. Em breve ele estará disponível.';

  return (
    <div className="maintenance-modal-backdrop" role="presentation">
      <section className="maintenance-modal" role="dialog" aria-modal="true" aria-labelledby="maintenance-title">
        <span className="maintenance-modal-icon" aria-hidden="true">!</span>
        <h2 id="maintenance-title">{title}</h2>
        <p>{message}</p>
        <button type="button" onClick={onClose}>Voltar para a Central</button>
      </section>
    </div>
  );
}

function DashboardCard({ card, index, onMaintenance }) {
  const content = (
    <>
      <div className="dashboard-card-top">
        <span className="dashboard-card-icon" aria-hidden="true">{card.icon}</span>
        {card.maintenance ? <span className="dashboard-card-badge maintenance">Em manutenção</span> : (card.badge ? <span className="dashboard-card-badge">{card.badge}</span> : null)}
      </div>
      <div className="dashboard-card-copy">
        <h3>{card.title}</h3>
        <p>{card.maintenance ? 'Estamos ajustando este painel.' : card.description}</p>
      </div>
      <span className="dashboard-card-action">{card.maintenance ? 'Ver aviso' : card.action}</span>
    </>
  );

  const style = {
    borderTopColor: card.color,
    animationDelay: `${index * 70}ms`
  };

  if (card.maintenance) {
    return (
      <button type="button" className="dashboard-card-item dashboard-card-disabled" style={style} onClick={() => onMaintenance(card)}>
        {content}
      </button>
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

function UnitDreamPanel() {
  const [activePillar, setActivePillar] = useState(unitDreamPillars[0]);

  return (
    <section className="unit-dream-panel" aria-labelledby="unit-dream-title">
      <div className="unit-dream-heading">
        <span className="unit-dream-icon" aria-hidden="true">🎯</span>
        <div>
          <h2 id="unit-dream-title">Sonho da Unidade</h2>
          <p>Ser sustentável, com segurança, engajamento, entregando o nível de serviço, respeitando o orçamento.</p>
        </div>
      </div>

      <div className="unit-dream-pillars" aria-label="Pilares do Sonho da Unidade">
        {unitDreamPillars.map((pillar) => (
          <button
            type="button"
            key={pillar[1]}
            onMouseEnter={() => setActivePillar(pillar)}
            onFocus={() => setActivePillar(pillar)}
            onClick={() => setActivePillar(pillar)}
            title={pillar[2]}
          >
            <span aria-hidden="true">{pillar[0]}</span>
            {pillar[1]}
          </button>
        ))}
      </div>

      <p className="unit-dream-explanation">{activePillar[2]}</p>
      <small>Esse é o nosso direcionador diário para uma operação mais segura, eficiente e sustentável.</small>
    </section>
  );
}

export default function Dashboard({ user }) {
  const [acoes, setAcoes] = useState([]);
  const [skap, setSkap] = useState(null);
  const [prontuario, setProntuario] = useState(null);
  const [modulos, setModulos] = useState([]);
  const [maintenanceModule, setMaintenanceModule] = useState(null);
  const perfil = normalizePerfil(user?.perfil);
  const isAdmin = perfil === 'admin';
  const isDistribution = isDistributionProfile(user);

  useEffect(() => {
    getPublicAcoes()
      .then(setAcoes)
      .catch((err) => console.error(err));

    getModulos()
      .then(setModulos)
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!user || isAdmin) return;

    getMeuSkap()
      .then(setSkap)
      .catch(() => setSkap(null));

    getProntuarioMe()
      .then(setProntuario)
      .catch(() => setProntuario(null));
  }, [user, isAdmin, isDistribution]);

  const cards = useMemo(() => {
    const moduleByKey = new Map(modulos.map((modulo) => [modulo.chave, modulo]));
    const availableCards = generalCards.filter((card) => !card.distributionOnly || isDistribution || isAdmin);
    const visibleCards = modulos.length
      ? availableCards.filter((card) => moduleByKey.has(card.id))
      : availableCards;

    const shapedCards = visibleCards.map((card) => {
      const modulo = moduleByKey.get(card.id);
      const maintenance = Boolean(modulo && (!modulo.ativo || modulo.em_manutencao));
      const baseCard = {
        ...card,
        title: modulo?.nome || card.title,
        description: modulo?.descricao || card.description,
        maintenance,
        mensagem_manutencao: modulo?.mensagem_manutencao
      };

      if (card.id === 'skap') {
        return {
          ...baseCard,
          badge: isAdmin ? 'Painel geral' : (skap?.nivel_skap ? `Nível ${formatLevel(skap.nivel_skap)}` : 'Meu acompanhamento'),
          featured: isDistribution
        };
      }

      if (card.id === 'prontuario_motorista') {
        if (isDistribution) {
          return {
            ...baseCard,
            badge: prontuario?.faixa ? `Faixa ${prontuario.faixa}` : 'Distribuição',
            featured: true
          };
        }

        if (isAdmin) {
          return {
            ...baseCard,
            badge: 'Consulta admin'
          };
        }

        return {
          ...baseCard,
          action: 'Ver prontuário',
          badge: prontuario?.faixa ? `Faixa ${prontuario.faixa}` : 'Meu prontuário'
        };
      }

      return baseCard;
    });

    return isAdmin ? [adminCard, ...shapedCards] : shapedCards;
  }, [isAdmin, isDistribution, modulos, prontuario, skap]);

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
        <div className="dashboard-section-heading">
          <div>
            <span>Acesso rapido</span>
            <h2>O que você precisa hoje?</h2>
          </div>
        </div>
        <div className="card-grid">
          {cards.map((card, index) => (
            <DashboardCard card={card} index={index} key={card.id} onMaintenance={setMaintenanceModule} />
          ))}
        </div>
      </section>

      <ActionsCarousel items={acoes} />
      <UnitDreamPanel />
      <MaintenanceNotice module={maintenanceModule} onClose={() => setMaintenanceModule(null)} />
    </div>
  );
}
