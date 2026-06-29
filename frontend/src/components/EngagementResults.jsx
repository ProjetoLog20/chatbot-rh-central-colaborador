import { useState } from 'react';

const RESULTS = {
  geral: { label: 'Visão geral', type: 'clima', satisfaction: '94,47%', nps: '93', critical: '1,25%', positive: 77, history: [['2024', 89.49, '89,49%'], ['2025-H1', 90.18, '90,18%'], ['2025-H2', 90.4, '90,40%'], ['2026-H1', 94.47, '94,47%']] },
  distribuicao: { label: 'Distribuição Urbana', type: 'clima', satisfaction: '94,05%', nps: '94', critical: '1,56%', positive: 76, history: [['2024', 90.36, '90,36%'], ['2025-H1', 89.84, '89,84%'], ['2025-H2', 89.81, '89,81%'], ['2026-H1', 94.05, '94,05%']] },
  apoio: { label: 'Apoio Logístico', type: 'clima', satisfaction: '95,87%', nps: '87', critical: '0,21%', positive: 80, history: [['2024', 87.83, '87,83%'], ['2025-H1', 90.94, '90,94%'], ['2025-H2', 91.96, '91,96%'], ['2026-H1', 95.87, '95,87%']] },
  seguranca: { label: 'Pesquisa de Segurança', type: 'seguranca', satisfaction: '81,05%', critical: '6,29%', favorabilidade: '93,71%', aderencia: '100,00%', negative: 3, positive: 48, history: [['0 a 3 meses', 92.20, '92,20%'], ['3 a 6 meses', 81.48, '81,48%'], ['6 a 12 meses', 84.71, '84,71%'], ['1 a 2 anos', 73.41, '73,41%']] },
};

export default function EngagementResults() {
  const [selected, setSelected] = useState('geral');
  const result = RESULTS[selected];
  const isSeguranca = result.type === 'seguranca';

  return (
    <section className="engagement-results" aria-labelledby="engagement-results-title">
      <div className="engagement-results__header">
        <div>
          <span className="engagement-results__eyebrow">{isSeguranca ? 'Pesquisa de Segurança' : 'Pesquisa Engajamento H1'} • 2026</span>
          <h1 id="engagement-results-title">Resultados da pesquisa</h1>
          <p>{isSeguranca ? 'Confira os principais indicadores de segurança dos colaboradores.' : 'Confira os principais indicadores de engajamento dos colaboradores.'}</p>
        </div>
        <label className="engagement-results__filter">Público
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            {Object.entries(RESULTS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className={`engagement-results__metrics ${isSeguranca ? 'engagement-results__metrics--4cols' : ''}`}>
        {isSeguranca ? (
          <>
            <article><span>Satisfação</span><strong>{result.satisfaction}</strong><small>🙂</small></article>
            <article><span>Itens críticos</span><strong>{result.critical}</strong><small>❌</small></article>
            <article><span>Favorabilidade</span><strong>{result.favorabilidade}</strong><small>⭐</small></article>
            <article><span>Aderência</span><strong>{result.aderencia}</strong><small>✓</small></article>
          </>
        ) : (
          <>
            <article><span>Índice de satisfação</span><strong>{result.satisfaction}</strong><small>Excelente resultado</small></article>
            <article><span>NPS</span><strong>{result.nps}</strong><small>Lealdade e recomendação</small></article>
            <article><span>Itens críticos</span><strong>{result.critical}</strong><small>Percentual de atenção</small></article>
          </>
        )}
      </div>

      <div className="engagement-results__details">
        <article className="engagement-results__polarization">
          <div><span>{isSeguranca ? 'Polarização negativa' : 'Polarização negativa'}</span><strong>{isSeguranca ? result.negative : 0}</strong></div>
          <div className="engagement-results__scale" aria-hidden="true"><i style={{ left: `${result.positive}%` }} /></div>
          <div><span>{isSeguranca ? 'Polarização positiva' : 'Polarização positiva'}</span><strong>{result.positive}</strong></div>
        </article>
        <article className="engagement-results__history">
          <h2>{isSeguranca ? 'Satisfação por Tempo de Casa' : 'Satisfação por ano'}</h2>
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
