const COLORS = ['#3b6ef5', '#6ee7a0', '#f5c842', '#f87171', '#c084fc', '#38bdf8'];

let chart = null;
let availableAssets = [];
let availableStrategies = [];
let cachedDatasets = [];
let assetSearchQuery = '';
let eventSource = null;

const els = {
  statusBadge: document.getElementById('status-badge'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  acceleration: document.getElementById('acceleration'),
  accelerationMax: document.getElementById('accelerationMax'),
  assetSearch: document.getElementById('asset-search'),
  assetsList: document.getElementById('assets-list'),
  assetsCount: document.getElementById('assets-count'),
  datasetsList: document.getElementById('datasets-list'),
  cacheStatus: document.getElementById('cache-status'),
  strategiesList: document.getElementById('strategies-list'),
  downloadStatus: document.getElementById('download-status'),
  simClock: document.getElementById('sim-clock'),
  botsTable: document.querySelector('#bots-table tbody'),
  portfoliosList: document.getElementById('portfolios-list'),
  btnSave: document.getElementById('btn-save'),
  btnDownload: document.getElementById('btn-download'),
  btnStart: document.getElementById('btn-start'),
  btnPause: document.getElementById('btn-pause'),
  btnStop: document.getElementById('btn-stop'),
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatMoney(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatPct(n) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function getFilteredAssets() {
  const q = assetSearchQuery.trim().toUpperCase();
  if (!q) return availableAssets;
  return availableAssets.filter((a) => a.includes(q));
}

function renderAssets(selectedAssets = getSelectedAssets()) {
  const filtered = getFilteredAssets();
  els.assetsList.innerHTML = filtered.length
    ? filtered
        .map(
          (asset) => `
    <label>
      <input type="checkbox" name="asset" value="${asset}" ${selectedAssets.includes(asset) ? 'checked' : ''}>
      ${asset}
    </label>`,
        )
        .join('')
    : '<span class="datasets-empty">Sin resultados</span>';

  const selectedInFilter = filtered.filter((a) => selectedAssets.includes(a)).length;
  els.assetsCount.textContent = filtered.length === availableAssets.length
    ? `${availableAssets.length} activos disponibles · ${selectedAssets.length} seleccionados`
    : `${filtered.length} de ${availableAssets.length} · ${selectedInFilter} seleccionados en filtro`;
}

function renderDatasets(datasets) {
  cachedDatasets = datasets || [];
  if (!cachedDatasets.length) {
    els.datasetsList.innerHTML = '<p class="datasets-empty">No hay datos descargados aún</p>';
    return;
  }

  els.datasetsList.innerHTML = cachedDatasets
    .map(
      (ds, i) => `
    <div class="dataset-item" data-index="${i}">
      <div class="dataset-range">${ds.startDate} → ${ds.endDate}</div>
      <div class="dataset-assets">${ds.assets.join(', ')}</div>
    </div>`,
    )
    .join('');
}

function renderCacheStatus(cacheStatus) {
  if (!cacheStatus) {
    els.cacheStatus.textContent = '';
    return;
  }

  const { cached, missing, allCached } = cacheStatus;
  if (!cached.length && !missing.length) {
    els.cacheStatus.textContent = 'Seleccioná activos para ver el estado de caché';
    els.cacheStatus.className = 'hint';
    return;
  }

  if (allCached) {
    els.cacheStatus.textContent = `Config actual: todos los activos ya están descargados (${cached.join(', ')})`;
    els.cacheStatus.className = 'hint cache-ok';
  } else if (cached.length) {
    els.cacheStatus.textContent = `En caché: ${cached.join(', ')}. Faltan: ${missing.join(', ')}`;
    els.cacheStatus.className = 'hint cache-missing';
  } else {
    els.cacheStatus.textContent = `Faltan descargar: ${missing.join(', ')}`;
    els.cacheStatus.className = 'hint cache-missing';
  }
}

function applyDataset(dataset) {
  els.startDate.value = dataset.startDate;
  els.endDate.value = dataset.endDate;
  renderAssets(dataset.assets);
}

function renderStrategies() {
  els.strategiesList.innerHTML = availableStrategies
    .map(
      (s) => `
    <div class="strategy-item">
      <label>
        <input type="checkbox" name="strategy" value="${s.id}" data-default='${JSON.stringify(s.defaultParams)}'>
        ${s.name}
      </label>
      <input type="number" class="budget-input" data-strategy="${s.id}" value="10000" min="100" step="100" title="Budget total en USD para operar entre todos los activos">
    </div>`,
    )
    .join('');
}

function getSelectedAssets() {
  return [...document.querySelectorAll('input[name="asset"]:checked')].map((el) => el.value);
}

function getSelectedBots() {
  const bots = [];
  document.querySelectorAll('input[name="strategy"]:checked').forEach((el) => {
    const budget = document.querySelector(`.budget-input[data-strategy="${el.value}"]`);
    const defaultParams = JSON.parse(el.dataset.default || '{}');
    bots.push({
      strategyId: el.value,
      budget: parseFloat(budget?.value || 10000),
      params: defaultParams,
    });
  });
  return bots;
}

function getAccelerationFactor() {
  if (els.accelerationMax.checked) return 'max';
  return parseFloat(els.acceleration.value) || 1;
}

function setAccelerationUI(factor) {
  const isMax = factor === 'max';
  els.accelerationMax.checked = isMax;
  els.acceleration.disabled = isMax;
  if (!isMax) els.acceleration.value = factor;
}

function applyConfig(config) {
  els.startDate.value = config.startDate;
  els.endDate.value = config.endDate;
  setAccelerationUI(config.accelerationFactor);
  renderAssets(config.assets);

  document.querySelectorAll('input[name="strategy"]').forEach((el) => {
    const bot = config.bots.find((b) => b.strategyId === el.value);
    el.checked = !!bot;
    if (bot) {
      const budgetInput = document.querySelector(`.budget-input[data-strategy="${el.value}"]`);
      if (budgetInput) budgetInput.value = bot.budget;
    }
  });
}

function formatQty(n) {
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(8);
}

function renderPortfolio(bot) {
  const holdings = (bot.holdings || []).map(
    (h) => `
      <div class="holding-row">
        <span class="holding-symbol">${h.symbol}</span>
        <span class="holding-qty">${formatQty(h.qty)}</span>
        <span class="holding-price">@ ${formatMoney(h.price)}</span>
        <span class="holding-value">${formatMoney(h.value)}</span>
      </div>`,
  ).join('');

  const emptyHoldings = holdings || '<div class="holding-empty">Sin posiciones abiertas</div>';

  return `
    <div class="portfolio-card">
      <div class="portfolio-header">
        <h3>${bot.name}</h3>
        <span class="portfolio-balance">${formatMoney(bot.balance)}</span>
      </div>
      <div class="portfolio-body">
        <div class="holding-row holding-cash">
          <span class="holding-symbol">Efectivo (USD)</span>
          <span class="holding-value">${formatMoney(bot.cash)}</span>
        </div>
        ${emptyHoldings}
        <div class="portfolio-footer">
          <span>Invertido: ${formatMoney(bot.invested ?? 0)}</span>
          <span>Budget total: ${formatMoney(bot.initialBudget)}</span>
        </div>
      </div>
    </div>`;
}

function updateUI(state) {
  els.statusBadge.textContent = state.status;
  els.statusBadge.className = `badge ${state.status}`;

  els.simClock.textContent = state.clock?.current
    ? new Date(state.clock.current).toLocaleString()
    : '—';

  if (state.downloadProgress) {
    const { current, total, symbol } = state.downloadProgress;
    els.downloadStatus.textContent = `Descargando ${symbol} (${current}/${total})...`;
  } else {
    els.downloadStatus.textContent = '';
  }

  els.btnStart.disabled = !['ready', 'paused'].includes(state.status);
  els.btnPause.disabled = state.status !== 'running';
  els.btnStop.disabled = !['running', 'paused', 'finished'].includes(state.status);
  els.btnDownload.disabled = state.status === 'running' || state.status === 'downloading';

  renderDatasets(state.cachedDatasets);
  renderCacheStatus(state.cacheStatus);

  els.botsTable.innerHTML = (state.bots || [])
    .map(
      (bot) => `
    <tr>
      <td>${bot.name}</td>
      <td>${formatMoney(bot.initialBudget)}</td>
      <td>${formatMoney(bot.balance)}</td>
      <td class="${bot.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">
        ${formatMoney(bot.pnl)} (${formatPct(bot.pnlPct)})
      </td>
      <td class="${bot.winning ? 'status-win' : 'status-loss'}">
        ${bot.winning ? 'Ganando' : 'Perdiendo'}
      </td>
    </tr>`,
    )
    .join('');

  els.portfoliosList.innerHTML = (state.bots || []).length
    ? (state.bots || []).map(renderPortfolio).join('')
    : '<p class="hint">Sin bots configurados</p>';

  updateChart(state.history);
}

function updateChart(history) {
  if (!history?.series?.length) return;

  const labels = history.labels.map((t) => new Date(t).toLocaleString());
  const datasets = history.series.map((s, i) => ({
    label: s.name,
    data: s.data,
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: 'transparent',
    tension: 0.2,
    pointRadius: 0,
  }));

  if (!chart) {
    chart = new Chart(document.getElementById('balance-chart'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#9aa3b5' } },
        },
        scales: {
          x: {
            ticks: { color: '#9aa3b5', maxTicksLimit: 8 },
            grid: { color: '#2a2f3a' },
          },
          y: {
            ticks: { color: '#9aa3b5' },
            grid: { color: '#2a2f3a' },
          },
        },
      },
    });
  } else {
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update('none');
  }
}

function connectSSE() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/experiment/stream');
  eventSource.onmessage = (e) => {
    const event = JSON.parse(e.data);
    if (event.status || event.type === 'connected') {
      updateUI(event.type === 'connected' ? event : { ...event, ...event });
    }
    if (event.type === 'tick' || event.type === 'finished' || event.type === 'stopped') {
      updateUI({
        status: event.status ?? document.getElementById('status-badge').textContent,
        clock: event.clock,
        bots: event.bots,
        history: event.history,
        cachedDatasets: event.cachedDatasets ?? cachedDatasets,
        cacheStatus: event.cacheStatus,
      });
      if (event.status) {
        els.statusBadge.textContent = event.status;
        els.statusBadge.className = `badge ${event.status}`;
      }
    }
  };
}

