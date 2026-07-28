function parseRegionalCoordinate(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, '');
  if (!text || !/^-?[\d.,]+$/.test(text)) return NaN;

  const sign = text.startsWith('-') ? -1 : 1;
  const unsigned = text.replace(/^-/, '');
  const separators = unsigned.match(/[.,]/g) || [];

  if (separators.length === 1) {
    return sign * Number(unsigned.replace(',', '.'));
  }

  // Algumas células do Excel chegam como "-247.350,182". Nesse formato,
  // os separadores são artefatos de exibição e a coordenada regional
  // conserva dois algarismos antes da casa decimal (-24.7350182).
  const digits = unsigned.replace(/\D/g, '');
  if (digits.length < 3) return NaN;
  return sign * Number(`${digits.slice(0, 2)}.${digits.slice(2)}`);
}

function normalizeCoordinatePair(latitude, longitude) {
  let lat = parseRegionalCoordinate(latitude);
  let lon = parseRegionalCoordinate(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { latitude: '', longitude: '', valid: false };
  }

  if (lat >= -60 && lat <= -45 && lon >= -35 && lon <= -20) {
    [lat, lon] = [lon, lat];
  }

  if (lat >= 20 && lat <= 35 && lon >= -60 && lon <= -45) lat *= -1;

  const valid = lat >= -35 && lat <= -20 && lon >= -60 && lon <= -45;
  return {
    latitude: valid ? String(lat) : '',
    longitude: valid ? String(lon) : '',
    valid
  };
}

module.exports = {
  normalizeCoordinatePair,
  parseRegionalCoordinate
};
