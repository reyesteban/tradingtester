function sma(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

module.exports = {
  id: 'sma-crossover',
  name: 'SMA Crossover',
  description:
    'Usa dos medias móviles simples (corta y larga). Compra cuando la corta cruza por encima de la larga y vende cuando cruza por debajo.',
  assetsMode: 'single',
  defaultParams: { symbols: ['BTCUSDT'], short: 10, long: 30 },
  onTick({ portfolio, market, params, clock }) {
    const symbol = params.symbols?.[0] ?? params.symbol;
    const { short, long } = params;
    if (!symbol) return 'hold';

    const prices = market.getClosePrices(symbol, long, clock.current);
    if (prices.length < long) return 'hold';

    const shortSma = sma(prices.slice(-short));
    const longSma = sma(prices);

    if (shortSma == null || longSma == null) return 'hold';

    const held = portfolio.getPosition(symbol);

    if (shortSma > longSma && held === 0) {
      return { side: 'buy', symbol };
    }
    if (shortSma < longSma && held > 0) {
      return { side: 'sell', symbol };
    }
    return 'hold';
  },
};
