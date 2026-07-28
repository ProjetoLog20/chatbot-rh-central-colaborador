import { Link } from 'react-router-dom';

const indicadores = [
  {
    id: 'devolucao',
    icon: '🎯',
    title: 'DEVOLUÇÃO',
    meta: '3,50%',
    text: 'Atingindo este percentual, você é recompensado no valor de R$ 200,00 🤑',
    note: 'Lembrando: você precisa ter acima de 15 mapas no período de apuração.',
    color: '#E87522'
  },
  {
    id: 'tml',
    icon: '⏱️',
    title: 'TML',
    meta: '30 MIN',
    text: 'Algumas dicas para você conquistar esta meta: não se atrase para iniciar as atividades e faça o check de tudo que você precisa antes da team room.',
    checklist: [
      'Celular ✅',
      'Garrafa de água ✅',
      'EPIs necessários para seu dia ser mais seguro ✅'
    ],
    conclusion: 'Este indicador pode fazer você ser o destaque do mês 😍',
    color: '#005A8C'
  },
  {
    id: 'aderencia-raio',
    icon: '📍',
    title: 'ADERÊNCIA AO RAIO',
    meta: '95%',
    text: 'Este indicador garante que sua rota estará calibrada corretamente. Com boa aderência, você evita dispersão em rota e sua rotina fica mais tranquila e produtiva. 🫂',
    color: '#003B68'
  },
  {
    id: 'rqi',
    icon: '🚚',
    title: 'RQI - IV CRÍTICO',
    meta: '280 pontos',
    text: 'Este indicador é crítico 😐. Precisamos cuidar da qualidade dos produtos para evitar solicitações de troca, aumentando também o NPS, que mede a satisfação do cliente.',
    explanation: 'RQI é o volume de trocas que você realiza pelo volume entregue do seu caminhão. Quanto menor o volume do caminhão, maior pode ser o percentual de RQI caso existam trocas. Lembre-se: 1 lata tem volume menor que 1 caixa.',
    conclusion: 'Vale a pena garantir este indicador. É gratificante ser reconhecido por um bom trabalho ❤️',
    color: '#E87522'
  }
];

export default function IndicadoresRotaPage() {
  return (
    <div className="route-indicators-page">
      <section className="route-indicators-hero">
        <div>
          <span>Operação LOG20</span>
          <h1>Indicadores da Rota</h1>
          <p>Entenda os principais indicadores da operação e como eles impactam sua rotina.</p>
        </div>
        <Link to="/">Voltar para a Central</Link>
      </section>

      <section className="route-indicators-grid" aria-label="Indicadores da operação de rota">
        {indicadores.map((indicador, index) => (
          <article
            className="route-indicator-card"
            key={indicador.id}
            style={{ '--accent': indicador.color, animationDelay: `${index * 80}ms` }}
          >
            <div className="route-indicator-header">
              <span className="route-indicator-icon" aria-hidden="true">{indicador.icon}</span>
              <div>
                <h2>{indicador.title}</h2>
                <span className="route-indicator-meta">Meta: {indicador.meta}</span>
              </div>
            </div>

            <p>{indicador.text}</p>

            {indicador.checklist ? (
              <ul className="route-indicator-checklist">
                {indicador.checklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}

            {indicador.explanation ? (
              <div className="route-indicator-extra">
                <strong>Como funciona?</strong>
                <p>{indicador.explanation}</p>
              </div>
            ) : null}

            {indicador.note ? <p className="route-indicator-note">{indicador.note}</p> : null}
            {indicador.conclusion ? <p className="route-indicator-conclusion">{indicador.conclusion}</p> : null}
          </article>
        ))}
      </section>

      <section className="route-indicators-footer">
        <strong>Em caso de dúvidas sobre os indicadores ou sobre a apuração, procure sua liderança ou o RH.</strong>
      </section>
    </div>
  );
}
