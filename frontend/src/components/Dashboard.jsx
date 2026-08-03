import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  ChartBar,
  CheckCircle,
  CurrencyDollar,
  BellRinging,
  Handshake,
  Leaf,
  MapTrifold,
  Medal,
  Megaphone,
  Package,
  Recycle,
  ShieldCheck,
  Star,
  Target,
  Trophy,
  Truck,
  UserCircle,
  Wrench
} from '@phosphor-icons/react';
import {
  getMeuProdutividade,
  getMeuProdutividadeArmazem,
  getMeuSkap,
  getModulos,
  getProntuarioMe,
  getPublicAcoes
} from '../api.js';
import ActionsCarousel from './ActionsCarousel.jsx';

const generalCards = [
  {
    id: 'pesquisa_clima',
    icon: ChartBar,
    title: 'Pesquisa de Clima',
    description: 'Acompanhe e participe das pesquisas de satisfação da empresa.',
    action: 'Acessar pesquisa',
    color: '#005A8C',
    route: '/pesquisa-clima'
  },
  {
    id: 'skap',
    icon: Medal,
    title: 'SKAP',
    description: 'Consulte sua evolução, nível atual e habilidades avaliadas pela liderança.',
    action: 'Ver meu SKAP',
    color: '#003B68',
    route: '/skap'
  },
  {
    id: 'campeao_seguranca',
    icon: Trophy,
    title: 'Campeão de Segurança',
    description: 'Reconheça atitudes seguras e acompanhe destaques da operação.',
    action: 'Acessar',
    color: '#E87522',
    route: '/campeao-seguranca'
  },
  {
    id: 'tres_rs',
    icon: Recycle,
    title: '3 Rs',
    description: 'Conheça responsabilidades, recursos e reconhecimentos da metodologia 3Rs.',
    action: 'Acessar 3Rs',
    color: '#005A8C',
    route: '/3rs'
  },
  {
    id: 'premio_produtividade',
    icon: Star,
    title: 'Prêmio de Produtividade',
    description: 'Veja seus indicadores, metas batidas e valor previsto do prêmio.',
    action: 'Acessar',
    color: '#003B68',
    route: '/produtividade'
  },
  {
    id: 'indicadores_rota',
    icon: Target,
    title: 'Indicadores da Rota',
    description: 'Acompanhe as metas e entenda os indicadores que ajudam sua rota a ser mais produtiva, organizada e segura.',
    action: 'Ver indicadores',
    color: '#005A8C',
    route: '/indicadores-rota',
    distributionOnly: true
  },
  {
    id: 'rotograma_seguro',
    icon: MapTrifold,
    title: 'Rotograma Seguro',
    description: 'Consulte rotas, pontos de risco e orientações de segurança antes da operação.',
    action: 'Consultar',
    color: '#E87522',
    route: '/rotograma-seguro'
  },
  {
    id: 'prontuario_motorista',
    icon: Truck,
    title: 'Prontuário do Colaborador',
    description: 'Consulte sua pontuação, faixa atual e ocorrências registradas.',
    action: 'Ver prontuário',
    color: '#E87522',
    route: '/prontuario'
  },
  {
    id: 'ouvidoria',
    icon: Megaphone,
    title: 'Ouvidoria',
    description: 'Acesse o canal oficial para registrar solicitações, dúvidas ou relatos.',
    action: 'Abrir canal',
    color: '#003B68',
    href: 'https://www.log20.com.br/ouvidorias'
  }
];

const adminCard = {
  id: 'admin',
  icon: Wrench,
  title: 'Central do Administrador',
  description: 'Gerencie colaboradores, importações, indicadores e configurações do sistema.',
  action: 'Acessar painel',
  color: '#E87522',
  route: '/admin',
  badge: 'Admin',
  featured: true
};

