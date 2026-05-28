import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';

const sections = [
  {
    id: 'responsabilidades',
    title: 'Responsabilidades',
    icon: '🎯',
    color: '#003B68',
    items: [
      ['Jornada', 'Acompanhamento da rotina diária, horários, produtividade e cumprimento da escala.', 'Mantenha seus registros e horários em dia.'],
      ['Devolução', 'Controle de devoluções e ações para reduzir retornos de produtos.', 'Atenção à conferência e comunicação ajuda a reduzir devoluções.'],
      ['Aderência BEES', 'Acompanhamento da aderência aos processos e pedidos realizados pela plataforma BEES.', 'Seguir o fluxo correto melhora a qualidade da operação.'],
      ['Rating', 'Indicador de desempenho utilizado para medir qualidade e resultado operacional.', 'Bons resultados mantêm sua evolução em destaque.'],
      ['TML', 'Tempo médio ligado à execução da operação, usado para avaliar eficiência.', 'Organização e rota bem executada ajudam a melhorar o tempo.'],
      ['NPS', 'Indicador de satisfação do cliente com o atendimento e entrega.', 'Atendimento cordial e entrega correta melhoram a experiência do cliente.'],
      ['EFC', 'Indicador operacional de eficiência e conformidade.', 'Cumprir padrões reduz falhas e melhora o resultado.'],
      ['TMA', 'Tempo médio de atendimento ou atividade, usado para acompanhar produtividade.', 'Agilidade com qualidade é o foco.'],
      ['PPS', 'Indicador relacionado à performance, padrão e segurança da operação.', 'Performance segura é mais importante que velocidade.']
    ]
  },
  {
    id: 'recursos',
    title: 'Recursos',
    icon: '🧰',
    color: '#E87522',
    items: [
      ['Team Room', 'Espaço de alinhamento, acompanhamento de metas e comunicação da equipe.', 'Use os alinhamentos para entender metas e prioridades.'],
      ['Workstation', 'Ferramenta ou estação de trabalho usada para apoiar a rotina operacional.', 'Consulte informações e registre dados corretamente.'],
      ['SKAP', 'Avaliação da liderança sobre habilidades, conhecimentos e evolução do colaborador.', 'Acompanhe seu nível e trabalhe os pontos de evolução.'],
      ['DTO', 'Ferramenta de acompanhamento, checklist ou direcionamento de tarefas operacionais.', 'Use os checklists para evitar esquecimentos.'],
      ['Log On', 'Plataforma interna de acesso, consulta e registro de informações.', 'Mantenha seus acessos e registros atualizados.'],
      ['Treinamentos', 'Capacitações para evolução técnica, segurança e desenvolvimento profissional.', 'Treinamento concluído aumenta sua preparação para novos desafios.'],
      ['Celular', 'Recurso de trabalho para comunicação, registros e execução de rotinas.', 'Use o equipamento com responsabilidade e foco na operação.'],
      ['Caminhão', 'Recurso operacional essencial para realização das entregas e atividades de rota.', 'Zele pelo veículo e comunique qualquer irregularidade.']
    ]
  },
  {
    id: 'reconhecimentos',
    title: 'Reconhecimentos',
    icon: '🏅',
    color: '#D9A21B',
    items: [
      ['Destaques do mês', 'Reconhecimento dos colaboradores que se destacaram nos indicadores e atitudes.', 'Boas práticas e constância geram reconhecimento.'],
      ['Remuneração variável', 'Premiação vinculada ao desempenho, metas e resultados alcançados.', 'Acompanhe seus indicadores para evoluir nos resultados.'],
      ['Bônus devolução', 'Reconhecimento por redução de devoluções e melhoria na qualidade da entrega.', 'Reduzir devoluções fortalece o resultado da equipe.'],
      ['Encarreiramento', 'Oportunidade de crescimento profissional dentro da empresa.', 'Evolução, disciplina e resultado abrem portas.'],
      ['Programa de mentores', 'Programa de apoio, orientação e desenvolvimento com colaboradores experientes.', 'Aprender com quem já domina a operação acelera sua evolução.']
    ]
  }
];

function buildItem(section, item) {
  const [name, description, tip] = item;
  return {
    id: `${section.id}-${name}`,
    name,
    description,
    tip,
    category: section.title,
    color: section.color
  };
}

export default function ThreeRsPage() {
  const firstItem = useMemo(() => buildItem(sections[0], sections[0].items[0]), []);
  const [activeItem, setActiveItem] = useState(firstItem);

  return (
    <div className="three-rs-page">
      <section className="three-rs-hero">
        <div>
          <span>Logística que faz bem.</span>
          <h1>Metodologia 3Rs</h1>
          <p>Entenda as responsabilidades, recursos e reconhecimentos que apoiam sua evolução na LOG20.</p>
        </div>
        <Link to="/">Voltar para a Central</Link>
      </section>

      <section className="three-rs-layout" aria-label="Areas da metodologia 3Rs">
        <div className="three-rs-columns">
          {sections.map((section, sectionIndex) => (
            <article
              className="three-rs-column"
              key={section.id}
              style={{ '--accent': section.color, animationDelay: `${sectionIndex * 90}ms` }}
            >
              <div className="three-rs-column-header">
                <span aria-hidden="true">{section.icon}</span>
                <div>
                  <h2>{section.title}</h2>
                  <small>{section.items.length} pontos de apoio</small>
                </div>
              </div>

              <div className="three-rs-items">
                {section.items.map((item) => {
                  const shapedItem = buildItem(section, item);
                  const isActive = activeItem.id === shapedItem.id;
                  return (
                    <button
                      className={isActive ? 'active' : ''}
                      key={shapedItem.id}
                      type="button"
                      onMouseEnter={() => setActiveItem(shapedItem)}
                      onFocus={() => setActiveItem(shapedItem)}
                      onClick={() => setActiveItem(shapedItem)}
                    >
                      {shapedItem.name}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>

        <aside className="three-rs-explainer" style={{ '--active-color': activeItem.color }}>
          <span>{activeItem.category}</span>
          <h2>{activeItem.name}</h2>
          <p>{activeItem.description}</p>
          <div>
            <strong>Como isso impacta minha rotina?</strong>
            <p>{activeItem.tip}</p>
          </div>
        </aside>
      </section>

      <section className="three-rs-footer-note">
        <strong>Os 3Rs conectam responsabilidades, recursos e reconhecimentos para apoiar a evolução de cada colaborador.</strong>
      </section>
    </div>
  );
}
