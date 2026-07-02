function sma(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ensureState(params) {
  if (!params._entryPrices) params._entryPrices = {};
  return params._entryPrices;
}

function hasGrowthTrend(market, symbol, clock, { trendShort, trendLong, minGrowthPct }) {
  const prices = market.getClosePrices(symbol, trendLong, clock.current);
  if (prices.length < trendLong) return false;

  const current = prices[prices.length - 1];
  const shortSma = sma(prices.slice(-trendShort));
  const longSma = sma(prices);
  if (shortSma == null || longSma == null) return false;

  const lookbackPrice = prices[0];
  const growthPct = ((current - lookbackPrice) / lookbackPrice) * 100;

  return shortSma > longSma && current > shortSma && growthPct >= minGrowthPct;
}

module.exports = {
  id: 'suaxgrouth',
  name: 'SUAXGROUTH',
  description:
    'Compra solo activos en tendencia alcista (SMA corta > larga, precio por encima de la media y crecimiento reciente). ' +
    'Cierra posiciones con stop loss del 1% o take profit del 10% respecto al precio de entrada.',
  assetsMode: 'multiple',
  defaultParams: {
    symbols: ['BTCUSDT', 'ETHUSDT'],
    stopLossPct: 1,
    takeProfitPct: 10,
    trendShort: 10,
    trendLong: 30,
    minGrowthPct: 0.5,
  },
  onTick({ portfolio, market, params, clock }) {
    const symbols = params.symbols ?? [];
    if (!symbols.length) return 'hold';

    const {
      stopLossPct = 1,
      takeProfitPct = 10,
      trendShort = 10,
      trendLong = 30,
      minGrowthPct = 0.5,
    } = params;

    const entryPrices = ensureState(params);
    const orders = [];
    const trendOpts = { trendShort, trendLong, minGrowthPct };

    for (const symbol of symbols) {
      const held = portfolio.getPosition(symbol);
      if (held <= 0) continue;

      const price = market.getPrice(symbol, clock.current);
      const entry = entryPrices[symbol];
      if (!price || !entry) continue;

      const pnlPct = ((price - entry) / entry) * 100;

      if (pnlPct <= -stopLossPct || pnlPct >= takeProfitPct) {
        orders.push({ side: 'sell', symbol });
        delete entryPrices[symbol];
      }
    }

    const candidates = symbols.filter((symbol) => {
      if (portfolio.getPosition(symbol) > 0) return false;
      return hasGrowthTrend(market, symbol, clock, trendOpts);
    });

    if (candidates.length && portfolio.cash > 0) {
      const cashPerSymbol = portfolio.cash / candidates.length;

      for (const symbol of candidates) {
        const price = market.getPrice(symbol, clock.current);
        if (!price || price <= 0) continue;

        orders.push({ side: 'buy', symbol, qty: cashPerSymbol / price });
        entryPrices[symbol] = price;
      }
    }

    return orders.length ? orders : 'hold';
  },
};
