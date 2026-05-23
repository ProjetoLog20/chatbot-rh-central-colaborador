import React, { useEffect, useState } from 'react';
import { getUser } from '../auth';
import AdminPesquisaClimaForm from './AdminPesquisaClimaForm';

export default function PesquisaClimaPage() {
  const user = getUser();
  const isAdmin = user?.perfil === 'admin';

  const [pesquisas, setPesquisas] = useState([]);
  const [pesquisaAtiva, setPesquisaAtiva] = useState(null);
  const [perguntas, setPerguntas] = useState([]);
  const [respostas, setRespostas] = useState({});
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [jaRespondeu, setJaRespondeu] = useState(false);
  const [showFormNova, setShowFormNova] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [selectedPesquisaId, setSelectedPesquisaId] = useState(null);

  useEffect(() => {
    if (isAdmin) {
      fetchPesquisasAdmin();
    } else {
      fetchPesquisaAtiva();
    }
  }, [isAdmin]);

  const fetchPesquisasAdmin = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:4000/api/pesquisa-clima/admin', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPesquisas(data.pesquisas || []);
      setPesquisaAtiva(data.pesquisaAtiva || null);
    } catch (error) {
      console.error('Erro ao buscar pesquisas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPesquisaAtiva = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:4000/api/pesquisa-clima/ativa', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPesquisaAtiva(data.pesquisa);
      setPerguntas(data.perguntas || []);
      setJaRespondeu(data.jaRespondeu || false);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivatePesquisa = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`http://localhost:4000/api/pesquisa-clima/${id}/ativar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Pesquisa ativada!');
      fetchPesquisasAdmin();
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  const handleViewDashboard = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:4000/api/pesquisa-clima/${id}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSelectedPesquisaId(id);
      setDashboard(data);
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  const handleResposta = (pergunta_id, valor) => {
    setRespostas({
      ...respostas,
      [pergunta_id]: valor,
    });
  };

  const handleEnviar = async () => {
    if (!pesquisaAtiva) return;

    const respuestasArray = Object.entries(respostas).map(([pergunta_id, valor]) => {
      const pergunta = perguntas.find((p) => p.id === parseInt(pergunta_id));
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
          pesquisa_id: pesquisaAtiva.id,
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

  const legendaNota = {
    1: 'Muito insatisfeito',
    2: 'Insatisfeito',
    3: 'Neutro',
    4: 'Satisfeito',
    5: 'Muito satisfeito',
  };

  if (!isAdmin) {
    if (sucesso) {
      return (
        <div style={{ padding: '24px', textAlign: 'center', color: '#2E7D32' }}>
          <p style={{ fontSize: '18px', fontWeight: '600' }}>✓ Pesquisa respondida com sucesso!</p>
        </div>
      );
    }

    if (!pesquisaAtiva) {
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

    return (
      <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
        <h2 style={{ color: '#003B68', marginBottom: '12px' }}>{pesquisaAtiva.titulo}</h2>
        <p style={{ color: '#666', marginBottom: '24px' }}>{pesquisaAtiva.descricao}</p>

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

  const getDashboardId = () => {
    if (selectedPesquisaId) return selectedPesquisaId;
    if (pesquisaAtiva) return pesquisaAtiva.id;
    return pesquisas?.[0]?.id || null;
  };

  if (showFormNova) {
    return (
      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
        <AdminPesquisaClimaForm
          onSave={() => {
            setShowFormNova(false);
            fetchPesquisasAdmin();
          }}
          onCancel={() => setShowFormNova(false)}
        />
      </div>
    );
  }

  if (dashboard) {
    return (
      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #DDD',
            padding: '24px',
            borderRadius: '4px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
            }}
          >
            <h2 style={{ color: '#003B68', margin: 0 }}>Dashboard - Resultados</h2>
            <button
              onClick={() => setDashboard(null)}
              style={{
                backgroundColor: '#DDD',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Voltar
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#F4F7F9', padding: '16px', borderRadius: '4px' }}>
              <p style={{ color: '#666', fontSize: '12px' }}>Total de Respostas</p>
              <p style={{ fontSize: '28px', fontWeight: '600', color: '#003B68' }}>
                {dashboard.total_respostas}
              </p>
            </div>
            <div style={{ backgroundColor: '#F4F7F9', padding: '16px', borderRadius: '4px' }}>
              <p style={{ color: '#666', fontSize: '12px' }}>Satisfação Média</p>
              <p style={{ fontSize: '28px', fontWeight: '600', color: '#E87522' }}>
                {dashboard.media_satisfacao}/5
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontWeight: '600', color: '#003B68', marginBottom: '12px' }}>Distribuição</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {Object.entries(dashboard.distribuicao || {}).map(([label, value]) => (
                <div key={label} style={{ textAlign: 'center', backgroundColor: '#F4F7F9', padding: '12px', borderRadius: '4px' }}>
                  <p style={{ fontSize: '11px', color: '#666', margin: 0, marginBottom: '4px' }}>
                    {label.replace(/_/g, ' ')}
                  </p>
                  <p style={{ fontSize: '20px', fontWeight: '600', color: '#003B68', margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {dashboard.comentarios && dashboard.comentarios.length > 0 && (
            <div>
              <p style={{ fontWeight: '600', color: '#003B68', marginBottom: '12px' }}>Comentários Recentes</p>
              {dashboard.comentarios.map((com, idx) => (
                <p
                  key={idx}
                  style={{
                    backgroundColor: '#F4F7F9',
                    padding: '12px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    marginBottom: '8px',
                  }}
                >
                  "{com.comentario || 'Sem comentário'}"
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: '#003B68', marginBottom: '8px' }}>Pesquisa de Clima</h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>
          Crie, acompanhe e analise pesquisas internas de satisfação.
        </p>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowFormNova(true)}
            style={{
              backgroundColor: '#003B68',
              color: '#FFF',
              border: 'none',
              borderRadius: '4px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            + Nova Pesquisa
          </button>
          {getDashboardId() && (
            <button
              onClick={() => handleViewDashboard(getDashboardId())}
              style={{
                backgroundColor: '#005A8C',
                color: '#FFF',
                border: 'none',
                borderRadius: '4px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Ver Dashboard
            </button>
          )}
        </div>
      </div>

      {pesquisas.length === 0 ? (
        <div
          style={{
            backgroundColor: '#F4F7F9',
            border: '1px solid #DDD',
            borderRadius: '4px',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#999', fontSize: '16px', marginBottom: '16px' }}>
            Nenhuma pesquisa criada ainda.
          </p>
          <button
            onClick={() => setShowFormNova(true)}
            style={{
              backgroundColor: '#E87522',
              color: '#FFF',
              border: 'none',
              borderRadius: '4px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Criar nova pesquisa
          </button>
        </div>
      ) : (
        <div>
          <h2 style={{ color: '#003B68', marginBottom: '16px' }}>Pesquisas Criadas</h2>
          {pesquisas.map((pesquisa) => (
            <div
              key={pesquisa.id}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #DDD',
                padding: '16px',
                borderRadius: '4px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ color: '#003B68', marginBottom: '4px' }}>{pesquisa.titulo}</h4>
                  <p style={{ color: '#666', fontSize: '13px', marginBottom: '8px' }}>
                    {pesquisa.descricao}
                  </p>
                  <span
                    style={{
                      display: 'inline-block',
                      backgroundColor:
                        pesquisa.status === 'ativa'
                          ? '#C8E6C9'
                          : pesquisa.status === 'encerrado'
                            ? '#FFE0B2'
                            : '#FFF9C4',
                      color:
                        pesquisa.status === 'ativa'
                          ? '#2E7D32'
                          : pesquisa.status === 'encerrado'
                            ? '#E65100'
                            : '#F57F17',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}
                  >
                    {pesquisa.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleViewDashboard(pesquisa.id)}
                    style={{
                      backgroundColor: '#005A8C',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Dashboard
                  </button>
                  {pesquisa.status === 'rascunho' && (
                    <button
                      onClick={() => handleActivatePesquisa(pesquisa.id)}
                      style={{
                        backgroundColor: '#E87522',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Ativar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
