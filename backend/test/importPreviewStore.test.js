const test = require('node:test');
const assert = require('node:assert/strict');

const { createPreview, getPreview, removePreview, consumePreview } = require('../src/importPreviewStore');

test('conferencia de importacao pertence ao administrador e so pode ser publicada uma vez', () => {
  const staged = createPreview({ type: 'rota', userId: 10, buffer: Buffer.from('arquivo') });
  assert.equal(consumePreview(staged.token, 11, 'rota'), null);
  assert.equal(consumePreview(staged.token, 10, 'armazem'), null);
  const consumed = consumePreview(staged.token, 10, 'rota');
  assert.equal(consumed.buffer.toString(), 'arquivo');
  assert.equal(consumePreview(staged.token, 10, 'rota'), null);
});

test('mantem a previa disponivel ate a publicacao terminar com sucesso', () => {
  const staged = createPreview({ type: 'rota', userId: 20, buffer: Buffer.from('rv') });
  assert.equal(getPreview(staged.token, 21, 'rota'), null);
  assert.equal(getPreview(staged.token, 20, 'van'), null);
  assert.equal(getPreview(staged.token, 20, 'rota').buffer.toString(), 'rv');
  assert.equal(getPreview(staged.token, 20, 'rota').buffer.toString(), 'rv');
  removePreview(staged.token);
  assert.equal(getPreview(staged.token, 20, 'rota'), null);
});
