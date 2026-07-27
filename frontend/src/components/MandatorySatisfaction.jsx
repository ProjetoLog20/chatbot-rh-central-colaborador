import { useEffect, useRef, useState } from 'react';
import { getSatisfacaoYuriStatus, responderSatisfacaoYuri } from '../api.js';

const scoreLabels = {
  1: 'Muito ruim',
  2: 'Ruim',
  3: 'Regular',
  4: 'Boa',
  5: 'Excelente'
};

export default function MandatorySatisfaction({ user }) {
  const [loading, setLoading] = useState(true);
  const [required, setRequired] = useState(false);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);

  async function checkStatus() {
    setLoading(true);
    setError('');
    try {
      const result = await getSatisfacaoYuriStatus();
      setRequired(!result.respondida);
    } catch (err) {
      setRequired(true);
      setError(err.error || 'Não foi possível carregar a pesquisa. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return undefined;
    checkStatus();
    return undefined;
  }, [user?.id, user?.matricula]);

  useEffect(() => {
    if (!required) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [required, loading]);

  async function submit(event) {
    event.preventDefault();
    if (!score) {
      setError('Selecione uma nota de 1 a 5 para continuar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await responderSatisfacaoYuri({ nota: score, comentario: comment });
      setRequired(false);
    } catch (err) {
      if (String(err.error || '').includes('já respondeu')) {
        setRequired(false);
      } else {
        setError(err.error || 'Não foi possível enviar sua avaliação.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!user || (!loading && !required)) return null;

  return (
    <div className="satisfaction-gate" role="presentation">
      <section
        className="satisfaction-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="satisfaction-title"
        tabIndex="-1"
        ref={dialogRef}
      >
        <div className="satisfaction-symbol" aria-hidden="true">★</div>
        <span className="satisfaction-eyebrow">Sua opinião ajuda o Yuri a evoluir</span>
        <h2 id="satisfaction-title">Como foi sua experiência com o Yuri?</h2>
        <p>Escolha uma nota para liberar seu acesso. A resposta é obrigatória uma vez por mês.</p>

        {loading ? (
          <div className="satisfaction-loading" aria-live="polite">Carregando pesquisa...</div>
        ) : (
          <form onSubmit={submit}>
            <fieldset className="satisfaction-scores">
              <legend>Selecione uma nota de 1 a 5</legend>
              <div>
                {[1, 2, 3, 4, 5].map((value) => (
                  <label className={score === value ? 'selected' : ''} key={value}>
                    <input
                      type="radio"
                      name="satisfaction-score"
                      value={value}
                      checked={score === value}
                      onChange={() => setScore(value)}
                    />
                    <strong>{value}</strong>
                    <small>{scoreLabels[value]}</small>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="satisfaction-comment">
              Quer contar algo para o RH? <span>(opcional)</span>
              <textarea
                rows="3"
                maxLength="1000"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Escreva uma sugestão ou comentário"
              />
            </label>
            {error ? (
              <div className="satisfaction-error" role="alert">
                <span>{error}</span>
                {!score ? null : <button type="button" onClick={checkStatus}>Tentar novamente</button>}
              </div>
            ) : null}
            <button className="satisfaction-submit" type="submit" disabled={saving || !score}>
              {saving ? 'Enviando...' : 'Enviar avaliação e acessar o Yuri'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