async function init() {
  els.assetsList.innerHTML = '<span class="datasets-empty">Cargando activos desde Binance...</span>';

  const [assetsRes, strategiesRes, state] = await Promise.all([
    api('/api/assets'),
    api('/api/strategies'),
    api('/api/experiment'),
  ]);

  availableAssets = assetsRes.assets;
  availableStrategies = strategiesRes.strategies;

  renderAssets(state.config.assets);
  renderStrategies();
  applyConfig(state.config);
  updateUI(state);
  connectSSE();
}

els.assetSearch.addEventListener('input', (e) => {
  assetSearchQuery = e.target.value;
  renderAssets();
});

els.datasetsList.addEventListener('click', (e) => {
  const item = e.target.closest('.dataset-item');
  if (!item) return;
  const dataset = cachedDatasets[Number(item.dataset.index)];
  if (dataset) applyDataset(dataset);
});

els.btnSave.addEventListener('click', async () => {
  try {
    const state = await api('/api/experiment', {
      method: 'PUT',
      body: JSON.stringify({
        startDate: els.startDate.value,
        endDate: els.endDate.value,
        accelerationFactor: getAccelerationFactor(),
        assets: getSelectedAssets(),
        bots: getSelectedBots(),
      }),
    });
    updateUI(state);
  } catch (err) {
    alert(err.message);
  }
});

