const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

const { buildRows, canonicalActivity, applyCollaboratorRoleRules } = require('../scripts/importOnDemandArmazemCsv');

test('leitor On Demand reconhece as tarefas e aplica os valores cadastrados no Yuri', () => {
  const source = [
    ['Amarração', 2],
    ['Retrabalho/PTL', 3],
    ['Repack - Lata', 10],
    ['Ressuprimento do picking', 5],
    ['Separar chopp', 2],
    ['Carregamento Van', 4],
    ['Descarregar Veículos', 2],
    ['Colocar Fitilho', 6],
    ['FEFO', 1]
  ].map(([atividade, quantidade], index) => ({
    usuario: 'COLABORADOR TESTE',
    atividade,
    observacao: String(quantidade),
    finalizacao: `0${(index % 8) + 1}/06/2026 08:00`,
    status_tarefa: 'Finalizado'
  }));

  const result = buildRows(source, { competencia: '06/2026' });
  assert.equal(result.missingValues.length, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].valor_total_previsto, 29.1);
  assert.equal(result.rows[0].pontos, 35);
});

test('leitor diferencia carregamento comum de Carregamento Van', () => {
  assert.equal(canonicalActivity('Carregamento Van'), 'Carregamento Van');
  assert.equal(canonicalActivity('Carregamento de Veiculos'), 'Demais Atividades');
  assert.equal(canonicalActivity('PNC - Geral'), 'Refugo');
  assert.equal(canonicalActivity('Remonte'), 'Remonte');
});

test('operador recebe regra de R$ 0,10 por tarefa depois do cruzamento com o cadastro', () => {
  const result = buildRows([
    { usuario: 'OPERADOR TESTE', atividade: 'Descarregar Veículos', observacao: '10', finalizacao: '01/06/2026 08:00', status_tarefa: 'Finalizado' },
    { usuario: 'OPERADOR TESTE', atividade: 'Retrabalho/PTL', observacao: '5', finalizacao: '02/06/2026 08:00', status_tarefa: 'Finalizado' }
  ], { competencia: '06/2026' });
  const row = applyCollaboratorRoleRules(result.rows[0], { cargo: 'Operador de Empilhadeira' });
  assert.equal(row.funcao_armazem, 'Operador de Empilhadeira');
  assert.equal(row.valor_total_previsto, 1.5);
  assert.deepEqual(JSON.parse(row.dados_originais_json).atividades.map((task) => task.valuePerUnit), [0.1, 0.1]);
});
