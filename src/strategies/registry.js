const fs = require('fs');
const path = require('path');

const STRATEGIES_DIR = path.join(__dirname, '../../strategies');

function loadStrategies() {
  if (!fs.existsSync(STRATEGIES_DIR)) {
    fs.mkdirSync(STRATEGIES_DIR, { recursive: true });
    return [];
  }

  const files = fs
    .readdirSync(STRATEGIES_DIR)
    .filter((f) => f.endsWith('.js'));

  const strategies = [];
  const seen = new Set();

  for (const file of files) {
    const fullPath = path.join(STRATEGIES_DIR, file);
    const strategy = require(fullPath);

    if (!strategy.id || !strategy.name || typeof strategy.onTick !== 'function') {
      console.warn(`Skipping invalid strategy file: ${file}`);
      continue;
    }
    if (seen.has(strategy.id)) {
      console.warn(`Duplicate strategy id "${strategy.id}" in ${file}, skipping`);
      continue;
    }
    seen.add(strategy.id);
    strategies.push(strategy);
  }

  return strategies.sort((a, b) => a.name.localeCompare(b.name));
}

function getStrategy(id) {
  return loadStrategies().find((s) => s.id === id) ?? null;
}

function listStrategies() {
  return loadStrategies().map((s) => ({
    id: s.id,
    name: s.name,
    defaultParams: s.defaultParams ?? {},
  }));
}

module.exports = { loadStrategies, getStrategy, listStrategies, STRATEGIES_DIR };
