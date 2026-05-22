import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicAcoes } from '../api.js';
import ActionsCarousel from './ActionsCarousel.jsx';

const baseCards = [
  { label: 'Pesquisa de Clima', description: 'Acompanhe o ambiente e satisfacao.', color: '#005A8C', route: '/profile' },
  { label: 'SKAP', description: 'Saiba mais sobre avaliacao de seguranca.', color: '#003B68', route: '/profile' },
  { label: 'Campeao de Seguranca', description: 'Destaque quem pratica seguranca.', color: '#E87522', route: '/profile' },
  { label: '3 Rs', description: 'Reduza, reuse e recicle informacoes.', color: '#005A8C', route: '/profile' },
  { label: 'Premio de Produtividade', description: 'Veja reconhecimentos e metas.', color: '#003B68', route: '/profile' },
  { label: 'Prontuario do Motorista', description: 'Acesse seu prontuario e orientacoes.', color: '#E87522', route: '/motorista' },
  { label: 'Ouvidoria', description: 'Registre sua solicitacao na ouvidoria.', color: '#003B68', href: 'https://www.log20.com.br/ouvidorias' }
];

export default function Dashboard({ user }) {
  const [acoes, setAcoes] = useState([]);

  useEffect(() => {
    getPublicAcoes()
      .then(setAcoes)
      .catch((err) => console.error(err));
  }, []);

  const cards = user?.perfil === 'admin'
    ? [
        {
          label: 'Central do Administrador',
          description: 'Baixe modelos Excel, alimente dados e gerencie o chatbot.',
          color: '#E87522',
          route: '/admin'
        },
        ...baseCards
      ]
    : baseCards;

  return (
    <div className="page-card dashboard-card">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <img src="/rh-logo.jpg" alt="RH Log20 Cascavel" />
          <div>
            <h1>Bem-vindo, {user?.nome_completo || 'colaborador'}</h1>
            <p>Escolha um card para acessar servicos rapidos e informacoes do RH.</p>
          </div>
        </div>
      </div>
      <div className="card-grid">
        {cards.map((card) => (
          <div key={card.label} className="dashboard-card-item" style={{ borderTopColor: card.color }}>
            <h3>{card.label}</h3>
            <p>{card.description}</p>
            {card.href ? (
              <a href={card.href} target="_blank" rel="noreferrer">Abrir</a>
            ) : (
              <Link to={card.route}>Acessar</Link>
            )}
          </div>
        ))}
      </div>
      <ActionsCarousel items={acoes} />
      <div className="info-box">
        <h2>O que voce pode fazer</h2>
        <ul>
          <li>Colaboradores veem apenas os proprios dados.</li>
          <li>Motoristas tambem acessam o prontuario.</li>
          <li>Admins gerenciam usuarios, prontuarios, importacoes e chatbot.</li>
        </ul>
      </div>
    </div>
  );
}
