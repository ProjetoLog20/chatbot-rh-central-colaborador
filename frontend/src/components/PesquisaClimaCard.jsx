import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function PesquisaClimaCard() {
  const [pesquisa, setPesquisa] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPesquisa = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('http://localhost:4000/api/pesquisa-clima/ativa', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setPesquisa(data.pesquisa);
      } catch (error) {
        console.error('Erro ao buscar pesquisa:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPesquisa();
  }, []);

  if (loading) return <div>Carregando...</div>;

  const status = pesquisa ? 'Pesquisa aberta' : 'Nenhuma pesquisa ativa';
  const icone = pesquisa ? '📊' : '📋';

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '16px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#003B68', marginBottom: '8px' }}>
            {icone} Pesquisa de Clima
          </h3>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '12px' }}>
            Acompanhe a satisfação dos colaboradores e participe das pesquisas internas.
          </p>
          <p style={{ color: pesquisa ? '#E87522' : '#999', fontWeight: '500', fontSize: '13px' }}>
            {status}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => navigate('/pesquisa-clima')}
            style={{
              backgroundColor: '#003B68',
              color: '#FFF',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Acessar
          </button>
          {localStorage.getItem('perfil') === 'admin' && (
            <button
              onClick={() => navigate('/admin/pesquisa-clima')}
              style={{
                backgroundColor: '#005A8C',
                color: '#FFF',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Gerenciar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
