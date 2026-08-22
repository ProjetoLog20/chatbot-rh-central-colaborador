const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const DEFAULT_RESET_PASSWORD = 'log20';

function generateTemporaryPassword(length = 12) {
  const size = Math.min(32, Math.max(10, Number(length) || 12));
  let value = '';
  for (let index = 0; index < size; index += 1) {
    value += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return value;
}

module.exports = { DEFAULT_RESET_PASSWORD, generateTemporaryPassword };
