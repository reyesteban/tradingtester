const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../../data/cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function cachePath(symbol, startDate, endDate) {
  return path.join(CACHE_DIR, `${symbol}_${formatDate(startDate)}_${formatDate(endDate)}.json`);
}

function trimCandles(candles, startDate, endDate) {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  return candles.filter((c) => c.t >= startMs && c.t <= endMs);
}

function isValidCandles(symbol, candles) {
  if (!candles?.length) return false;

  const closes = candles.map((c) => c.c).filter((c) => Number.isFinite(c) && c > 0);
  if (!closes.length) return false;

  const min = Math.min(...closes);
  const max = Math.max(...closes);

  if (min === max && min <= 1) return false;
  if (symbol.startsWith('BTC') && max < 1000) return false;

  return true;
}

function readCache(symbol, startDate, endDate) {
  ensureCacheDir();
  const filePath = cachePath(symbol, startDate, endDate);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf8');
  const candles = trimCandles(JSON.parse(raw), startDate, endDate);
  if (!candles.length) return null;

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const first = candles[0].t;
  const last = candles[candles.length - 1].t;

  if (first <= startMs && last >= endMs - 15 * 60 * 1000) {
    if (!isValidCandles(symbol, candles)) return null;
    return candles;
  }
  return null;
}

function writeCache(symbol, startDate, endDate, candles) {
  ensureCacheDir();
  const filePath = cachePath(symbol, startDate, endDate);
  fs.writeFileSync(filePath, JSON.stringify(candles));
  return filePath;
}

function isCached(symbol, startDate, endDate) {
  return readCache(symbol, startDate, endDate) !== null;
}

function getCacheStatus(assets, startDate, endDate) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  const cached = [];
  const missing = [];

  for (const symbol of assets) {
    if (isCached(symbol, start, end)) cached.push(symbol);
    else missing.push(symbol);
  }

  return {
    cached,
    missing,
    allCached: assets.length > 0 && missing.length === 0,
  };
}

function listCachedDatasets() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const groups = new Map();

  for (const file of files) {
    const match = file.match(/^(.+)_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) continue;

    const [, symbol, startDate, endDate] = match;
    const key = `${startDate}_${endDate}`;
    if (!groups.has(key)) {
      groups.set(key, { startDate, endDate, assets: [] });
    }
    groups.get(key).assets.push(symbol);
  }

  return [...groups.values()]
    .map((g) => ({ ...g, assets: g.assets.sort() }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
}

function deleteCachedDataset(startDate, endDate) {
  ensureCacheDir();
  const dataset = listCachedDatasets().find(
    (d) => d.startDate === startDate && d.endDate === endDate,
  );
  if (!dataset) return { deleted: [], startDate, endDate };

  const deleted = [];
  for (const symbol of dataset.assets) {
    const filePath = path.join(CACHE_DIR, `${symbol}_${startDate}_${endDate}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted.push(symbol);
    }
  }

  return { deleted, startDate, endDate };
}

module.exports = {
  readCache,
  writeCache,
  isCached,
  getCacheStatus,
  listCachedDatasets,
  deleteCachedDataset,
  CACHE_DIR,
};
