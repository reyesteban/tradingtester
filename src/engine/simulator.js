const { INTERVAL_MS } = require('../data/binance');

class Simulator {
  constructor(experiment) {
    this.experiment = experiment;
    this.timer = null;
    this.paused = false;
    this.listeners = new Set();
  }

  onTick(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  _isMaxSpeed() {
    return this.experiment.config.accelerationFactor === 'max';
  }

  _tickDelay() {
    const factor = this.experiment.config.accelerationFactor || 1;
    return Math.max(0, 1000 / factor);
  }

  _stepOnce() {
    const { clock, market, bots } = this.experiment;

    for (const bot of bots) {
      try {
        const orders = bot.strategy.onTick({
          clock,
          portfolio: bot.portfolio,
          market,
          params: bot.params,
        });
        bot.portfolio.execute(orders, market, clock.current);
      } catch (err) {
        console.error(`Strategy error [${bot.portfolio.name}]:`, err.message);
      }
      bot.portfolio.snapshot(market, clock.current);
    }

    if (!clock.tick()) {
      this.paused = false;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.experiment.status = 'finished';
      this._emit({ type: 'finished', ...this.experiment.getState() });
      return true;
    }

    return false;
  }

  _emitTick() {
    const { clock, market, bots } = this.experiment;
    this._emit({
      type: 'tick',
      clock: clock.toJSON(),
      bots: bots.map((b) => b.portfolio.toJSON(market, clock.current)),
      history: this.experiment.getHistory(),
    });
  }

  _runTick() {
    const batchSize = this._isMaxSpeed() ? 500 : 1;

    for (let i = 0; i < batchSize; i++) {
      if (this.paused || this.experiment.status !== 'running') return;
      if (this._stepOnce()) return;
    }

    this._emitTick();

    if (!this.paused && this.experiment.status === 'running') {
      if (this._isMaxSpeed()) {
        setImmediate(() => this._runTick());
      } else {
        this.timer = setTimeout(() => this._runTick(), this._tickDelay());
      }
    }
  }

  start() {
    if (this.experiment.status !== 'ready' && this.experiment.status !== 'paused') {
      throw new Error(`Cannot start from status: ${this.experiment.status}`);
    }
    this.paused = false;
    this.experiment.status = 'running';
    this._runTick();
  }

  pause() {
    if (this.experiment.status !== 'running') return;
    this.paused = true;
    this.experiment.status = 'paused';
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  stop() {
    this.paused = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.experiment.status === 'running' || this.experiment.status === 'paused') {
      this.experiment.status = 'ready';
    }
    this.experiment.clock.reset();
    this.experiment.resetBots();
    this._emit({ type: 'stopped', ...this.experiment.getState() });
  }

  reset() {
    this.stop();
    this.experiment.status = 'ready';
  }
}

module.exports = Simulator;