els.accelerationMax.addEventListener('change', () => {
  els.acceleration.disabled = els.accelerationMax.checked;
});

els.btnDownload.addEventListener('click', async () => {
  try {
    els.btnDownload.disabled = true;
    els.downloadStatus.textContent = 'Descargando...';
    const state = await api('/api/experiment', {
      method: 'PUT',
      body: JSON.stringify({
        startDate: els.startDate.value,
        endDate: els.endDate.value,
        accelerationFactor: getAccelerationFactor(),
        assets: getSelectedAssets(),
        bots: getSelectedBots(),
      }),
    });
    updateUI(state);
    const result = await api('/api/experiment/download', { method: 'POST' });
    updateUI(result);
  } catch (err) {
    alert(err.message);
  } finally {
    els.btnDownload.disabled = false;
  }
});

els.btnStart.addEventListener('click', async () => {
  try {
    const state = await api('/api/experiment/start', { method: 'POST' });
    updateUI(state);
  } catch (err) {
    alert(err.message);
  }
});

els.btnPause.addEventListener('click', async () => {
  try {
    const state = await api('/api/experiment/pause', { method: 'POST' });
    updateUI(state);
  } catch (err) {
    alert(err.message);
  }
});

els.btnStop.addEventListener('click', async () => {
  try {
    const state = await api('/api/experiment/stop', { method: 'POST' });
    updateUI(state);
  } catch (err) {
    alert(err.message);
  }
});

init().catch((err) => console.error(err));