const unitDreamPillars = [
  [Leaf, 'Sustentabilidade', 'Cuidar dos recursos e reduzir desperdícios.'],
  [ShieldCheck, 'Segurança', 'Garantir uma operação segura para todos.'],
  [Handshake, 'Engajamento', 'Fortalecer participação, união e pertencimento.'],
  [Package, 'Nível de Serviço', 'Entregar qualidade e atendimento ao cliente.'],
  [CurrencyDollar, 'Orçamento', 'Respeitar custos e usar recursos com responsabilidade.']
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

function getLatestProductivity(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  const rows = payload?.registros ?? payload?.items ?? payload?.rows;
  if (Array.isArray(rows)) return rows[0] || null;
  return payload?.registro || null;
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
  const CardIcon = card.icon;
  const content = (
    <>
      <div className="dashboard-card-top">
        <span className="dashboard-card-icon" aria-hidden="true"><CardIcon size={25} weight="duotone" /></span>
        {card.maintenance ? <span className="dashboard-card-badge maintenance">Em manutenção</span> : (card.badge ? <span className="dashboard-card-badge">{card.badge}</span> : null)}
      </div>
      <div className="dashboard-card-copy">
        <h3>{card.title}</h3>
        <p>{card.maintenance ? 'Estamos ajustando este painel.' : card.description}</p>
      </div>
      <span className="dashboard-card-action">
        <span className="dashboard-card-action-label">{card.maintenance ? 'Ver aviso' : card.action}</span>
        <ArrowRight size={17} weight="bold" aria-hidden="true" />
      </span>
    </>
  );

  const style = { '--card-accent': card.color };
  const motionProps = {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: index * 0.045 }
  };

  if (card.maintenance) {
    return (
      <motion.div className="dashboard-card-motion" {...motionProps}>
        <button type="button" className="dashboard-card-item dashboard-card-disabled" style={style} onClick={() => onMaintenance(card)}>{content}</button>
      </motion.div>
    );
  }

  if (card.href) {
    return (
      <motion.div className="dashboard-card-motion" {...motionProps}>
        <a className={`dashboard-card-item ${card.featured ? 'dashboard-card-featured' : ''}`} style={style} href={card.href} target="_blank" rel="noreferrer">{content}</a>
      </motion.div>
    );
  }

  return (
    <motion.div className="dashboard-card-motion" {...motionProps}>
      <Link className={`dashboard-card-item ${card.featured ? 'dashboard-card-featured' : ''}`} style={style} to={card.route}>{content}</Link>
    </motion.div>
  );
}

function UnitDreamPanel() {
  const [activePillar, setActivePillar] = useState(unitDreamPillars[0]);

  return (
    <section className="unit-dream-panel" aria-labelledby="unit-dream-title">
      <div className="unit-dream-heading">
        <span className="unit-dream-icon" aria-hidden="true"><Target size={31} weight="duotone" /></span>
        <div>
          <h2 id="unit-dream-title">Sonho da Unidade</h2>
          <p>Ser sustentável, com segurança, engajamento, entregando o nível de serviço, respeitando o orçamento.</p>
        </div>
      </div>

      <div className="unit-dream-pillars" aria-label="Pilares do Sonho da Unidade">
        {unitDreamPillars.map((pillar) => {
          const PillarIcon = pillar[0];
          return (
            <button
              type="button"
              key={pillar[1]}
              onMouseEnter={() => setActivePillar(pillar)}
              onFocus={() => setActivePillar(pillar)}
              onClick={() => setActivePillar(pillar)}
              title={pillar[2]}
            >
              <span aria-hidden="true"><PillarIcon size={20} weight="duotone" /></span>
              {pillar[1]}
            </button>
          );
        })}
      </div>

      <p className="unit-dream-explanation">{activePillar[2]}</p>
      <small>Esse é o nosso direcionador diário para uma operação mais segura, eficiente e sustentável.</small>
    </section>
  );
}

function SuperTeamRoomPanel() {
  return (
    <section className="super-team-room-panel" aria-labelledby="super-team-room-title">
      <div className="super-team-room-trophy" aria-hidden="true"><Trophy size={82} weight="duotone" /></div>
      <div className="super-team-room-copy">
        <span className="super-team-room-kicker">Destaques do mês</span>
        <h2 id="super-team-room-title">Super Team Room</h2>
        <h3>Reconhecendo quem fez a diferença</h3>
        <p>Metas alcançadas, talentos reconhecidos e histórias que inspiram toda a unidade.</p>
        <div className="super-team-room-highlights">
          <span><Medal size={16} weight="duotone" /> Produtividade</span>
          <span><ShieldCheck size={16} weight="duotone" /> Segurança</span>
          <span><Star size={16} weight="duotone" /> Qualidade</span>
        </div>
      </div>
      <button type="button" disabled title="Disponível após o fechamento mensal">
        Conhecer os destaques <span aria-hidden="true">›</span>
      </button>
    </section>
  );
}

