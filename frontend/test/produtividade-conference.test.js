import assert from 'node:assert/strict';
import test from 'node:test';

import { countPendingIndicatorDecisions } from '../src/components/produtividadeConference.js';

const rows = [
  { matricula: '19326', vinculado: true },
  { matricula: '19375', vinculado: true }
];

const indicatorReviews = {
  19326: [
    { nome: 'Indicador 1', decisao: '' },
    { nome: 'Indicador 2', decisao: '' },
    { nome: 'Indicador 3', decisao: '' },
    { nome: 'Indicador 4', decisao: '' }
  ],
  19375: [
    { nome: 'Indicador 1', decisao: '' },
    { nome: 'Indicador 2', decisao: '' },
    { nome: 'Indicador 3', decisao: '' },
    { nome: 'Indicador 4', decisao: '' }
  ]
};

test('não bloqueia a publicação de Rota ou VAN por indicadores do Armazém', () => {
  assert.equal(countPendingIndicatorDecisions('rota', rows, indicatorReviews), 0);
});

test('continua exigindo as decisões na conferência do Armazém', () => {
  assert.equal(countPendingIndicatorDecisions('armazem', rows, indicatorReviews), 8);

  indicatorReviews['19326'][0].decisao = 'atingiu';
  assert.equal(countPendingIndicatorDecisions('armazem', rows, indicatorReviews), 7);
});
