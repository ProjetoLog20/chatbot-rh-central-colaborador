INSERT INTO permissoes_colaboradores (colaborador_id, permissao, ativo)
SELECT id, 'campeoes_seguranca_editar', true
FROM colaboradores
WHERE matricula = '19022'
ON CONFLICT (colaborador_id, permissao)
DO UPDATE SET ativo = true;
