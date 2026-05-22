import { useMemo, useState } from 'react';

function labelForCategory(category) {
  return category === 'cafe_com_gerente' ? 'Cafe com o Gerente' : 'CIPA';
}

export default function ActionsCarousel({ items = [] }) {
  const [selectedCategory, setSelectedCategory] = useState('todas');
  const [currentIndex, setCurrentIndex] = useState(0);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'todas') return items;
    return items.filter((item) => item.categoria === selectedCategory);
  }, [items, selectedCategory]);

  const currentItem = filteredItems[currentIndex] || filteredItems[0];

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

  return (
    <section className="actions-carousel-section">
      <div className="section-title-row">
        <div>
          <h2>Acoes e encontros</h2>
          <p>CIPA e Cafe com o Gerente: registros, imagens e encaminhamentos publicados pelo RH.</p>
        </div>
        <div className="carousel-filters" aria-label="Filtro de acoes">
          {[
            ['todas', 'Todas'],
            ['cipa', 'CIPA'],
            ['cafe_com_gerente', 'Cafe com o Gerente']
          ].map(([value, label]) => (
            <button key={value} className={selectedCategory === value ? 'active' : ''} onClick={() => changeCategory(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {currentItem ? (
        <div className="actions-carousel">
          <button className="carousel-arrow" onClick={goPrev} aria-label="Acao anterior">‹</button>
          <article className="actions-slide">
            <img src={currentItem.imagem_url} alt={currentItem.titulo} />
            <div className="actions-slide-content">
              <span>{labelForCategory(currentItem.categoria)}</span>
              <h3>{currentItem.titulo}</h3>
              <p>{currentItem.descricao}</p>
              {currentItem.data_evento ? <small>Data: {currentItem.data_evento}</small> : null}
            </div>
          </article>
          <button className="carousel-arrow" onClick={goNext} aria-label="Proxima acao">›</button>
        </div>
      ) : (
        <div className="empty-carousel">
          <h3>Nenhuma acao publicada ainda</h3>
          <p>Assim que o RH publicar imagens e descricoes, elas aparecem aqui.</p>
        </div>
      )}
    </section>
  );
}

