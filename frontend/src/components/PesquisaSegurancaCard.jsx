import { useState } from 'react';

const SECURITY_RESULTS = {
  geral: { label: 'Visão geral', satisfaction: '81,05%', critical: '6,29%', favorabilidade: '93,71%', aderencia: '100,00%', negative: 3, positive: 48, history: [['0 a 3 meses', 92.20, '92,20%'], ['3 a 6 meses', 81.48, '81,48%'], ['6 a 12 meses', 84.71, '84,71%'], ['1 a 2 anos', 73.41, '73,41%']] },
};

export default function PesquisaSegurancaCard() {
  const [selected, setSelected] = useState('geral');
  const result = SECURITY_RESULTS[selected];

  return (
    <section className="engagement-results security-results" aria-labelledby="security-results-title">
      <div className="engagement-results__header">
        <div>
          <span className="engagement-results__eyebrow">Pesquisa de Segurança • 2026</span>
          <h1 id="security-results-title">Pesquisa de Segurança</h1>
          <p>Confira os principais indicadores de segurança dos colaboradores.</p>
        </div>
      </div>

      <div className="engagement-results__metrics engagement-results__metrics--4cols">
        <article><span>Satisfação</span><strong>{result.satisfaction}</strong><small>🙂</small></article>
        <article><span>Itens críticos</span><strong>{result.critical}</strong><small>❌</small></article>
        <article><span>Favorabilidade</span><strong>{result.favorabilidade}</strong><small>⭐</small></article>
        <article><span>Aderência</span><strong>{result.aderencia}</strong><small>✓</small></article>
      </div>

      <div className="engagement-results__details">
        <article className="engagement-results__polarization">
          <div><span>Polarização negativa</span><strong>{result.negative}</strong></div>
          <div className="engagement-results__scale" aria-hidden="true"><i style={{ left: `${result.positive}%` }} /></div>
          <div><span>Polarização positiva</span><strong>{result.positive}</strong></div>
        </article>
        <article className="engagement-results__history">
          <h2>Satisfação por Tempo de Casa</h2>
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
