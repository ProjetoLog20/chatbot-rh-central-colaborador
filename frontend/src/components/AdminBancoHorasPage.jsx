import { useState } from 'react';
import { CalendarBlank, ClockCounterClockwise, UsersThree } from '@phosphor-icons/react';
import './admin-banco-horas.css';

const views = {
  colaboradores: {
    icon: UsersThree,
    label: 'Colaboradores',
    eyebrow: 'Visão administrativa',
    title: 'Selecione um colaborador',
    description: 'A lista dos colaboradores ficará centralizada aqui para abrir o calendário e o banco de horas individual.',
    status: 'Sem dados publicados'
  },
  calendario: {
    icon: CalendarBlank,
    label: 'Calendário',
    eyebrow: 'Batidas e jornada diária',
    title: 'Nenhum relatório publicado',
    description: 'Depois da importação do Kairos, cada dia mostrará as batidas, o tempo trabalhado e as folgas do colaborador.',
    status: 'Sem dados de ponto'
  },
  banco: {
    icon: ClockCounterClockwise,
    label: 'Banco de Horas',
    eyebrow: 'Saldo do colaborador',
    title: 'Saldo ainda não disponível',
    description: 'O saldo, os créditos e os débitos serão exibidos aqui somente após a conferência e publicação pelo administrador.',
    status: '--:--'
  }
};

export default function AdminBancoHorasPage() {
  const [activeView, setActiveView] = useState('colaboradores');
  const currentView = views[activeView];
  const CurrentIcon = currentView.icon;

  return (
    <div className="page-card admin-card banco-horas-admin-page">
      <header className="banco-horas-admin-heading">
        <div>
          <span>Gestão de ponto</span>
          <h1>Banco de Horas</h1>
          <p>Área inicial para consultar colaboradores, calendário e saldos em visões separadas.</p>
        </div>
        <strong>Somente administradores</strong>
      </header>

      <section className="banco-horas-workspace" aria-labelledby="banco-horas-view-title">
        <nav className="banco-horas-tabs" aria-label="Visões do Banco de Horas">
          {Object.entries(views).map(([key, view]) => {
            const TabIcon = view.icon;
            return (
              <button
                type="button"
                className={activeView === key ? 'active' : ''}
                aria-pressed={activeView === key}
                onClick={() => setActiveView(key)}
                key={key}
              >
                <TabIcon size={20} weight="duotone" aria-hidden="true" />
                {view.label}
              </button>
            );
          })}
        </nav>

        <div className="banco-horas-empty-view">
          <span className="banco-horas-empty-icon" aria-hidden="true">
            <CurrentIcon size={38} weight="duotone" />
          </span>
          <small>{currentView.eyebrow}</small>
          <h2 id="banco-horas-view-title">{currentView.title}</h2>
          <p>{currentView.description}</p>
          <strong>{currentView.status}</strong>
        </div>
      </section>
    </div>
  );
}
