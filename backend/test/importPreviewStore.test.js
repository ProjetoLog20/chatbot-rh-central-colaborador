const test = require('node:test');
const assert = require('node:assert/strict');

const { createPreview, consumePreview } = require('../src/importPreviewStore');

test('conferencia de importacao pertence ao administrador e so pode ser publicada uma vez', () => {
  const staged = createPreview({ type: 'rota', userId: 10, buffer: Buffer.from('arquivo') });
  assert.equal(consumePreview(staged.token, 11, 'rota'), null);
  assert.equal(consumePreview(staged.token, 10, 'armazem'), null);
  const consumed = consumePreview(staged.token, 10, 'rota');
  assert.equal(consumed.buffer.toString(), 'arquivo');
  assert.equal(consumePreview(staged.token, 10, 'rota'), null);
});
