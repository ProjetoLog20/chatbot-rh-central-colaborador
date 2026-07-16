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

test('One Pager define função e valor final mesmo quando o código aparece no tabelão errado', () => {
  const workbook = xlsx.utils.book_new();
  const onePager = Array.from({ length: 3 }, () => []);
  onePager[0][19] = 'COD';
  onePager[0][20] = 'MOTORISTA';
  onePager[2][19] = 460;
  onePager[2][20] = 'FLAVIO MARCELO VAZ';
  const motorTable = [['Mês', 7], ['Motorista', 'Caixas', 'Entregas', 'Nova RV']];
  const helperTable = [['Mês', 7], ['Ajudante', 'Caixas', 'Entregas', 'Nova RV'], [460, 100, 10, 999]];
  const data = [Array(152).fill('')];
  const factor1 = Array(152).fill('');
  factor1[8] = 7; factor1[9] = 460; factor1[12] = 1; factor1[15] = 0; factor1[16] = 0;
  factor1[31] = 1982; factor1[32] = 181; factor1[151] = 100;
  const factor2 = Array(152).fill('');
  factor2[8] = 7; factor2[9] = 460; factor2[12] = 2; factor2[15] = 0; factor2[16] = 0;
  factor2[31] = 678; factor2[32] = 26; factor2[151] = 100;
  data.push(factor1, factor2);
  for (let index = 0; index < 13; index += 1) {
    const mapOnly = Array(152).fill('');
    mapOnly[8] = 7; mapOnly[9] = 460; mapOnly[12] = 0; mapOnly[16] = 0;
    data.push(mapOnly);
  }
  const plan = Array.from({ length: 12 }, () => Array(14).fill(''));
  plan[9][9] = 0.035;
  plan[11][9] = 200;
  plan[11][12] = 200;
  plan[11][13] = 140;
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(onePager), 'One Pager');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(motorTable), 'Tabelão_Mot');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(helperTable), 'Tabelão_Ajd');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(data), '2art-FF');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(plan), 'Planificador');

  const rows = previewOfficialWorkbook({ buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].codigo_rv, '460');
  assert.equal(rows[0].funcao_rv, 'motorista');
  assert.equal(rows[0].caixas, 2660);
  assert.equal(rows[0].entregas, 207);
  assert.equal(rows[0].premio_produtividade, 685.52);
});
