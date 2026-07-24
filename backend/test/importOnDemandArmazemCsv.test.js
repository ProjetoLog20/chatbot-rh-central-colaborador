const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

const {
  buildRows,
  canonicalActivity,
  applyCollaboratorRoleRules,
  buildOperatorActivities,
  applyCombinedRules
} = require('../scripts/importOnDemandArmazemCsv');

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

test('relatorio Monitorar Tarefas usa Data de Criacao e agrupa os tipos do operador', () => {
  const result = buildOperatorActivities([
    { usuario: 'OPERADOR TESTE', status: 'Completa', tipo: 'Retorno de Rota (Descarregamento)', data_de_criacao: '21/06/2026 08:00' },
    { usuario: 'OPERADOR TESTE', status: 'Completa', tipo: 'Retorno de Rota (Baixar Palete)', data_de_criacao: '20/07/2026 08:00' },
    { usuario: 'OPERADOR TESTE', status: 'Completa', tipo: 'Carregamento AG - Novo', data_de_criacao: '20/07/2026 09:00' },
    { usuario: 'OPERADOR TESTE', status: 'Completa', tipo: 'Descarregamento', data_de_criacao: '21/07/2026 08:00' }
  ], '07/2026');

  assert.equal(result.validRows, 3);
  assert.equal(result.users, 1);
  assert.deepEqual(result.buckets.get('operador teste').atividades, [
    { atividade: 'Descarregamento', quantidade: 2, valuePerUnit: 0.1, total: 0.2 },
    { atividade: 'Carregamento AG - Novo', quantidade: 1, valuePerUnit: 0.1, total: 0.1 }
  ]);
});

test('calculo combinado separa tarefas, ajustes e indicadores e audita o total esperado', () => {
  const row = buildRows([
    { usuario: 'OPERADOR TESTE', atividade: 'Retrabalho/PTL', observacao: '10', finalizacao: '01/07/2026 08:00', status_tarefa: 'Finalizado' }
  ], { competencia: '07/2026' }).rows[0];
  applyCollaboratorRoleRules(row, { matricula: '123', cargo: 'Operador de Empilhadeira' });

  const operatorContext = buildOperatorActivities([
    { usuario: 'OPERADOR TESTE', status: 'Completa', tipo: 'Descarregamento', data_de_criacao: '01/07/2026 08:00' }
  ], '07/2026');
  const officialRules = {
    collaborators: {
      123: {
        task_adjustments: [{ atividade: 'Movimentação', quantidade: 2, valor_unitario: 0.1, valor: 0.2, motivo: 'Conferência' }],
        indicators: [{ nome: 'TMA', valor: 1.5 }],
        expected_total: 2.8
      }
    }
  };

  const totals = applyCombinedRules(row, { matricula: '123' }, operatorContext, officialRules, null);
  assert.deepEqual(totals, {
    tasksTotal: 1.3,
    indicatorsTotal: 1.5,
    total: 2.8,
    expectedTotal: 2.8,
    difference: 0,
    adjustments: [{
      atividade: 'Movimentação',
      quantidade: 2,
      valuePerUnit: 0.1,
      total: 0.2,
      origem: 'ajuste_oficial',
      motivo: 'Conferência'
    }]
  });
  assert.equal(row.status_auditoria, 'ok');
});
