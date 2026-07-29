const crypto = require('crypto');

const TTL_MS = 30 * 60 * 1000;
const previews = new Map();

function cleanup() {
  const now = Date.now();
  for (const [token, item] of previews.entries()) {
    if (now - item.createdAt > TTL_MS) previews.delete(token);
  }
}

function createPreview(payload) {
  cleanup();
  const token = crypto.randomUUID();
  previews.set(token, { ...payload, createdAt: Date.now() });
  return { token, expiresInMinutes: TTL_MS / 60000 };
}

function getPreview(token, userId, type) {
  cleanup();
  const item = previews.get(String(token || ''));
  if (!item || item.userId !== userId || item.type !== type) return null;
  return item;
}

function removePreview(token) {
  previews.delete(String(token));
}

function consumePreview(token, userId, type) {
  const item = getPreview(token, userId, type);
  if (!item) return null;
  removePreview(token);
  return item;
}

module.exports = { createPreview, getPreview, removePreview, consumePreview };
