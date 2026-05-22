import { useEffect, useState } from 'react';
import { getProntuarioMe } from '../api.js';

export default function DriverPage() {
  const [prontuario, setProntuario] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getProntuarioMe().then(setProntuario).catch((err) => setError(err.error || 'Não foi possível carregar o prontuário'));
  }, []);

  if (error) return <div className="page-card"><p className="form-error">{error}</p></div>;
  if (!prontuario) return <div className="page-card"><p>Carregando...</p></div>;

  return (
    <div className="page-card">
      <h1>Prontuário do Motorista</h1>
      <div className="detail-grid">
        <div className="detail-row"><span>MATRÍCULA</span><strong>{prontuario.matricula}</strong></div>
        <div className="detail-row"><span>NOME</span><strong>{prontuario.nome_completo}</strong></div>
        <div className="detail-row"><span>PONTUAÇÃO ATUAL</span><strong>{prontuario.pontuacao_atual}</strong></div>
        <div className="detail-row"><span>FAIXA ATUAL</span><strong>{prontuario.faixa_atual}</strong></div>
        <div className="detail-row"><span>PONTOS DE ATENÇÃO</span><strong>{prontuario.pontos_de_atencao}</strong></div>
        <div className="detail-row"><span>ORIENTAÇÕES</span><strong>{prontuario.orientacoes}</strong></div>
        <div className="detail-row"><span>OBSERVAÇÕES</span><strong>{prontuario.observacoes}</strong></div>
        <div className="detail-row"><span>ATUALIZAÇÃO</span><strong>{prontuario.data_atualizacao}</strong></div>
      </div>
    </div>
  );
}