export default function Dashboard({ user }) {
  const [acoes, setAcoes] = useState([]);
  const [skap, setSkap] = useState(null);
  const [prontuario, setProntuario] = useState(null);
  const [productivity, setProductivity] = useState(null);
  const [modulos, setModulos] = useState([]);
  const [maintenanceModule, setMaintenanceModule] = useState(null);
  const reduceMotion = useReducedMotion();
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

  useEffect(() => {
    if (!user) return;
    Promise.allSettled([getMeuProdutividade(), getMeuProdutividadeArmazem()])
      .then((results) => {
        const routeValue = results[0].status === 'fulfilled' ? getLatestProductivity(results[0].value) : null;
        const warehouseValue = results[1].status === 'fulfilled' ? getLatestProductivity(results[1].value) : null;
        setProductivity(routeValue || warehouseValue || null);
      });
  }, [user]);

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

  const showSuperTeamRoom = isAdmin || !modulos.length || modulos.some((modulo) => modulo.chave === 'super_team_room');

  return (
    <motion.div
      className="dashboard-page dashboard-page-refined"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <section className="dashboard-hero dashboard-hero-refined">
        <motion.div
          className="dashboard-hero-welcome"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div>
            <span className="brand-tagline"><i /> Central do Colaborador</span>
            <h1>Olá, {getFirstName(user)}!</h1>
            <p className="dashboard-hero-lead">Tudo o que você precisa para acompanhar sua jornada, em um só lugar.</p>
            {isAdmin ? <span className="admin-access-note">Acesso administrativo ativo</span> : null}
            <div className="dashboard-hero-actions">
              <Link to="/produtividade">Ver meu desempenho <span aria-hidden="true">→</span></Link>
              <Link to="/profile">Atualizar meus dados</Link>
            </div>
          </div>
        </motion.div>
        <UnitDreamPanel />
      </section>

      <section className="dashboard-status-grid" aria-label="Resumo do colaborador">
        <article className={`dashboard-status-card prize ${productivity ? 'is-updated' : 'is-pending'}`}>
          <Link className="dashboard-prize-link" to="/produtividade" aria-label="Abrir meu prêmio">
            <span className="dashboard-status-icon" aria-hidden="true"><BellRinging size={29} weight="duotone" /></span>
            <span>
              <small>Meu prêmio</small>
              <strong>{productivity ? 'Prêmio atualizado' : 'Aguardando atualização'}</strong>
              <em>{productivity?.competencia ? `Competência ${productivity.competencia}` : 'Você será avisado quando houver novidade'}</em>
            </span>
          </Link>
          <Link className="dashboard-status-arrow" to="/produtividade" aria-label="Ver detalhes do prêmio">›</Link>
        </article>
        <Link className="dashboard-status-card" to="/skap">
          <span className="dashboard-status-icon blue" aria-hidden="true"><CheckCircle size={28} weight="duotone" /></span>
          <span>
            <small>SKAP</small>
            <strong>{skap?.nivel_skap ? formatLevel(skap.nivel_skap) : 'Acompanhar'}</strong>
            <em>Evolução e habilidades</em>
          </span>
          <b aria-hidden="true">›</b>
        </Link>
        <Link className="dashboard-status-card" to="/profile">
          <span className="dashboard-status-icon blue" aria-hidden="true"><UserCircle size={29} weight="duotone" /></span>
          <span>
            <small>Meu perfil</small>
            <strong>Dados atualizados</strong>
            <em>Ver meus dados</em>
          </span>
          <b aria-hidden="true">›</b>
        </Link>
      </section>

      {showSuperTeamRoom ? <SuperTeamRoomPanel /> : null}

      <section className="dashboard-card-section compact-services" aria-label="Atalhos da Central do Colaborador">
        <div className="dashboard-section-heading">
          <div>
            <span>Serviços do Yuri</span>
            <h2>Acesso rápido</h2>
          </div>
        </div>
        <div className="card-grid">
          {cards.map((card, index) => (
            <DashboardCard card={card} index={index} key={card.id} onMaintenance={setMaintenanceModule} />
          ))}
        </div>
      </section>

      <ActionsCarousel items={acoes} />
      <MaintenanceNotice module={maintenanceModule} onClose={() => setMaintenanceModule(null)} />
    </motion.div>
  );
}
