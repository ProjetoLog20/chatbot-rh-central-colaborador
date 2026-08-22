const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

const {
  buildRows,
  canonicalActivity,
  applyCollaboratorRoleRules,
  buildOperatorActivities,
  applyCombinedRules,
  applyWmsIndicatorRules,
  applyAdditionalValue,
  normalizeAdditionalValues,
  parseCsvBuffer,
  normalizeComparableName,
  normalizeCompetencia
} = require('../scripts/importOnDemandArmazemCsv');

test('competência do seletor mensal é convertida para o padrão do armazém', () => {
  assert.equal(normalizeCompetencia('2026-08'), '08/2026');
  assert.equal(normalizeCompetencia('8/2026'), '08/2026');
  assert.equal(normalizeCompetencia('2026-13'), null);
});

test('leitor reconhece CSV exportado em Windows-1252 sem quebrar os cabeçalhos acentuados', () => {
  const csv = [
    'Armazém;Atividade;Usuário;Finalização;Status Tarefa;Observação',
    'BRD8;Amarração;COLABORADOR TESTE;21/07/2026 08:00;Finalizado;2'
  ].join('\r\n');
  const rows = parseCsvBuffer(Buffer.from(csv, 'latin1'));

  assert.deepEqual(rows[0], {
    armazem: 'BRD8',
    atividade: 'Amarração',
    usuario: 'COLABORADOR TESTE',
    finalizacao: '21/07/2026 08:00',
    status_tarefa: 'Finalizado',
    observacao: '2'
  });

  const result = buildRows(rows, { competencia: '08/2026' });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].valor_total_previsto, 2.5);
});

test('comparação de nomes tolera preposições diferentes no relatório', () => {
  assert.equal(
    normalizeComparableName('ANTONIO CARLOS LUCAS DO SANTOS'),
    normalizeComparableName('ANTONIO CARLOS LUCAS DOS SANTOS')
  );
});

test('leitor mantém o CSV UTF-8 e reconhece Monitorar Tarefas em Windows-1252', () => {
  const utf8Rows = parseCsvBuffer(Buffer.from([
    'Atividade;Usuário;Finalização;Status Tarefa;Observação',
    'Amarração;COLABORADOR TESTE;21/07/2026 08:00;Finalizado;1'
  ].join('\n'), 'utf8'));
  assert.equal(utf8Rows[0].usuario, 'COLABORADOR TESTE');
  assert.equal(utf8Rows[0].atividade, 'Amarração');

  const operatorCsv = [
    'Armazém;Status;Tipo;Usuário;Data de Criação',
    'BRD8;Completa;Descarregamento;OPERADOR TESTE;21/07/2026 08:00'
  ].join('\r\n');
  const operatorRows = parseCsvBuffer(Buffer.from(operatorCsv, 'latin1'));
  const operatorResult = buildOperatorActivities(operatorRows, '08/2026');
  assert.equal(operatorResult.validRows, 1);
  assert.equal(operatorResult.users, 1);
});

test('importação rejeita relatórios com cabeçalhos incompatíveis em vez de calcular zero', () => {
  assert.throws(
    () => buildRows([{ coluna_errada: 'valor' }], { competencia: '08/2026' }),
    /arquivo On Demand não possui as colunas esperadas/
  );
  assert.throws(
    () => buildOperatorActivities([{ coluna_errada: 'valor' }], '08/2026'),
    /arquivo Monitorar Tarefas não possui as colunas esperadas/
  );
});

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

test('indicadores externos só entram no cálculo depois da confirmação manual', () => {
  const buildRow = () => {
    const row = buildRows([
      { usuario: 'OPERADOR TESTE', atividade: 'Retrabalho/PTL', observacao: '10', finalizacao: '01/07/2026 08:00', status_tarefa: 'Finalizado' }
    ], { competencia: '07/2026' }).rows[0];
    applyCollaboratorRoleRules(row, { matricula: '123', cargo: 'Operador de Empilhadeira' });
    return row;
  };
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

  const pendingRow = buildRow();
  const pendingTotals = applyCombinedRules(pendingRow, { matricula: '123' }, operatorContext, officialRules);
  assert.equal(pendingTotals.tasksTotal, 1.3);
  assert.equal(pendingTotals.indicatorsTotal, 0);
  assert.equal(pendingTotals.total, 1.3);
  assert.deepEqual(pendingTotals.availableIndicators, [{ nome: 'TMA', valor: 1.5 }]);
  assert.equal(pendingRow.status_auditoria, 'pendente_indicadores');

  const confirmedRow = buildRow();
  const confirmedTotals = applyCombinedRules(confirmedRow, { matricula: '123' }, operatorContext, officialRules, {
    123: [{ nome: 'TMA', valor: 1.5, confirmado: true }]
  });
  assert.equal(confirmedTotals.tasksTotal, 1.3);
  assert.equal(confirmedTotals.indicatorsTotal, 1.5);
  assert.equal(confirmedTotals.total, 2.8);
  assert.equal(confirmedTotals.difference, 0);
  assert.deepEqual(confirmedTotals.selectedIndicators, [{ nome: 'TMA', valor: 1.5 }]);
  assert.equal(confirmedRow.status_auditoria, 'ok');
});

