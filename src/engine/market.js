class Market {
  constructor(clock) {
    this.clock = clock;
    this.candles = {};
  }

  load(symbol, candles) {
    this.candles[symbol] = candles.slice().sort((a, b) => a.t - b.t);
  }

  clear() {
    this.candles = {};
  }

  getDataBounds() {
    const symbols = this.getSymbols();
    if (!symbols.length) return null;

    let start = -Infinity;
    let end = Infinity;

    for (const symbol of symbols) {
      const candles = this.candles[symbol];
      if (!candles?.length) return null;
      start = Math.max(start, candles[0].t);
      end = Math.min(end, candles[candles.length - 1].t);
    }

    if (start > end) return null;

    return {
      start: new Date(start),
      end: new Date(end),
    };
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
