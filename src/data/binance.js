const https = require('https');

const INTERVAL = '15m';
const INTERVAL_MS = 15 * 60 * 1000;
const LIMIT = 1000;
const REQUEST_DELAY_MS = 200;
const SYMBOLS_CACHE_TTL_MS = 60 * 60 * 1000;

let symbolsCache = null;
let symbolsCacheTime = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Binance API error ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

async function fetchUsdtSymbols() {
  if (symbolsCache && Date.now() - symbolsCacheTime < SYMBOLS_CACHE_TTL_MS) {
    return symbolsCache;
  }

  const info = await httpsGet('https://api.binance.com/api/v3/exchangeInfo');
  symbolsCache = info.symbols
    .filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s) => s.symbol)
    .sort();
  symbolsCacheTime = Date.now();
  return symbolsCache;
}

function fetchKlines(symbol, startTime, endTime) {
  const params = new URLSearchParams({
    symbol,
    interval: INTERVAL,
    startTime: String(startTime),
    endTime: String(endTime),
    limit: String(LIMIT),
  });

  const url = `https://api.binance.com/api/v3/klines?${params}`;

  return httpsGet(url).then((rows) =>
    rows.map((row) => ({
      t: row[0],
      o: parseFloat(row[1]),
      h: parseFloat(row[2]),
      l: parseFloat(row[3]),
      c: parseFloat(row[4]),
    })),
  );
}

async function fetchAllKlines(symbol, startDate, endDate) {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const all = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const batch = await fetchKlines(symbol, cursor, endMs);
    if (!batch.length) break;

    all.push(...batch);
    const lastTime = batch[batch.length - 1].t;
    cursor = lastTime + INTERVAL_MS;

    if (batch.length < LIMIT) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return all.filter((c) => c.t >= startMs && c.t <= endMs);
}

module.exports = { fetchAllKlines, fetchUsdtSymbols, INTERVAL_MS };
