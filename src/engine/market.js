class Market {
  constructor(clock) {
    this.clock = clock;
    this.candles = {};
  }

  load(symbol, candles) {
    this.candles[symbol] = candles.slice().sort((a, b) => a.t - b.t);
  }

  getSymbols() {
    return Object.keys(this.candles);
  }

  _assertNotFuture(atTime) {
    const at = atTime instanceof Date ? atTime.getTime() : atTime;
    const now = this.clock.current?.getTime();
    if (now == null) throw new Error('Clock not initialized');
    if (at > now) {
      throw new Error('Cannot access future prices');
    }
  }

  getPrice(symbol, atTime) {
    this._assertNotFuture(atTime);
    const candles = this.candles[symbol];
    if (!candles?.length) return null;

    const at = atTime instanceof Date ? atTime.getTime() : atTime;
    let result = null;
    for (const candle of candles) {
      if (candle.t <= at) result = candle;
      else break;
    }
    return result?.c ?? null;
  }

  getCandle(symbol, atTime) {
    this._assertNotFuture(atTime);
    const candles = this.candles[symbol];
    if (!candles?.length) return null;

    const at = atTime instanceof Date ? atTime.getTime() : atTime;
    let result = null;
    for (const candle of candles) {
      if (candle.t <= at) result = candle;
      else break;
    }
    return result;
  }

  getHistory(symbol, fromTime, toTime) {
    this._assertNotFuture(toTime);
    const candles = this.candles[symbol];
    if (!candles?.length) return [];

    const from = fromTime instanceof Date ? fromTime.getTime() : fromTime;
    const to = toTime instanceof Date ? toTime.getTime() : toTime;

    return candles.filter((c) => c.t >= from && c.t <= to);
  }

  getClosePrices(symbol, count, atTime) {
    this._assertNotFuture(atTime);
    const candles = this.candles[symbol];
    if (!candles?.length) return [];

    const at = atTime instanceof Date ? atTime.getTime() : atTime;
    const eligible = candles.filter((c) => c.t <= at);
    return eligible.slice(-count).map((c) => c.c);
  }
}

module.exports = Market;
