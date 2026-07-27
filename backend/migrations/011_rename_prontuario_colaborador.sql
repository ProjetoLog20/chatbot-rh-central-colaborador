UPDATE configuracoes_modulos
SET nome = 'Prontuário do Colaborador',
    updated_at = CURRENT_TIMESTAMP
WHERE chave = 'prontuario_motorista';
