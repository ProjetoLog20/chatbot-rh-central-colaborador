import React, { useState, useEffect } from 'react';

export default function AdminPesquisaClimaForm({ pesquisa, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    titulo: pesquisa?.titulo || '',
    descricao: pesquisa?.descricao || '',
    anonima: pesquisa?.anonima || false,
    status: pesquisa?.status || 'rascunho',
    data_inicio: pesquisa?.data_inicio?.split('T')[0] || '',
    data_fim: pesquisa?.data_fim?.split('T')[0] || '',
  });

  const [perguntas, setPerguntas] = useState([]);
  const [novaPerguntas, setNovaPerguntas] = useState(null);
  const [loadingPerguntas, setLoadingPerguntas] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (pesquisa?.id) {
      fetchPerguntas();
    } else {
      setPerguntas([
        {
          id: `temp_1`,
          pergunta: 'Como você avalia o seu ambiente de trabalho?',
          tipo: 'nota',
          ordem: 1,
          obrigatoria: true,
          opcoes: null,
        },
        {
          id: `temp_2`,
          pergunta: 'Você se sente valorizado pelo seu gestor?',
          tipo: 'sim_nao',
          ordem: 2,
          obrigatoria: true,
          opcoes: null,
        },
        {
          id: `temp_3`,
          pergunta: 'Qual é sua principal sugestão de melhoria?',
          tipo: 'texto',
          ordem: 3,
          obrigatoria: false,
          opcoes: null,
        },
        {
          id: `temp_4`,
          pergunta: 'Como você avalia a comunicação interna?',
          tipo: 'nota',
          ordem: 4,
          obrigatoria: true,
          opcoes: null,
        },
      ]);
    }
  }, [pesquisa?.id]);

  const fetchPerguntas = async () => {
    setLoadingPerguntas(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/pesquisa-clima/${pesquisa.id}/perguntas`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setPerguntas(
        (data || []).map((item) => ({
          ...item,
          opcoes: typeof item.opcoes === 'string' && item.opcoes ? item.opcoes.split(',').map((o) => o.trim()).filter(Boolean) : item.opcoes,
        }))
      );
    } catch (error) {
      console.error('Erro ao buscar perguntas:', error);
    } finally {
      setLoadingPerguntas(false);
    }
  };

  const handleAddPergunta = () => {
    const newId = `temp_${Date.now()}`;
    setPerguntas([
      ...perguntas,
      {
        id: newId,
        pergunta: '',
        tipo: 'nota',
        ordem: perguntas.length + 1,
        obrigatoria: true,
        opcoes: null,
      },
    ]);
  };

  const handleRemovePergunta = (id) => {
    setPerguntas(perguntas.filter((p) => p.id !== id));
  };

  const handleChangePergunta = (id, field, value) => {
    setPerguntas(
      perguntas.map((p) =>
        p.id === id ? { ...p, [field]: value } : p
      )
    );
  };

  const handleSave = async () => {
    if (!formData.titulo) {
      alert('Título é obrigatório');
      return;
    }

    setEnviando(true);
    try {
      const token = localStorage.getItem('token');

      let pesquisaId = pesquisa?.id;

      if (!pesquisaId) {
        const resCreatePesquisa = await fetch(
          '/api/pesquisa-clima',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              titulo: formData.titulo,
              descricao: formData.descricao,
              anonima: formData.anonima,
              status: formData.status,
              data_inicio: formData.data_inicio || null,
              data_fim: formData.data_fim || null,
              defaultQuestions: !pesquisa?.id,
            }),
          }
        );

        if (!resCreatePesquisa.ok) {
          throw new Error('Erro ao criar pesquisa');
        }

        const dataPesquisa = await resCreatePesquisa.json();
        pesquisaId = dataPesquisa.id;
      } else {
        await fetch(`/api/pesquisa-clima/${pesquisaId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        });
      }

      // Adicionar perguntas novas (que têm ID temporário)
      for (const pergunta of perguntas) {
        if (pergunta.id?.startsWith('temp_')) {
          await fetch(`/api/pesquisa-clima/${pesquisaId}/perguntas`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              pergunta: pergunta.pergunta,
              tipo: pergunta.tipo,
              ordem: pergunta.ordem,
              obrigatoria: pergunta.obrigatoria,
              opcoes: pergunta.opcoes ? (Array.isArray(pergunta.opcoes) ? pergunta.opcoes.join(',') : pergunta.opcoes) : null,
            }),
          });
        }
      }

      alert('Pesquisa salva com sucesso!');
      onSave?.();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar pesquisa');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #DDD',
        borderRadius: '4px',
        padding: '24px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}
    >
      <h2 style={{ color: '#003B68', marginBottom: '24px' }}>
        {pesquisa ? 'Editar Pesquisa' : 'Nova Pesquisa de Clima'}
      </h2>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#003B68' }}>
          Título *
        </label>
        <input
          type="text"
          value={formData.titulo}
          onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #DDD',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#003B68' }}>
          Descrição
        </label>
        <textarea
          value={formData.descricao}
          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #DDD',
            borderRadius: '4px',
            minHeight: '60px',
            fontSize: '14px',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#003B68' }}>
            Data de Início
          </label>
          <input
            type="date"
            value={formData.data_inicio}
            onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #DDD',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#003B68' }}>
            Data de Fim
          </label>
          <input
            type="date"
            value={formData.data_fim}
            onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #DDD',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#003B68' }}>
          Status
        </label>
        <select
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #DDD',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          <option value="rascunho">Rascunho</option>
          <option value="ativa">Ativa</option>
        </select>
      </div>

      <label style={{ display: 'flex', gap: '8px', cursor: 'pointer', marginBottom: '24px', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={formData.anonima}
          onChange={(e) => setFormData({ ...formData, anonima: e.target.checked })}
        />
        <span style={{ fontWeight: '500', color: '#003B68' }}>Pesquisa Anônima</span>
      </label>

      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ color: '#003B68', margin: 0 }}>Perguntas</h3>
          <button
            onClick={handleAddPergunta}
            style={{
              backgroundColor: '#E87522',
              color: '#FFF',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            + Adicionar Pergunta
          </button>
        </div>

        {perguntas.map((pergunta, idx) => (
          <div
            key={pergunta.id}
            style={{
              backgroundColor: '#F4F7F9',
              padding: '16px',
              borderRadius: '4px',
              marginBottom: '12px',
            }}
          >
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', fontSize: '12px', color: '#666' }}>
                Pergunta
              </label>
              <input
                type="text"
                value={pergunta.pergunta}
                onChange={(e) => handleChangePergunta(pergunta.id, 'pergunta', e.target.value)}
                placeholder="Digite a pergunta"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #DDD',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', fontSize: '12px', color: '#666' }}>
                  Tipo
                </label>
                <select
                  value={pergunta.tipo}
                  onChange={(e) => handleChangePergunta(pergunta.id, 'tipo', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #DDD',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                >
                  <option value="nota">Nota (1-5)</option>
                  <option value="sim_nao">Sim/Não</option>
                  <option value="texto">Texto</option>
                  <option value="opcao">Múltipla Escolha</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'flex', gap: '8px', cursor: 'pointer', alignItems: 'center', marginTop: '22px' }}>
                  <input
                    type="checkbox"
                    checked={pergunta.obrigatoria}
                    onChange={(e) => handleChangePergunta(pergunta.id, 'obrigatoria', e.target.checked)}
                  />
                  <span style={{ fontSize: '14px', color: '#666' }}>Obrigatória</span>
                </label>
              </div>
            </div>

            {pergunta.tipo === 'opcao' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', fontSize: '12px', color: '#666' }}>
                  Opções (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={Array.isArray(pergunta.opcoes) ? pergunta.opcoes.join(', ') : pergunta.opcoes || ''}
                  onChange={(e) => handleChangePergunta(pergunta.id, 'opcoes', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #DDD',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
              </div>
            )}

            <button
              onClick={() => handleRemovePergunta(pergunta.id)}
              style={{
                backgroundColor: '#DDD',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#666',
              }}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            backgroundColor: '#DDD',
            border: 'none',
            borderRadius: '4px',
            padding: '10px 20px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={enviando}
          style={{
            backgroundColor: '#003B68',
            color: '#FFF',
            border: 'none',
            borderRadius: '4px',
            padding: '10px 20px',
            cursor: enviando ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            opacity: enviando ? 0.7 : 1,
          }}
        >
          {enviando ? 'Salvando...' : 'Salvar Pesquisa'}
        </button>
      </div>
    </div>
  );
}
