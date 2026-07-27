const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWmsSeparationRows,
  wmsDailyRange
} = require('../scripts/importOnDemandArmazemCsv');

test('aplica os limites oficiais das faixas de RV do WMS', () => {
  assert.equal(wmsDailyRange(12500).faixa, 'Faixa 1');
  assert.equal(wmsDailyRange(12501).faixa, 'Faixa 2');
  assert.equal(wmsDailyRange(16625).faixa, 'Faixa 2');
  assert.equal(wmsDailyRange(16626).faixa, 'Faixa 3');
  assert.equal(wmsDailyRange(20750).faixa, 'Faixa 3');
  assert.equal(wmsDailyRange(20751).faixa, 'Faixa 4');
});

test('calcula a faixa por dia antes de somar a RV da competência', () => {
  const result = buildWmsSeparationRows([
    {
      data_de_entrega: '21/07/2026 - 00:00:00',
      usuario_finalizou_palete: 'USUARIO-WMS',
      pontuacao: '10.000',
      esforco: '5.000'
    },
    {
      data_de_entrega: '22/07/2026 - 00:00:00',
      usuario_finalizou_palete: 'USUARIO-WMS',
      pontuacao: '21.000',
      esforco: '10.000'
    }
  ], { competencia: '08/2026' });

  assert.equal(result.sourceType, 'wms_separacao');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].pontos, 31000);
  assert.equal(result.rows[0].rv_antiga, 43.4);
  assert.equal(result.rows[0].rv_nova, 72.506);
  assert.match(result.rows[0].faixa, /Faixa 1: 1 dia/);
  assert.match(result.rows[0].faixa, /Faixa 4: 1 dia/);
});
