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
    { strategyId: 'buy-and-hold', budget: 10000, symbols: ['BTCUSDT'] },
    { strategyId: 'sma-crossover', budget: 10000, symbols: ['BTCUSDT'], params: { short: 10, long: 30 } },
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
    this._listeners = new Set();
    this._initClock();
    this.resetBots();
  }

  onEvent(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _emit(event) {
    for (const listener of this._listeners) {
      listener(event);
    }
  }

  _setDownloadProgress(progress) {
    this.downloadProgress = progress;
    this._emit({ type: 'download-progress', ...this.getState() });
  }

  _initClock() {
    const start = new Date(this.config.startDate);
    const end = new Date(this.config.endDate);
    this.clock.configure(start, end);
  }

  _applyLoadedDataBounds() {
    const bounds = this.market.getDataBounds();
    if (!bounds) throw new Error('No downloaded data available for the selected assets');

    this.clock.configure(bounds.start, bounds.end);
    this.config.startDate = bounds.start.toISOString().slice(0, 10);
    this.config.endDate = bounds.end.toISOString().slice(0, 10);
  }

  ensureClockWithinData() {
    const bounds = this.market.getDataBounds();
    if (!bounds) return false;

    this.clock.configure(bounds.start, bounds.end);
    this.config.startDate = bounds.start.toISOString().slice(0, 10);
    this.config.endDate = bounds.end.toISOString().slice(0, 10);

    if (this.clock.current.getTime() < bounds.start.getTime()) {
      this.clock.reset();
    }
    if (this.clock.current.getTime() > bounds.end.getTime()) {
      this.clock.current = new Date(bounds.end);
    }
    return true;
  }

  _clearMarketIfScopeChanged(body, prevConfig) {
    const datesChanged =
      (body.startDate !== undefined && body.startDate !== prevConfig.startDate)
      || (body.endDate !== undefined && body.endDate !== prevConfig.endDate);
    const assetsChanged =
      body.assets !== undefined
      && JSON.stringify([...body.assets].sort()) !== JSON.stringify([...prevConfig.assets].sort());
    if (datesChanged || assetsChanged) {
      this.market.clear();
    }
    return datesChanged || assetsChanged;
  }

  configure(body) {
    if (this.status === 'running' || this.status === 'downloading') {
      throw new Error('Cannot configure while running or downloading');
    }

    const prevConfig = { ...this.config };

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

    this._validateBots(this.config.bots, this.config.assets);

    const scopeChanged = this._clearMarketIfScopeChanged(body, prevConfig);

    if (this.market.getSymbols().length) {
      this.ensureClockWithinData();
      this.status = 'ready';
    } else {
      this.clock.configure(start, end);
      this.status = 'idle';
    }
    this.resetBots();
  }

  _resolveSymbols(strategy, botConfig) {
    const fromConfig = botConfig.symbols
      ?? botConfig.params?.symbols
      ?? (botConfig.params?.symbol ? [botConfig.params.symbol] : null);

    const defaults = strategy.defaultParams?.symbols
      ?? (strategy.defaultParams?.symbol ? [strategy.defaultParams.symbol] : []);

    return fromConfig?.length ? fromConfig : defaults;
  }

  _validateBots(bots, experimentAssets) {
    if (!bots.length) {
      throw new Error('Seleccioná al menos una estrategia');
    }

    const assetSet = new Set(experimentAssets);

    for (const botConfig of bots) {
      const strategy = getStrategy(botConfig.strategyId);
      if (!strategy) throw new Error(`Unknown strategy: ${botConfig.strategyId}`);

      const symbols = this._resolveSymbols(strategy, botConfig);
      const assetsMode = strategy.assetsMode ?? 'single';

      if (!symbols.length) {
        throw new Error(`Strategy "${strategy.name}" requires at least one asset`);
      }
      if (assetsMode === 'single' && symbols.length > 1) {
        throw new Error(`Strategy "${strategy.name}" only supports one asset`);
      }

      for (const symbol of symbols) {
        if (!assetSet.has(symbol)) {
          throw new Error(`Asset ${symbol} is not included in experiment assets`);
        }
      }
    }
  }

  _buildBotParams(strategy, botConfig) {
    const symbols = this._resolveSymbols(strategy, botConfig);
    return {
      ...strategy.defaultParams,
      ...botConfig.params,
      symbols,
      symbol: symbols[0],
    };
  }

  resetBots() {
    this.bots = this.config.bots.map((botConfig, i) => {
      const strategy = getStrategy(botConfig.strategyId);
      if (!strategy) throw new Error(`Unknown strategy: ${botConfig.strategyId}`);

      const symbols = this._resolveSymbols(strategy, botConfig);
      const params = this._buildBotParams(strategy, botConfig);
      const name = symbols.length
        ? `${strategy.name} (${symbols.join(', ')})`
        : strategy.name;
      const portfolio = new Portfolio(
        `bot-${i}`,
        name,
        botConfig.budget ?? 10000,
      );

      return { strategy, params, portfolio, symbols };
    });
  }

  getActiveDataset() {
    const datasets = listCachedDatasets();
    const { startDate, endDate, assets } = this.config;
    return datasets.find(
      (d) =>
        d.startDate === startDate
        && d.endDate === endDate
        && d.assets.length === assets.length
        && d.assets.every((a) => assets.includes(a)),
    ) ?? null;
  }

  async useDataset(startDate, endDate) {
    if (this.status === 'running') throw new Error('Cannot load dataset while running');
    if (this.status === 'downloading') throw new Error('Cannot load dataset while downloading');

    const dataset = listCachedDatasets().find(
      (d) => d.startDate === startDate && d.endDate === endDate,
    );
    if (!dataset) throw new Error('Dataset not found');

    this.config.startDate = startDate;
    this.config.endDate = endDate;
    this.config.assets = [...dataset.assets];
    this._validateBots(this.config.bots, this.config.assets);

    const start = new Date(startDate);
    const end = new Date(endDate);

    for (const symbol of dataset.assets) {
      const candles = readCache(symbol, start, end);
      if (!candles) throw new Error(`Cached data missing for ${symbol}`);
      this.market.load(symbol, candles);
    }

    this._applyLoadedDataBounds();
    this.downloadProgress = null;
    this.status = 'ready';
    this.clock.reset();
    this.resetBots();

    for (const bot of this.bots) {
      bot.portfolio.snapshot(this.market, this.clock.current, bot.symbols);
    }

    this._emit({ type: 'dataset-loaded', ...this.getState() });
  }

  async download() {
    if (this.status === 'running') throw new Error('Cannot download while running');
    if (this.status === 'downloading') throw new Error('Download already in progress');

    this.status = 'downloading';
    const start = new Date(this.config.startDate);
    const end = new Date(this.config.endDate);
    const assets = this.config.assets;

    if (!assets.length) throw new Error('No assets selected');

    try {
      for (let i = 0; i < assets.length; i++) {
        const symbol = assets[i];

        this._setDownloadProgress({
          current: i,
          total: assets.length,
          symbol,
          phase: 'checking',
        });

        let candles = readCache(symbol, start, end);
        const fromCache = !!candles;
        if (!candles) {
          this._setDownloadProgress({
            current: i,
            total: assets.length,
            symbol,
            phase: 'downloading',
          });
          candles = await fetchAllKlines(symbol, start, end);
          writeCache(symbol, start, end, candles);
        }

        this.market.load(symbol, candles);

        this._setDownloadProgress({
          current: i + 1,
          total: assets.length,
          symbol,
          phase: fromCache ? 'cached' : 'done',
        });
      }

      this._applyLoadedDataBounds();
      this.downloadProgress = null;
      this.status = 'ready';
      this.clock.reset();
      this.resetBots();

      for (const bot of this.bots) {
        bot.portfolio.snapshot(this.market, this.clock.current, bot.symbols);
      }

      this._emit({ type: 'download-complete', ...this.getState() });
    } catch (err) {
      this.status = 'idle';
      this.downloadProgress = null;
      this._emit({ type: 'download-error', error: err.message, ...this.getState() });
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
    const dataBounds = this.market.getDataBounds();
    return {
      status: this.status,
      config: this.config,
      clock: this.clock.toJSON(),
      dataBounds: dataBounds
        ? { start: dataBounds.start.toISOString(), end: dataBounds.end.toISOString() }
        : null,
      downloadProgress: this.downloadProgress,
      bots: this.bots.map((b) => b.portfolio.toJSON(this.market, atTime)),
      history: this.getHistory(),
      cachedDatasets: listCachedDatasets(),
      activeDataset: ['ready', 'paused', 'running', 'finished'].includes(this.status)
        ? this.getActiveDataset()
        : null,
      cacheStatus: getCacheStatus(
        this.config.assets,
        this.config.startDate,
        this.config.endDate,
      ),
    };
  }
}

module.exports = { Experiment };
