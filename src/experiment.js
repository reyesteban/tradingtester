const Clock = require('./engine/clock');
const Market = require('./engine/market');
const Portfolio = require('./engine/portfolio');
const Simulator = require('./engine/simulator');
const { fetchAllKlines } = require('./data/binance');
const { readCache, writeCache, getCacheStatus, listCachedDatasets } = require('./data/cache');
const { getStrategy } = require('./strategies/registry');

const DEFAULT_CONFIG = {
  startDate: '2025-01-01',
  endDate: '2025-03-01',
  assets: ['BTCUSDT'],
  bots: [
    { strategyId: 'buy-and-hold', budget: 10000, params: { symbol: 'BTCUSDT' } },
    { strategyId: 'sma-crossover', budget: 10000, params: { symbol: 'BTCUSDT', short: 10, long: 30 } },
  ],
  accelerationFactor: 10,
};

class Experiment {
  constructor() {
    this.status = 'idle';
    this.config = { ...DEFAULT_CONFIG };
    this.clock = new Clock();
    this.market = new Market(this.clock);
    this.bots = [];
    this.downloadProgress = null;
    this.simulator = new Simulator(this);
    this._initClock();
    this.resetBots();
  }

  _initClock() {
    const start = new Date(this.config.startDate);
    const end = new Date(this.config.endDate);
    this.clock.configure(start, end);
  }

  configure(body) {
    if (this.status === 'running' || this.status === 'downloading') {
      throw new Error('Cannot configure while running or downloading');
    }

    this.config = {
      ...this.config,
      ...body,
      startDate: body.startDate ?? this.config.startDate,
      endDate: body.endDate ?? this.config.endDate,
      assets: body.assets ?? this.config.assets,
      bots: body.bots ?? this.config.bots,
      accelerationFactor: body.accelerationFactor ?? this.config.accelerationFactor,
    };

    const start = new Date(this.config.startDate);
    const end = new Date(this.config.endDate);
    if (end <= start) throw new Error('endDate must be after startDate');

    this.clock.configure(start, end);
    this.status = 'idle';
    this.resetBots();
  }

  resetBots() {
    this.bots = this.config.bots.map((botConfig, i) => {
      const strategy = getStrategy(botConfig.strategyId);
      if (!strategy) throw new Error(`Unknown strategy: ${botConfig.strategyId}`);

      const params = { ...strategy.defaultParams, ...botConfig.params };
      const portfolio = new Portfolio(
        `bot-${i}`,
        strategy.name,
        botConfig.budget ?? 10000,
      );

      return { strategy, params, portfolio };
    });
  }

  async download() {
    if (this.status === 'running') throw new Error('Cannot download while running');

    this.status = 'downloading';
    const start = new Date(this.config.startDate);
    const end = new Date(this.config.endDate);
    const assets = this.config.assets;

    try {
      for (let i = 0; i < assets.length; i++) {
        const symbol = assets[i];
        this.downloadProgress = { current: i + 1, total: assets.length, symbol };

        let candles = readCache(symbol, start, end);
        if (!candles) {
          candles = await fetchAllKlines(symbol, start, end);
          writeCache(symbol, start, end, candles);
        }
        this.market.load(symbol, candles);
      }

      this.downloadProgress = null;
      this.status = 'ready';
      this.clock.reset();
      this.resetBots();

      for (const bot of this.bots) {
        bot.portfolio.snapshot(this.market, this.clock.current);
      }
    } catch (err) {
      this.status = 'idle';
      this.downloadProgress = null;
      throw err;
    }
  }

  getHistory() {
    if (!this.bots.length) return { labels: [], series: [] };

    const maxLen = Math.max(...this.bots.map((b) => b.portfolio.history.length));
    const labels = [];
    const series = this.bots.map((b) => ({
      id: b.portfolio.id,
      name: b.portfolio.name,
      data: [],
    }));

    for (let i = 0; i < maxLen; i++) {
      const point = this.bots[0].portfolio.history[i];
      if (point) labels.push(point.t);

      for (let j = 0; j < this.bots.length; j++) {
        const h = this.bots[j].portfolio.history[i];
        series[j].data.push(h ? h.balance : null);
      }
    }

    return { labels, series };
  }

  getState() {
    const atTime = this.clock.current;
    return {
      status: this.status,
      config: this.config,
      clock: this.clock.toJSON(),
      downloadProgress: this.downloadProgress,
      bots: this.bots.map((b) => b.portfolio.toJSON(this.market, atTime)),
      history: this.getHistory(),
      cachedDatasets: listCachedDatasets(),
      cacheStatus: getCacheStatus(
        this.config.assets,
        this.config.startDate,
        this.config.endDate,
      ),
    };
  }
}

module.exports = { Experiment };
