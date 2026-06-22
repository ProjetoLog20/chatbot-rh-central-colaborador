import { useState } from 'react';

const RESULTS = {
  geral: { label: 'Visão geral', satisfaction: '94,47%', nps: '93', critical: '1,25%', positive: 77, history: [['2024', 89.49, '89,49%'], ['2025-H1', 90.18, '90,18%'], ['2025-H2', 90.4, '90,40%'], ['2026-H1', 94.47, '94,47%']] },
  distribuicao: { label: 'Distribuição Urbana', satisfaction: '94,05%', nps: '94', critical: '1,56%', positive: 76, history: [['2024', 90.36, '90,36%'], ['2025-H1', 89.84, '89,84%'], ['2025-H2', 89.81, '89,81%'], ['2026-H1', 94.05, '94,05%']] },
  apoio: { label: 'Apoio Logístico', satisfaction: '95,87%', nps: '87', critical: '0,21%', positive: 80, history: [['2024', 87.83, '87,83%'], ['2025-H1', 90.94, '90,94%'], ['2025-H2', 91.96, '91,96%'], ['2026-H1', 95.87, '95,87%']] },
};

export default function EngagementResults() {
  const [selected, setSelected] = useState('geral');
  const result = RESULTS[selected];

  return (
    <section className="engagement-results" aria-labelledby="engagement-results-title">
      <div className="engagement-results__header">
        <div>
          <span className="engagement-results__eyebrow">Pesquisa Engajamento H1 • 2026</span>
          <h1 id="engagement-results-title">Resultados da pesquisa</h1>
          <p>Confira os principais indicadores de engajamento dos colaboradores.</p>
        </div>
        <label className="engagement-results__filter">Público
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            {Object.entries(RESULTS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="engagement-results__metrics">
        <article><span>Índice de satisfação</span><strong>{result.satisfaction}</strong><small>Excelente resultado</small></article>
        <article><span>NPS</span><strong>{result.nps}</strong><small>Lealdade e recomendação</small></article>
        <article><span>Itens críticos</span><strong>{result.critical}</strong><small>Percentual de atenção</small></article>
      </div>

      <div className="engagement-results__details">
        <article className="engagement-results__polarization">
          <div><span>Polarização negativa</span><strong>0</strong></div>
          <div className="engagement-results__scale" aria-hidden="true"><i style={{ left: `${result.positive}%` }} /></div>
          <div><span>Polarização positiva</span><strong>{result.positive}</strong></div>
        </article>
        <article className="engagement-results__history">
          <h2>Satisfação por ano</h2>
          <div className="engagement-results__bars">
            {result.history.map(([period, value, label]) => (
              <div key={period} className="engagement-results__bar-item">
                <span>{label}</span><div><i style={{ height: `${value}%` }} /></div><small>{period}</small>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
