const KNOWN_MATRICULA_BY_NAME = new Map([
  ['luan leon da silva santos', '19376']
]);

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function resolveKnownMatriculaByName(value) {
  return KNOWN_MATRICULA_BY_NAME.get(normalizeName(value)) || '';
}

module.exports = { resolveKnownMatriculaByName };