test('conferência oferece indicadores padrão quando a competência ainda não possui regra específica', () => {
  const buildRow = () => {
    const row = buildRows([
      { usuario: 'OPERADOR TESTE', atividade: 'Retrabalho/PTL', observacao: '10', finalizacao: '01/08/2026 08:00', status_tarefa: 'Finalizado' }
    ], { competencia: '08/2026' }).rows[0];
    applyCollaboratorRoleRules(row, { matricula: '123', cargo: 'Operador de Empilhadeira' });
    return row;
  };
  const colaborador = { matricula: '123', cargo: 'Operador de Empilhadeira' };
  const officialRules = { collaborators: {} };

  const pendingRow = buildRow();
  const pending = applyCombinedRules(pendingRow, colaborador, null, officialRules);
  assert.deepEqual(pending.availableIndicators, [
    { nome: 'Eficiência de carregamento', valor: 50 },
    { nome: 'TMA', valor: 100 },
    { nome: 'Eficiência de descarga', valor: 50 }
  ]);
  assert.equal(pending.indicatorsTotal, 0);
  assert.equal(pendingRow.status_auditoria, 'pendente_indicadores');

  const confirmedRow = buildRow();
  const confirmed = applyCombinedRules(confirmedRow, colaborador, null, officialRules, {
    123: [{ nome: 'TMA', valor: 100, confirmado: true }]
  });
  assert.equal(confirmed.indicatorsTotal, 100);
  assert.deepEqual(confirmed.selectedIndicators, [{ nome: 'TMA', valor: 100 }]);
});

test('relatório WMS também exige confirmação manual antes de somar metas externas', () => {
  const officialRules = {
    collaborators: {
      123: {
        indicators: [{ nome: 'TMA', valor: 100 }],
        expected_total: 120
      }
    }
  };
  const buildRow = () => ({
    rv_nova: 20,
    valor_total_previsto: 20,
    faixa: 'Faixa 1',
    status_produtividade: 'Elegivel',
    origem_calculo: 'wms_separacao_faixas_diarias',
    status_auditoria: 'pendente_conferencia_erros',
    mensagem_rh: 'RV calculada.',
    dados_originais_json: JSON.stringify({ dias: [{ valor_rv: 20 }] })
  });
  const baseTotals = { tasksTotal: 20, total: 20, expectedTotal: null, difference: 0, adjustments: [] };

  const pendingRow = buildRow();
  const pending = applyWmsIndicatorRules(pendingRow, { matricula: '123' }, officialRules, {}, baseTotals);
  assert.equal(pending.total, 20);
  assert.equal(pending.indicatorsTotal, 0);
  assert.equal(pendingRow.status_auditoria, 'pendente_indicadores');

  const confirmedRow = buildRow();
  const confirmed = applyWmsIndicatorRules(confirmedRow, { matricula: '123' }, officialRules, {
    123: [{ nome: 'TMA', valor: 100, confirmado: true }]
  }, baseTotals);
  const original = JSON.parse(confirmedRow.dados_originais_json);
  assert.equal(confirmed.total, 120);
  assert.equal(confirmedRow.valor_total_previsto, 120);
  assert.equal(original.tarefasTotal, 20);
  assert.deepEqual(original.indicators, [{ nome: 'TMA', valor: 100 }]);
});

test('valor adicional exige observação, entra no total e fica registrado para o colaborador', () => {
  assert.throws(
    () => normalizeAdditionalValues({ 123: { valor: 25, observacao: '' } }),
    /Informe a observação do valor adicional/
  );

  const row = {
    rv_nova: 10,
    valor_total_previsto: 10,
    faixa: 'Elegivel',
    status_produtividade: 'Elegivel',
    origem_calculo: 'on_demand',
    status_auditoria: 'ok',
    mensagem_rh: 'RV calculada.',
    dados_originais_json: JSON.stringify({ atividades: [] })
  };
  const additions = normalizeAdditionalValues({ 123: { valor: '25,50', observacao: 'Apoio no inventário' } });
  const totals = applyAdditionalValue(row, { matricula: '123' }, { total: 10, expectedTotal: null, difference: 0 }, additions);
  const original = JSON.parse(row.dados_originais_json);

  assert.equal(totals.additionalTotal, 25.5);
  assert.equal(totals.total, 35.5);
  assert.equal(row.valor_total_previsto, 35.5);
  assert.match(row.mensagem_rh, /Apoio no inventário/);
  assert.deepEqual(original.additionalValues, [{ valor: 25.5, observacao: 'Apoio no inventário' }]);
});
