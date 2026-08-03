const net = require('net');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 4_000;
const MAX_CACHE_ENTRIES = 10_000;
const locationCache = new Map();

function enabled() {
  return String(process.env.GEO_RESTRICTION_ENABLED || '').toLowerCase() === 'true';
}

function normalizeIp(value) {
  const raw = String(value || '').trim();
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function isPrivateIp(ip) {
  if (ip === '::1') return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(ip)) return true;
  if (net.isIP(ip) !== 4) return false;

  const octets = ip.split('.').map(Number);
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

function getCached(ip) {
  const cached = locationCache.get(ip);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    locationCache.delete(ip);
    return null;
  }
  return cached.location;
}

function cacheLocation(ip, location) {
  if (locationCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = locationCache.keys().next().value;
    if (oldestKey) locationCache.delete(oldestKey);
  }
  locationCache.set(ip, { location, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function lookupLocation(ip) {
  const cached = getCached(ip);
  if (cached) return cached;

  const token = String(process.env.IPINFO_TOKEN || '').trim();
  if (!token) throw new Error('IPINFO_TOKEN ausente');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`https://api.ipinfo.io/lookup/${encodeURIComponent(ip)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`IPinfo HTTP ${response.status}`);
  const body = await response.json();
  const location = {
    countryCode: String(body?.geo?.country_code || '').trim().toUpperCase(),
    regionCode: String(body?.geo?.region_code || '').trim().toUpperCase()
  };
  if (!location.countryCode || !location.regionCode) throw new Error('Localizacao incompleta');

  cacheLocation(ip, location);
  return location;
}

async function geoRestriction(req, res, next) {
  if (!enabled() || req.method === 'OPTIONS' || req.path === '/health') return next();

  const ip = normalizeIp(req.ip);
  const allowPrivate = String(process.env.GEO_ALLOW_PRIVATE_IPS || 'true').toLowerCase() !== 'false';
  if (allowPrivate && isPrivateIp(ip)) return next();

  try {
    const location = await lookupLocation(ip);
    if (location.countryCode === 'BR' && location.regionCode === 'PR') return next();

    console.warn(`[${req.requestId}] Acesso bloqueado por regiao: ${location.countryCode}-${location.regionCode}`);
    return res.status(403).json({
      error: 'Acesso disponivel somente no Parana.',
      code: 'GEO_BLOCKED',
      request_id: req.requestId
    });
  } catch (error) {
    console.error(`[${req.requestId}] Falha ao validar regiao:`, error?.name || 'erro');
    const failClosed = String(process.env.GEO_FAIL_CLOSED || 'true').toLowerCase() !== 'false';
    if (!failClosed) return next();
    return res.status(503).json({
      error: 'Nao foi possivel validar sua localizacao. Tente novamente em instantes.',
      code: 'GEO_UNAVAILABLE',
      request_id: req.requestId
    });
  }
}

function clearGeoCache() {
  locationCache.clear();
}

module.exports = { clearGeoCache, geoRestriction };
