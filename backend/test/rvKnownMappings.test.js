const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveKnownMatriculaByName } = require('../scripts/rvKnownMappings');

test('vincula Luan Leon à matrícula confirmada pelo RH', () => {
  assert.equal(resolveKnownMatriculaByName('LUAN LEON DA SILVA SANTOS'), '19376');
  assert.equal(resolveKnownMatriculaByName('  Luan   Leon da Silva Santos  '), '19376');
});

