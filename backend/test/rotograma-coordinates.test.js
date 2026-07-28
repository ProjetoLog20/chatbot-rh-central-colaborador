const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeCoordinatePair } = require('../src/utils/rotogramaCoordinates');

test('mantem coordenadas decimais validas', () => {
  assert.deepEqual(normalizeCoordinatePair('-24.9810188', '-53.5005506'), {
    latitude: '-24.9810188',
    longitude: '-53.5005506',
    valid: true
  });
});

test('restaura o sinal negativo de latitude no Sul do Brasil', () => {
  assert.deepEqual(normalizeCoordinatePair('25.0148493', '-53.2902712'), {
    latitude: '-25.0148493',
    longitude: '-53.2902712',
    valid: true
  });
});

test('corrige separadores de exibicao inseridos pelo Excel', () => {
  assert.deepEqual(normalizeCoordinatePair('-247.350,182', '-537.598,186'), {
    latitude: '-24.7350182',
    longitude: '-53.7598186',
    valid: true
  });
  assert.deepEqual(normalizeCoordinatePair('-25.394,900', '-53.1218945'), {
    latitude: '-25.3949',
    longitude: '-53.1218945',
    valid: true
  });
});

test('corrige latitude e longitude invertidas', () => {
  assert.deepEqual(normalizeCoordinatePair('-53.6381503', '-24.3556655'), {
    latitude: '-24.3556655',
    longitude: '-53.6381503',
    valid: true
  });
});

test('rejeita coordenadas fora da regiao atendida', () => {
  assert.equal(normalizeCoordinatePair('abc', '-53.5').valid, false);
  assert.equal(normalizeCoordinatePair('-90.1', '-53.5').valid, false);
});
