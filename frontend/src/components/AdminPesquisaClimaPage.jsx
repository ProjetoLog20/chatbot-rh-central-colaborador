import React, { useEffect, useState } from 'react';

export default function AdminPesquisaClimaPage() {
  const [pesquisas, setPesquisas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    anonima: false,
  });
  const [selectedPesquisa, setSelectedPesquisa] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    fetchPesquisas();
  }, []);

  const fetchPesquisas = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:4000/api/pesquisa-clima', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPesquisas(data || []);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePesquisa = async () => {
    if (!formData.titulo) {
      alert('Título é obrigatório');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:4000/api/pesquisa-clima', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      alert('Pesquisa criada com sucesso!');
      setFormData({ titulo: '', descricao: '', anonima: false });
      setShowForm(false);
      fetchPesquisas();
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao criar pesquisa');
    }
  };

  const handleActivatePesquisa = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`http://localhost:4000/api/pesquisa-clima/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'ativa' }),
      });
      alert('Pesquisa ativada!');
      fetchPesquisas();
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
      setSelectedPesquisa(id);
      setDashboard(data);
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  if (loading) {
    return <div style={{ padding: '24px' }}>Carregando...</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ color: '#003B68', marginBottom: '24px' }}>Gerenciador de Pesquisa de Clima</h2>

      <button
        onClick={() => setShowForm(!showForm)}
        style={{
          backgroundColor: '#003B68',
          color: '#FFF',
          border: 'none',
          borderRadius: '4px',
          padding: '10px 20px',
          fontSize: '14px',
          cursor: 'pointer',
          marginBottom: '24px',
        }}
      >
        {showForm ? 'Cancelar' : '+ Nova Pesquisa'}
      </button>

      {showForm && (
        <div
          style={{
            backgroundColor: '#F4F7F9',
            padding: '16px',
            borderRadius: '4px',
            marginBottom: '24px',
          }}
        >
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px' }}>Título</label>
            <input
              type="text"
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #DDD', borderRadius: '4px' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px' }}>Descrição</label>
            <textarea
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #DDD',
                borderRadius: '4px',
                minHeight: '60px',
              }}
            />
          </div>
          <label style={{ display: 'flex', gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
            <input
              type="checkbox"
              checked={formData.anonima}
              onChange={(e) => setFormData({ ...formData, anonima: e.target.checked })}
            />
            Pesquisa Anônima
          </label>
          <button
            onClick={handleCreatePesquisa}
            style={{
              backgroundColor: '#2E7D32',
              color: '#FFF',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            Criar Pesquisa
          </button>
        </div>
      )}

      {dashboard && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #DDD',
            padding: '16px',
            borderRadius: '4px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ color: '#003B68' }}>Dashboard - Resultados</h3>
            <button
              onClick={() => setDashboard(null)}
              style={{
                backgroundColor: '#DDD',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 12px',
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: '#F4F7F9', padding: '12px', borderRadius: '4px' }}>
              <p style={{ color: '#666', fontSize: '12px' }}>Total de Respostas</p>
              <p style={{ fontSize: '24px', fontWeight: '600', color: '#003B68' }}>
                {dashboard.total_respostas}
              </p>
            </div>
            <div style={{ backgroundColor: '#F4F7F9', padding: '12px', borderRadius: '4px' }}>
              <p style={{ color: '#666', fontSize: '12px' }}>Satisfação Média</p>
              <p style={{ fontSize: '24px', fontWeight: '600', color: '#E87522' }}>
                {dashboard.media_satisfacao}/5
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontWeight: '600', color: '#003B68', marginBottom: '8px' }}>Distribuição</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {Object.entries(dashboard.distribuicao).map(([label, value]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: '#666' }}>{label.replace(/_/g, ' ')}</p>
                  <p style={{ fontSize: '18px', fontWeight: '600' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {dashboard.comentarios.length > 0 && (
            <div>
              <p style={{ fontWeight: '600', color: '#003B68', marginBottom: '8px' }}>Comentários Recentes</p>
              {dashboard.comentarios.map((com, idx) => (
                <p
                  key={idx}
                  style={{
                    backgroundColor: '#F4F7F9',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    marginBottom: '8px',
                  }}
                >
                  "{com.comentario}"
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h3 style={{ color: '#003B68', marginBottom: '12px' }}>Pesquisas Criadas</h3>
        {pesquisas.length === 0 ? (
          <p style={{ color: '#999' }}>Nenhuma pesquisa criada ainda.</p>
        ) : (
          pesquisas.map((pesquisa) => (
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
                  <p style={{ color: '#666', fontSize: '13px', marginBottom: '8px' }}>{pesquisa.descricao}</p>
                  <span
                    style={{
                      display: 'inline-block',
                      backgroundColor: pesquisa.status === 'ativa' ? '#C8E6C9' : '#FFF9C4',
                      color: pesquisa.status === 'ativa' ? '#2E7D32' : '#F57F17',
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
          ))
        )}
      </div>
    </div>
  );
}
