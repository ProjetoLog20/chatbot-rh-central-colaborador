const test = require('node:test');
const assert = require('node:assert/strict');
const xlsx = require('xlsx');

const { previewOfficialWorkbook, buildPayload } = require('../scripts/importRvXlsx');

function workbookBuffer(onePagerRows, tableRows) {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(onePagerRows), 'One Pager');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(tableRows), 'Tabelão_Mot');
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('leitor VAN usa regras do One Pager e ignora linhas auxiliares fora da equipe', () => {
  const buffer = workbookBuffer(
    [
      ['', '', '', '', '', '', '', '', '', 'COD', 'MOTORISTA'],
      ['', '', '', '', '', '', '', '', '', '498', 'MOTORISTA VAN']
    ],
    [
      ['', '', 'Mês', 7],
      ['', 'Motorista', 'Caixas', 'Entregas', '% DEV', 'Mapas', 'Caixa/viagem', 'Drop Médio', 'Média Qtd Entrg', 'Antiga RV', 'Nova RV'],
      ['', 498, 652.84, 266, 0.02419, 14, 46.63, 2.4, 19, '', 15],
      ['', 481, 48.52, 16, 0, 1, 48.52, 3, 16, '', 999]
    ]
  );

  const rows = previewOfficialWorkbook({ buffer });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].codigo_rv, '498');
  assert.equal(rows[0].premio_produtividade, 477.0976);
  assert.equal(rows[0].metodo_cruzamento, 'one_pager_van_codigo_rv');
  assert.equal(rows[0].competencia, '07/2026');
});

test('leitor principal preserva o valor oficial de Nova RV', () => {
  const buffer = workbookBuffer(
    [
      ['COD', 'MOTORISTA'],
      ['63', 'MOTORISTA ROTA']
    ],
    [
      ['Mês', 7],
      ['Motorista', 'Caixas', 'Entregas', '% DEV', 'Mapas', 'Ftr 1 C/Jorn.', 'Nova RV'],
      [63, 100, 10, 0.02, 1, 100, 321.45]
    ]
  );

  const rows = previewOfficialWorkbook({ buffer });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].premio_produtividade, 321.45);
  assert.equal(rows[0].metodo_cruzamento, 'one_pager_codigo_rv');
});

test('leitor principal respeita Nova RV oficial zerada mesmo quando existe atividade', () => {
  const buffer = workbookBuffer(
    [
      ['COD', 'MOTORISTA'],
      ['506', 'MOTORISTA SEM PREMIO']
    ],
    [
      ['Mês', 7],
      ['Motorista', 'Caixas', 'Entregas', '% DEV', 'Mapas', 'Ftr 1 C/Jorn.', 'Nova RV'],
      [506, 2000, 100, 0.02, 10, 2000, 0]
    ]
  );

  const rows = previewOfficialWorkbook({ buffer });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].premio_produtividade, 0);
  assert.equal(rows[0].status_produtividade, 'Sem premio');
});

test('gravação não transforma prêmio oficial zero em bônus', () => {
  const payload = buildPayload({
    competencia: '07/2026',
    funcao_rv: 'motorista',
    premio_produtividade: 0,
    bonus: 200,
    bateu_devolucao: 'sim',
    status_produtividade: 'Sem premio'
  }, { id: 1, matricula: '1', nome_completo: 'Teste', cpf: '' }, 99);

  assert.equal(payload.bonus, 200);
  assert.equal(payload.valor_total_previsto, 0);
  assert.equal(payload.nova_rv, 0);
});
