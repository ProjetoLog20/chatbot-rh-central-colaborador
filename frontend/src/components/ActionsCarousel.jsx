import { useEffect, useMemo, useRef, useState } from 'react';

const categories = {
  cipa: { label: 'CIPA', icon: '🛡️' },
  cafe_com_gerente: { label: 'Café com o Gerente', icon: '☕' },
  comite_de_gente: { label: 'Comitê de Gente', icon: '🤝' }
};

function labelForCategory(category) {
  return categories[category]?.label || 'CIPA';
}

function iconForCategory(category) {
  return categories[category]?.icon || '🛡️';
}

function ActionImage({ item }) {
  const [failed, setFailed] = useState(false);

  if (failed || !item.imagem_url) {
    return (
      <div className={`actions-image-fallback ${item.categoria === 'comite_de_gente' ? 'people-committee' : ''}`}>
        <span className="actions-fallback-icon" aria-hidden="true">{iconForCategory(item.categoria)}</span>
        <strong>{item.titulo}</strong>
        <span>{labelForCategory(item.categoria)}</span>
      </div>
    );
  }

  return <img src={item.imagem_url} alt={item.titulo} onError={() => setFailed(true)} />;
}

export default function ActionsCarousel({ items = [] }) {
  const [selectedCategory, setSelectedCategory] = useState('todas');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef(null);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'todas') return items;
    return items.filter((item) => item.categoria === selectedCategory);
  }, [items, selectedCategory]);

  const currentItem = filteredItems[currentIndex] || filteredItems[0];

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.('change', updatePreference);
    return () => media.removeEventListener?.('change', updatePreference);
  }, []);

  useEffect(() => {
    if (!filteredItems.length || currentIndex < filteredItems.length) return;
    setCurrentIndex(0);
  }, [currentIndex, filteredItems.length]);

  useEffect(() => {
    if (paused || reducedMotion || filteredItems.length < 2) return undefined;
    const interval = window.setInterval(() => {
      setCurrentIndex((value) => (value + 1) % filteredItems.length);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [filteredItems.length, paused, reducedMotion]);

  function changeCategory(category) {
    setSelectedCategory(category);
    setCurrentIndex(0);
  }

  function goNext() {
    if (!filteredItems.length) return;
    setCurrentIndex((value) => (value + 1) % filteredItems.length);
  }

  function goPrev() {
    if (!filteredItems.length) return;
    setCurrentIndex((value) => (value - 1 + filteredItems.length) % filteredItems.length);
  }

  function handleTouchStart(event) {
    touchStart.current = event.touches[0]?.clientX ?? null;
    setPaused(true);
  }

  function handleTouchEnd(event) {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = null;
    setPaused(false);
    if (start === null || end === undefined || Math.abs(start - end) < 45) return;
    if (start > end) goNext();
    else goPrev();
  }

  return (
    <section className="actions-carousel-section">
      <div className="section-title-row">
        <div>
          <h2>Acoes e encontros</h2>
          <p>CIPA, Café com o Gerente e Comitê de Gente: registros, imagens e encaminhamentos publicados pelo RH.</p>
        </div>
        <div className="carousel-filters" aria-label="Filtro de acoes">
          {[
            ['todas', 'Todas'],
            ['cipa', 'CIPA'],
            ['cafe_com_gerente', 'Café com o Gerente'],
            ['comite_de_gente', 'Comitê de Gente']
          ].map(([value, label]) => (
            <button key={value} className={selectedCategory === value ? 'active' : ''} onClick={() => changeCategory(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {currentItem ? (
        <>
        <div
          className="actions-carousel"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button className="carousel-arrow" onClick={goPrev} aria-label="Acao anterior">‹</button>
          <article className="actions-slide">
            <ActionImage item={currentItem} key={currentItem.id} />
            <div className="actions-slide-content">
              <span className={currentItem.categoria === 'comite_de_gente' ? 'people-committee' : ''}>
                {iconForCategory(currentItem.categoria)} {labelForCategory(currentItem.categoria)}
              </span>
              <h3>{currentItem.titulo}</h3>
              <p>{currentItem.descricao}</p>
              <div className="actions-slide-meta">
                {currentItem.data_acao || currentItem.data_evento ? <small>Data: {currentItem.data_acao || currentItem.data_evento}</small> : null}
                {currentItem.responsavel ? <small>Responsável: {currentItem.responsavel}</small> : null}
                {currentItem.status ? <small>Status: {currentItem.status}</small> : null}
              </div>
              {currentItem.encaminhamento ? (
                <div className="actions-forwarding">
                  <strong>Encaminhamentos</strong>
                  <p>{currentItem.encaminhamento}</p>
                </div>
              ) : null}
            </div>
          </article>
          <button className="carousel-arrow" onClick={goNext} aria-label="Proxima acao">›</button>
        </div>
        {filteredItems.length > 1 ? (
          <div className="carousel-dots" aria-label="Posicao no carrossel">
            {filteredItems.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={index === currentIndex ? 'active' : ''}
                aria-label={`Mostrar acao ${index + 1}`}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>
        ) : null}
        </>
      ) : (
        <div className="empty-carousel">
          <h3>Nenhuma acao publicada ainda</h3>
          <p>Assim que o RH publicar imagens e descricoes, elas aparecem aqui.</p>
        </div>
      )}
    </section>
  );
}
