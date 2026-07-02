class Portfolio {
  constructor(id, name, initialBudget) {
    this.id = id;
    this.name = name;
    this.initialBudget = initialBudget;
    this.cash = initialBudget;
    this.positions = {};
    this.history = [];
  }

  getPosition(symbol) {
    return this.positions[symbol] ?? 0;
  }

  execute(orders, market, atTime) {
    if (!orders || orders === 'hold') return;

    const list = Array.isArray(orders) ? orders : [orders];
    for (const order of list) {
      const price = market.getPrice(order.symbol, atTime);
      if (!price || price <= 0) continue;

      if (order.side === 'buy') {
        const qty = order.qty ?? this.cash / price;
        const cost = qty * price;
        if (cost > this.cash) continue;
        this.cash -= cost;
        this.positions[order.symbol] = (this.positions[order.symbol] ?? 0) + qty;
      } else if (order.side === 'sell') {
        const held = this.positions[order.symbol] ?? 0;
        const qty = order.qty ?? held;
        if (qty > held) continue;
        this.cash += qty * price;
        this.positions[order.symbol] = held - qty;
        if (this.positions[order.symbol] === 0) delete this.positions[order.symbol];
      }
    }
  }

  totalBalance(market, atTime) {
    let total = this.cash;
    for (const [symbol, qty] of Object.entries(this.positions)) {
      const price = market.getPrice(symbol, atTime);
      if (price) total += qty * price;
    }
    return total;
  }

  snapshot(market, atTime) {
    const balance = this.totalBalance(market, atTime);
    const point = {
      t: atTime instanceof Date ? atTime.toISOString() : new Date(atTime).toISOString(),
      balance,
      cash: this.cash,
      positions: { ...this.positions },
    };
    this.history.push(point);
    return point;
  }

  toJSON(market, atTime) {
    const balance = this.totalBalance(market, atTime);
    const pnl = balance - this.initialBudget;
    const pnlPct = this.initialBudget > 0 ? (pnl / this.initialBudget) * 100 : 0;

    const holdings = Object.entries(this.positions)
      .map(([symbol, qty]) => {
        const price = market.getPrice(symbol, atTime);
        const value = price ? qty * price : 0;
        return { symbol, qty, price, value };
      })
      .filter((h) => h.qty > 0)
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    const invested = holdings.reduce((sum, h) => sum + h.value, 0);

    return {
      id: this.id,
      name: this.name,
      initialBudget: this.initialBudget,
      balance,
      cash: this.cash,
      positions: { ...this.positions },
      holdings,
      invested,
      pnl,
      pnlPct,
      winning: pnl >= 0,
    };
  }
}

module.exports = Portfolio;
