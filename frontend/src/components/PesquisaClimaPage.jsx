import React, { useEffect, useState } from 'react';

export default function PesquisaClimaPage() {
  const [pesquisa, setPesquisa] = useState(null);
  const [perguntas, setPerguntas] = useState([]);
  const [respostas, setRespostas] = useState({});
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [jaRespondeu, setJaRespondeu] = useState(false);

  useEffect(() => {
    const fetchPesquisa = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('http://localhost:4000/api/pesquisa-clima/ativa', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setPesquisa(data.pesquisa);
        setPerguntas(data.perguntas || []);
        setJaRespondeu(data.jaRespondeu || false);
      } catch (error) {
        console.error('Erro:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPesquisa();
  }, []);

  const handleResposta = (pergunta_id, valor) => {
    setRespostas({
      ...respostas,
      [pergunta_id]: valor,
    });
  };

  const handleEnviar = async () => {
    if (!pesquisa) return;

    const respuestasArray = Object.entries(respostas).map(([pergunta_id, valor]) => {
      const pergunta = perguntas.find(p => p.id === parseInt(pergunta_id));
      const resp = { pergunta_id: parseInt(pergunta_id) };

      if (pergunta?.tipo === 'nota') resp.nota = parseInt(valor);
      else if (pergunta?.tipo === 'texto') resp.resposta_texto = valor;
      else if (pergunta?.tipo === 'opcao') resp.resposta_opcao = valor;
      else if (pergunta?.tipo === 'sim_nao') resp.resposta_opcao = valor;

      return resp;
    });

    setEnviando(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:4000/api/pesquisa-clima/responder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pesquisa_id: pesquisa.id,
          respostas: respuestasArray,
        }),
      });

      if (res.ok) {
        setSucesso(true);
        setTimeout(() => window.location.reload(), 2000);
      } else {
        const error = await res.json();
        alert(error.error || 'Erro ao enviar resposta');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao enviar resposta');
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
        Carregando pesquisa...
      </div>
    );
  }

  if (!pesquisa) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>
        <p style={{ fontSize: '16px' }}>
          📋 Nenhuma pesquisa de clima disponível no momento.
        </p>
      </div>
    );
  }

  if (jaRespondeu) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>
        <p style={{ fontSize: '16px' }}>
          ✓ Você já respondeu esta pesquisa. Obrigado pela participação!
        </p>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#2E7D32' }}>
        <p style={{ fontSize: '18px', fontWeight: '600' }}>✓ Pesquisa respondida com sucesso!</p>
      </div>
    );
  }

  const legendaNota = {
    1: 'Muito insatisfeito',
    2: 'Insatisfeito',
    3: 'Neutro',
    4: 'Satisfeito',
    5: 'Muito satisfeito',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ color: '#003B68', marginBottom: '12px' }}>{pesquisa.titulo}</h2>
      <p style={{ color: '#666', marginBottom: '24px' }}>{pesquisa.descricao}</p>

      {perguntas.map((pergunta) => (
        <div
          key={pergunta.id}
          style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: '#F4F7F9',
            borderRadius: '4px',
          }}
        >
          <label style={{ display: 'block', fontWeight: '600', color: '#003B68', marginBottom: '12px' }}>
            {pergunta.pergunta}
            {pergunta.obrigatoria && <span style={{ color: '#E87522' }}> *</span>}
          </label>

          {pergunta.tipo === 'nota' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {[1, 2, 3, 4, 5].map((nota) => (
                <button
                  key={nota}
                  onClick={() => handleResposta(pergunta.id, nota)}
                  style={{
                    padding: '8px 12px',
                    border: '2px solid ' + (respostas[pergunta.id] === nota ? '#E87522' : '#DDD'),
                    backgroundColor: respostas[pergunta.id] === nota ? '#E87522' : '#FFF',
                    color: respostas[pergunta.id] === nota ? '#FFF' : '#333',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                  title={legendaNota[nota]}
                >
                  {nota}
                </button>
              ))}
            </div>
          )}

          {pergunta.tipo === 'texto' && (
            <textarea
              value={respostas[pergunta.id] || ''}
              onChange={(e) => handleResposta(pergunta.id, e.target.value)}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                border: '1px solid #DDD',
                borderRadius: '4px',
                fontFamily: 'inherit',
              }}
              placeholder="Digite sua resposta..."
            />
          )}

          {pergunta.tipo === 'sim_nao' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {['Sim', 'Não'].map((opcao) => (
                <button
                  key={opcao}
                  onClick={() => handleResposta(pergunta.id, opcao)}
                  style={{
                    padding: '8px 16px',
                    border: '2px solid ' + (respostas[pergunta.id] === opcao ? '#E87522' : '#DDD'),
                    backgroundColor: respostas[pergunta.id] === opcao ? '#E87522' : '#FFF',
                    color: respostas[pergunta.id] === opcao ? '#FFF' : '#333',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {opcao}
                </button>
              ))}
            </div>
          )}

          {pergunta.tipo === 'opcao' && pergunta.opcoes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {JSON.parse(pergunta.opcoes || '[]').map((opcao) => (
                <label key={opcao} style={{ display: 'flex', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`pergunta_${pergunta.id}`}
                    value={opcao}
                    checked={respostas[pergunta.id] === opcao}
                    onChange={(e) => handleResposta(pergunta.id, e.target.value)}
                  />
                  {opcao}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      <button
        onClick={handleEnviar}
        disabled={enviando}
        style={{
          backgroundColor: '#003B68',
          color: '#FFF',
          border: 'none',
          borderRadius: '4px',
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: enviando ? 'not-allowed' : 'pointer',
          opacity: enviando ? 0.7 : 1,
          width: '100%',
        }}
      >
        {enviando ? 'Enviando...' : 'Enviar Resposta'}
      </button>
    </div>
  );
}
