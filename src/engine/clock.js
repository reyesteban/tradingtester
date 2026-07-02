const { INTERVAL_MS } = require('../data/binance');

class Clock {
  constructor() {
    this.start = null;
    this.end = null;
    this.current = null;
  }

  configure(startDate, endDate) {
    this.start = new Date(startDate);
    this.end = new Date(endDate);
    this.current = new Date(this.start);
  }

  reset() {
    if (this.start) {
      this.current = new Date(this.start);
    }
  }

  tick() {
    if (!this.current || !this.end) return false;
    if (this.current.getTime() >= this.end.getTime()) return false;
    const next = this.current.getTime() + INTERVAL_MS;
    if (next > this.end.getTime()) return false;
    this.current = new Date(next);
    return true;
  }

  isFinished() {
    return this.current && this.end && this.current.getTime() >= this.end.getTime();
  }

  toJSON() {
    return {
      start: this.start?.toISOString() ?? null,
      end: this.end?.toISOString() ?? null,
      current: this.current?.toISOString() ?? null,
    };
  }
}

module.exports = Clock;
