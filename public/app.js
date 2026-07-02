const COLORS = ['#3b6ef5', '#6ee7a0', '#f5c842', '#f87171', '#c084fc', '#38bdf8'];

function parseDateValue(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) {
      return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateDMY(value) {
  const d = parseDateValue(value);
  if (!d) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTimeDMY(value) {
  const d = parseDateValue(value);
  if (!d) return '—';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${formatDateDMY(d)} ${hours}:${minutes}`;
}

function displayDateToIso(display) {
  const m = String(display).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getConfigDatesFromForm() {
  const startDate = displayDateToIso(els.startDate.value) ?? els.startDate.value;
  const endDate = displayDateToIso(els.endDate.value) ?? els.endDate.value;
  return { startDate, endDate };
}

function setConfigDatesInForm(startDate, endDate) {
  els.startDate.value = formatDateDMY(startDate);
  els.endDate.value = formatDateDMY(endDate);
}

let chart = null;
let modalCharts = [];
let modalTimeIso = [];
let modalZoomRange = null;
let modalZoomRangeBeforeHover = null;
let modalShowHolds = false;
let modalStructureReady = false;
let availableAssets = [];
let availableStrategies = [];
let cachedDatasets = [];
let assetSearchQuery = '';
let selectedExperimentAssets = [];
let selectedDatasetKey = null;
let activeDataset = null;
let currentBots = [];
let eventSource = null;

const els = {
  statusBadge: document.getElementById('status-badge'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  acceleration: document.getElementById('acceleration'),
  accelerationMax: document.getElementById('accelerationMax'),
  assetSearch: document.getElementById('asset-search'),
  assetsList: document.getElementById('assets-list'),
  selectedAssetsList: document.getElementById('selected-assets-list'),
  assetsCount: document.getElementById('assets-count'),
  datasetsList: document.getElementById('datasets-list'),
  cacheStatus: document.getElementById('cache-status'),
  downloadProgressWrap: document.getElementById('download-progress-wrap'),
  downloadProgressBar: document.getElementById('download-progress-bar'),
  downloadStatus: document.getElementById('download-status'),
  strategiesList: document.getElementById('strategies-list'),
  simClock: document.getElementById('sim-clock'),
  botsTable: document.querySelector('#bots-table tbody'),
  botModal: document.getElementById('bot-modal'),
  modalBotName: document.getElementById('modal-bot-name'),
  modalBotBody: document.getElementById('modal-bot-body'),
  modalClose: document.getElementById('modal-close'),
  btnSave: document.getElementById('btn-save'),
  btnDownload: document.getElementById('btn-download'),
  btnStart: document.getElementById('btn-start'),
  btnPause: document.getElementById('btn-pause'),
  btnStop: document.getElementById('btn-stop'),
  configPanel: document.getElementById('config-panel'),
  configLockable: document.getElementById('config-lockable'),
  btnTutorial: document.getElementById('btn-tutorial'),
  tutorialPanel: document.getElementById('tutorial-panel'),
  tutorialClose: document.getElementById('tutorial-close'),
  tutorialTitle: document.getElementById('tutorial-title'),
  tutorialBody: document.getElementById('tutorial-body'),
  tutorialProgress: document.getElementById('tutorial-progress'),
  tutorialPrev: document.getElementById('tutorial-prev'),
  tutorialNext: document.getElementById('tutorial-next'),
  tutorialDismiss: document.getElementById('tutorial-dismiss'),
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

function getSelectedAssets() {
  return [...selectedExperimentAssets];
}

function setSelectedAssets(assets) {
  selectedExperimentAssets = [...new Set(assets)];
  renderSelectedAssets();
  renderAssetSearch();
}

function addAsset(asset) {
  if (!asset || selectedExperimentAssets.includes(asset)) return;
  selectedExperimentAssets.push(asset);
  selectedExperimentAssets.sort();
  renderSelectedAssets();
  renderAssetSearch();
  renderStrategiesFromForm();
}

function removeAsset(asset) {
  selectedExperimentAssets = selectedExperimentAssets.filter((a) => a !== asset);
  renderSelectedAssets();
  renderAssetSearch();
  renderStrategiesFromForm();
}

function renderSelectedAssets() {
  els.selectedAssetsList.innerHTML = selectedExperimentAssets.length
    ? selectedExperimentAssets
        .map(
          (asset) => `
      <span class="asset-chip">
        ${asset}
        <button type="button" class="asset-chip-remove" data-asset="${asset}" title="Quitar">×</button>
      </span>`,
        )
        .join('')
    : '<span class="datasets-empty">Ningún activo seleccionado</span>';
}

function renderAssetSearch() {
  const q = assetSearchQuery.trim().toUpperCase();

  if (!q) {
    els.assetsList.innerHTML = '<span class="datasets-empty">Escribí para buscar activos</span>';
    els.assetsCount.textContent = `${selectedExperimentAssets.length} seleccionados · ${availableAssets.length} disponibles`;
    return;
  }

  const filtered = availableAssets
    .filter((a) => a.includes(q) && !selectedExperimentAssets.includes(a))
    .slice(0, 50);

  els.assetsList.innerHTML = filtered.length
    ? filtered
        .map(
          (asset) => `
      <button type="button" class="asset-add-btn" data-asset="${asset}">+ ${asset}</button>`,
        )
        .join('')
    : '<span class="datasets-empty">Sin resultados o ya agregados</span>';

  const totalMatches = availableAssets.filter((a) => a.includes(q)).length;
  els.assetsCount.textContent = totalMatches > 50
    ? `${filtered.length} de ${totalMatches} coincidencias (mostrando 50)`
  : `${filtered.length} coincidencia${filtered.length === 1 ? '' : 's'}`;
}

function renderAssets(assets) {
  if (assets) setSelectedAssets(assets);
  else {
    renderSelectedAssets();
    renderAssetSearch();
  }
}

function datasetKey(ds) {
  return `${ds.startDate}_${ds.endDate}`;
}

function getSelectedDataset() {
  if (!selectedDatasetKey) return null;
  return cachedDatasets.find((d) => datasetKey(d) === selectedDatasetKey) ?? null;
}

function renderDatasets(datasets, active = null) {
  if (active !== undefined) activeDataset = active;
  cachedDatasets = datasets || [];

  if (!cachedDatasets.length) {
    els.datasetsList.innerHTML = '<p class="datasets-empty">No hay datos descargados aún</p>';
    selectedDatasetKey = null;
    return;
  }

  if (selectedDatasetKey && !cachedDatasets.some((d) => datasetKey(d) === selectedDatasetKey)) {
    selectedDatasetKey = null;
  }

  els.datasetsList.innerHTML = cachedDatasets
    .map((ds, i) => {
      const key = datasetKey(ds);
      const isSelected = key === selectedDatasetKey;
      const isActive = activeDataset
        && activeDataset.startDate === ds.startDate
        && activeDataset.endDate === ds.endDate;
      return `
    <div class="dataset-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}" data-index="${i}">
      <div class="dataset-main">
        <div class="dataset-range">
          ${isActive ? '<span class="dataset-badge">En uso</span>' : ''}
          ${formatDateDMY(ds.startDate)} → ${formatDateDMY(ds.endDate)}
        </div>
        <div class="dataset-assets">${ds.assets.join(', ')}</div>
      </div>
      <button type="button" class="dataset-delete" data-index="${i}" title="Eliminar datos">×</button>
    </div>`;
    })
    .join('');
}

function previewDataset(dataset) {
  setConfigDatesInForm(dataset.startDate, dataset.endDate);
  setSelectedAssets(dataset.assets);
  renderStrategies(getBotsFromForm());
}

function renderCacheStatus(cacheStatus, dataBounds = null) {
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
    els.cacheStatus.textContent = dataBounds
      ? `Datos cargados: ${formatDateTimeDMY(dataBounds.start)} → ${formatDateTimeDMY(dataBounds.end)}`
      : `Config actual: todos los activos ya están descargados (${cached.join(', ')})`;
    els.cacheStatus.className = 'hint cache-ok';
  } else if (cached.length) {
    els.cacheStatus.textContent = `En caché: ${cached.join(', ')}. Faltan: ${missing.join(', ')}`;
    els.cacheStatus.className = 'hint cache-missing';
  } else {
    els.cacheStatus.textContent = `Faltan descargar: ${missing.join(', ')}`;
    els.cacheStatus.className = 'hint cache-missing';
  }
}

async function useSelectedDataset(dataset) {
  const target = dataset || getSelectedDataset();
  if (!target) return;

  selectedDatasetKey = datasetKey(target);
  previewDataset(target);

  try {
    const bots = requireSelectedBots();
    await api('/api/experiment', {
      method: 'PUT',
      body: JSON.stringify({
        startDate: target.startDate,
        endDate: target.endDate,
        accelerationFactor: getAccelerationFactor(),
        assets: target.assets,
        bots,
      }),
    });

    const state = await api('/api/experiment/use-dataset', {
      method: 'POST',
      body: JSON.stringify({ startDate: target.startDate, endDate: target.endDate }),
    });
    updateUI(state);
  } catch (err) {
    alert(err.message);
    renderDatasets(cachedDatasets, activeDataset);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderStrategies(configBots = []) {
  const experimentAssets = getSelectedAssets();

  els.strategiesList.innerHTML = availableStrategies
    .map((s) => {
      const bot = configBots.find((b) => b.strategyId === s.id);
      const isChecked = !!bot;
      const assetsMode = s.assetsMode || 'single';
      const selectedSymbols = bot?.symbols
        ?? bot?.params?.symbols
        ?? (bot?.params?.symbol ? [bot.params.symbol] : []);

      let assetsUI = '';
      if (!experimentAssets.length) {
        assetsUI = '<span class="hint">Seleccioná activos del experimento primero</span>';
      } else if (assetsMode === 'single') {
        const selected = selectedSymbols[0] || experimentAssets[0];
        assetsUI = `
          <select class="strategy-symbol-select" data-strategy="${s.id}" ${!isChecked ? 'disabled' : ''}>
            ${experimentAssets
              .map(
                (asset) => `
              <option value="${asset}" ${asset === selected ? 'selected' : ''}>${asset}</option>`,
              )
              .join('')}
          </select>`;
      } else {
        const defaults = selectedSymbols.length
          ? selectedSymbols
          : experimentAssets.slice(0, 1);
        assetsUI = `
          <div class="strategy-symbols-multi">
            ${experimentAssets
              .map(
                (asset) => `
              <label>
                <input type="checkbox" class="strategy-symbol-check" data-strategy="${s.id}" value="${asset}"
                  ${defaults.includes(asset) ? 'checked' : ''} ${!isChecked ? 'disabled' : ''}>
                ${asset}
              </label>`,
              )
              .join('')}
          </div>`;
      }

      return `
    <div class="strategy-item" data-strategy-id="${s.id}">
      <div class="strategy-item-header">
        <label class="strategy-name-label">
          <input type="checkbox" name="strategy" value="${s.id}" ${isChecked ? 'checked' : ''}>
          <span>${s.name}</span>
        </label>
        <div class="strategy-header-actions">
          ${s.description ? `<button type="button" class="strategy-info-btn" data-strategy="${s.id}" aria-label="Ver descripción de ${s.name}">i</button>` : ''}
          <input type="number" class="budget-input" data-strategy="${s.id}" value="${bot?.budget ?? 10000}" min="100" step="100" title="Budget total en USD para operar entre todos los activos">
        </div>
      </div>
      ${s.description ? `<div class="strategy-description hidden" data-strategy-desc="${s.id}">${escapeHtml(s.description)}</div>` : ''}
      <div class="strategy-assets ${isChecked ? '' : 'hidden'}" data-assets-mode="${assetsMode}">
        <span class="strategy-assets-label">${assetsMode === 'single' ? 'Activo' : 'Activos'}</span>
        ${assetsUI}
      </div>
    </div>`;
    })
    .join('');
}

function getStrategySymbols(strategyId, assetsMode) {
  if (assetsMode === 'single') {
    const select = document.querySelector(`.strategy-symbol-select[data-strategy="${strategyId}"]`);
    return select?.value ? [select.value] : [];
  }
  return [
    ...document.querySelectorAll(`.strategy-symbol-check[data-strategy="${strategyId}"]:checked`),
  ].map((el) => el.value);
}

function getBotsFromForm() {
  const bots = [];
  document.querySelectorAll('input[name="strategy"]:checked').forEach((el) => {
    const strategyId = el.value;
    const strategy = availableStrategies.find((s) => s.id === strategyId);
    const budget = document.querySelector(`.budget-input[data-strategy="${strategyId}"]`);
    bots.push({
      strategyId,
      budget: parseFloat(budget?.value || 10000),
      symbols: getStrategySymbols(strategyId, strategy?.assetsMode || 'single'),
    });
  });
  return bots;
}

function toggleStrategyAssets(strategyId, enabled) {
  const item = document.querySelector(`.strategy-item[data-strategy-id="${strategyId}"]`);
  if (!item) return;
  const panel = item.querySelector('.strategy-assets');
  panel?.classList.toggle('hidden', !enabled);
  item.querySelectorAll('.strategy-symbol-select, .strategy-symbol-check').forEach((el) => {
    el.disabled = !enabled;
  });
}

function renderStrategiesFromForm() {
  renderStrategies(getBotsFromForm());
}

function getSelectedBots() {
  return getBotsFromForm();
}

function requireSelectedBots() {
  const bots = getSelectedBots();
  if (!bots.length) {
    throw new Error('Seleccioná al menos una estrategia');
  }
  return bots;
}

async function persistExperimentConfig() {
  const bots = requireSelectedBots();
  const { startDate, endDate } = getConfigDatesFromForm();
  return api('/api/experiment', {
    method: 'PUT',
    body: JSON.stringify({
      startDate,
      endDate,
      accelerationFactor: getAccelerationFactor(),
      assets: getSelectedAssets(),
      bots,
    }),
  });
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
  setConfigDatesInForm(config.startDate, config.endDate);
  setAccelerationUI(config.accelerationFactor);
  renderAssets(config.assets);
  renderStrategies(config.bots);
}

function formatQty(n) {
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(8);
}

function formatDecisionTime(iso) {
  return formatDateTimeDMY(iso);
}

function formatDecisionRow(d) {
  const timeAttr = `data-t="${d.t}"`;

  if (d.action === 'hold') {
    return `<div class="decision-row decision-hold" ${timeAttr}>
      <span class="decision-time">${formatDecisionTime(d.t)}</span>
      <span class="decision-action">Mantener</span>
    </div>`;
  }

  const actionLabel = d.action === 'buy' ? 'Comprar' : 'Vender';
  const actionClass = d.action === 'buy' ? 'decision-buy' : 'decision-sell';
  return `<div class="decision-row ${actionClass}" ${timeAttr}>
    <span class="decision-time">${formatDecisionTime(d.t)}</span>
    <span class="decision-action">${actionLabel} ${d.symbol}</span>
    <span class="decision-detail">${formatQty(d.qty)} @ ${formatMoney(d.price)}</span>
  </div>`;
}

function ensureModalStructure() {
  if (modalStructureReady) return;

  els.modalBotBody.innerHTML = `
    <div id="modal-summary" class="modal-summary"></div>
    <div class="modal-main-grid">
      <div class="modal-charts-panel">
        <h4 class="modal-section-title">Evolución</h4>
        <div class="modal-charts-toolbar">
          <button type="button" id="modal-chart-reset-zoom" class="btn-chart-zoom">Restablecer zoom</button>
          <span class="modal-chart-zoom-hint">Rueda: zoom · Arrastrar: seleccionar rango · Shift+arrastrar: pan</span>
        </div>
        <div id="modal-charts-stack" class="modal-charts-stack">
          <div class="modal-chart-block">
            <span class="modal-chart-label">Balance</span>
            <div class="modal-chart-container modal-chart-container--balance">
              <canvas id="modal-balance-chart"></canvas>
            </div>
          </div>
          <div id="modal-price-charts" class="modal-price-charts"></div>
          <p id="modal-chart-empty" class="modal-empty hidden">Sin datos aún. Iniciá la simulación.</p>
        </div>
      </div>
      <aside class="modal-decisions-panel">
        <div class="modal-decisions-header">
          <h4 class="modal-section-title">Decisiones</h4>
          <label class="modal-holds-toggle">
            <input type="checkbox" id="modal-show-holds">
            Holds
          </label>
        </div>
        <p id="modal-decisions-meta" class="hint modal-decisions-meta"></p>
        <div id="modal-decisions-list" class="modal-decisions-list"></div>
      </aside>
    </div>
    <h4 class="modal-section-title">Cartera</h4>
    <div id="modal-portfolio" class="modal-portfolio"></div>
  `;

  document.getElementById('modal-show-holds').addEventListener('change', (e) => {
    modalShowHolds = e.target.checked;
    const openId = els.botModal.dataset.openBotId;
    const bot = currentBots.find((b) => b.id === openId);
    if (bot) renderModalDecisions(bot);
  });

  document.getElementById('modal-chart-reset-zoom').addEventListener('click', () => {
    modalZoomRange = null;
    modalZoomRangeBeforeHover = null;
    resetModalChartZoom();
  });

  document.getElementById('modal-decisions-list').addEventListener('mouseover', (e) => {
    const row = e.target.closest('.decision-row[data-t]');
    if (!row) return;
    const listEl = document.getElementById('modal-decisions-list');
    if (!listEl.dataset.hovering) {
      saveZoomBeforeHover();
      listEl.dataset.hovering = '1';
    }
    highlightModalCharts(row.dataset.t);
  });

  document.getElementById('modal-decisions-list').addEventListener('mouseleave', () => {
    const listEl = document.getElementById('modal-decisions-list');
    delete listEl.dataset.hovering;
    clearModalChartHighlight();
  });

  modalStructureReady = true;
}

function renderModalSummary(bot) {
  const el = document.getElementById('modal-summary');
  if (!el) return;
  el.innerHTML = `
    <div class="modal-stat">
      <span class="modal-stat-label">Balance</span>
      <span class="modal-stat-value">${formatMoney(bot.balance)}</span>
    </div>
    <div class="modal-stat">
      <span class="modal-stat-label">P&amp;L</span>
      <span class="modal-stat-value ${bot.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">
        ${formatMoney(bot.pnl)} (${formatPct(bot.pnlPct)})
      </span>
    </div>
    <div class="modal-stat">
      <span class="modal-stat-label">Estado</span>
      <span class="modal-stat-value ${bot.winning ? 'status-win' : 'status-loss'}">
        ${bot.winning ? 'Ganando' : 'Perdiendo'}
      </span>
    </div>`;
}

function renderModalPortfolio(bot) {
  const el = document.getElementById('modal-portfolio');
  if (!el) return;

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

  el.innerHTML = `
    <div class="holding-row holding-cash">
      <span class="holding-symbol">Efectivo (USD)</span>
      <span class="holding-value">${formatMoney(bot.cash)}</span>
    </div>
    ${emptyHoldings}
    <div class="portfolio-footer">
      <span>Invertido: ${formatMoney(bot.invested ?? 0)}</span>
      <span>Budget total: ${formatMoney(bot.initialBudget)}</span>
    </div>`;
}

function getActiveModalZoomRange() {
  if (modalZoomRange) return { ...modalZoomRange };
  const chart = modalCharts[0];
  if (!chart?.scales?.x) return null;
  const { min, max } = chart.scales.x;
  if (min == null || max == null) return null;
  return { min, max };
}

function isModalZoomed() {
  const range = getActiveModalZoomRange();
  if (!range || modalTimeIso.length < 2) return false;
  return range.max - range.min < modalTimeIso.length - 1 - 0.01;
}

function centerModalChartsOnIndex(idx) {
  const range = getActiveModalZoomRange();
  const dataMax = modalTimeIso.length - 1;
  if (!range || dataMax < 0 || idx < 0) return;

  const span = range.max - range.min;
  if (span >= dataMax - 0.01) return;

  let newMin = idx - span / 2;
  let newMax = idx + span / 2;

  if (newMin < 0) {
    newMin = 0;
    newMax = span;
  }
  if (newMax > dataMax) {
    newMax = dataMax;
    newMin = Math.max(0, dataMax - span);
  }

  modalZoomRange = { min: newMin, max: newMax };
  setModalChartHighlightIndex(idx);
}

function setModalChartHighlightIndex(idx) {
  modalCharts.forEach((chart) => {
    const ds = chart.data.datasets[0];
    ds.pointRadius = ds.data.map((_, i) => (i === idx ? 5 : 0));
    if (modalZoomRange) {
      chart.options.scales.x.min = modalZoomRange.min;
      chart.options.scales.x.max = modalZoomRange.max;
    }
    chart.update('none');
  });
}

function saveZoomBeforeHover() {
  if (isModalZoomed()) {
    modalZoomRangeBeforeHover = getActiveModalZoomRange();
  }
}

function restoreZoomAfterHover() {
  if (!modalZoomRangeBeforeHover) return;
  modalZoomRange = { ...modalZoomRangeBeforeHover };
  modalZoomRangeBeforeHover = null;
  applyModalZoomRange();
}

function captureModalZoomRange() {
  const chart = modalCharts[0];
  if (!chart?.scales?.x) return;
  const { min, max } = chart.scales.x;
  if (min != null && max != null) {
    modalZoomRange = { min, max };
  }
}

function syncModalChartZoom(sourceChart) {
  if (!sourceChart?.scales?.x) return;
  const { min, max } = sourceChart.scales.x;
  modalZoomRange = { min, max };
  modalCharts.forEach((chart) => {
    if (chart === sourceChart) return;
    chart.options.scales.x.min = min;
    chart.options.scales.x.max = max;
    chart.update('none');
  });
}

function applyModalZoomRange() {
  if (!modalZoomRange) return;
  modalCharts.forEach((chart) => {
    chart.options.scales.x.min = modalZoomRange.min;
    chart.options.scales.x.max = modalZoomRange.max;
    chart.update('none');
  });
}

function resetModalChartZoom() {
  modalCharts.forEach((chart) => {
    if (typeof chart.resetZoom === 'function') {
      chart.resetZoom();
    } else {
      chart.options.scales.x.min = undefined;
      chart.options.scales.x.max = undefined;
      chart.update('none');
    }
  });
}

function destroyModalCharts() {
  captureModalZoomRange();
  modalCharts.forEach((c) => c.destroy());
  modalCharts = [];
  modalTimeIso = [];
  const priceContainer = document.getElementById('modal-price-charts');
  if (priceContainer) priceContainer.innerHTML = '';
}

function alignSeriesToTimeline(timeline, series) {
  const byTime = new Map((series || []).map((p) => [p.t, p.price]));
  return timeline.map((t) => (byTime.has(t) ? byTime.get(t) : null));
}

function modalChartBaseOptions(showXAxis, yTickCallback) {
  const zoomCallbacks = {
    onZoomComplete: ({ chart }) => syncModalChartZoom(chart),
    onPanComplete: ({ chart }) => syncModalChartZoom(chart),
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
          modifierKey: 'shift',
          ...zoomCallbacks,
        },
        zoom: {
          wheel: { enabled: true, speed: 0.08 },
          pinch: { enabled: true },
          drag: {
            enabled: true,
            backgroundColor: 'rgba(59, 110, 245, 0.12)',
            borderColor: 'rgba(59, 110, 245, 0.55)',
            borderWidth: 1,
          },
          mode: 'x',
          ...zoomCallbacks,
        },
        limits: {
          x: { minRange: 4 },
        },
      },
    },
    scales: {
      x: {
        display: showXAxis,
        ticks: { color: '#9aa3b5', maxTicksLimit: 8 },
        grid: { color: '#2a2f3a' },
      },
      y: {
        ticks: {
          color: '#9aa3b5',
          callback: yTickCallback,
        },
        grid: { color: '#2a2f3a' },
      },
    },
  };
}

function createModalLineChart(canvas, label, displayLabels, data, color, showXAxis, yTickCallback) {
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: displayLabels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 1.5,
        tension: 0.2,
        pointRadius: data.map(() => 0),
        pointHoverRadius: 0,
        spanGaps: true,
      }],
    },
    options: modalChartBaseOptions(showXAxis, yTickCallback),
  });
  modalCharts.push(chart);
  return chart;
}

function highlightModalCharts(timeIso) {
  const idx = modalTimeIso.indexOf(timeIso);
  if (idx < 0) return;

  if (isModalZoomed()) {
    centerModalChartsOnIndex(idx);
  } else {
    setModalChartHighlightIndex(idx);
  }

  document.querySelectorAll('.decision-row[data-t]').forEach((row) => {
    row.classList.toggle('decision-row--highlight', row.dataset.t === timeIso);
  });
}

function clearModalChartHighlight() {
  restoreZoomAfterHover();
  modalCharts.forEach((chart) => {
    const ds = chart.data.datasets[0];
    ds.pointRadius = ds.data.map(() => 0);
    chart.update('none');
  });
  document.querySelectorAll('.decision-row--highlight').forEach((row) => {
    row.classList.remove('decision-row--highlight');
  });
}

function updateModalChart(bot) {
  const balanceCanvas = document.getElementById('modal-balance-chart');
  const priceContainer = document.getElementById('modal-price-charts');
  const emptyEl = document.getElementById('modal-chart-empty');
  const stackEl = document.getElementById('modal-charts-stack');
  if (!balanceCanvas || !priceContainer || !emptyEl || !stackEl) return;

  destroyModalCharts();

  const history = bot.balanceHistory || [];
  if (!history.length) {
    balanceCanvas.classList.add('hidden');
    priceContainer.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  balanceCanvas.classList.remove('hidden');
  priceContainer.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  modalTimeIso = history.map((p) => p.t);
  const displayLabels = modalTimeIso.map((t) => formatDateTimeDMY(t));
  const botIndex = currentBots.findIndex((b) => b.id === bot.id);
  const balanceColor = COLORS[botIndex >= 0 ? botIndex % COLORS.length : 0];

  createModalLineChart(
    balanceCanvas,
    'Balance',
    displayLabels,
    history.map((p) => p.balance),
    balanceColor,
    false,
    (v) => formatMoney(v),
  );

  const symbols = bot.symbols?.length
    ? bot.symbols
    : Object.keys(bot.priceHistory || {});

  symbols.forEach((symbol, i) => {
    const block = document.createElement('div');
    block.className = 'modal-chart-block';
    block.innerHTML = `
      <span class="modal-chart-label">${symbol}</span>
      <div class="modal-chart-container modal-chart-container--price">
        <canvas></canvas>
      </div>`;
    priceContainer.appendChild(block);

    const canvas = block.querySelector('canvas');
    const color = COLORS[(botIndex + i + 1) % COLORS.length];
    const prices = alignSeriesToTimeline(modalTimeIso, bot.priceHistory?.[symbol]);
    const isLast = i === symbols.length - 1;

    createModalLineChart(
      canvas,
      symbol,
      displayLabels,
      prices,
      color,
      isLast,
      (v) => (v == null ? '' : formatMoney(v)),
    );
  });

  applyModalZoomRange();
}

function renderModalDecisions(bot) {
  const listEl = document.getElementById('modal-decisions-list');
  const metaEl = document.getElementById('modal-decisions-meta');
  const holdsCheckbox = document.getElementById('modal-show-holds');
  if (!listEl || !metaEl) return;

  if (holdsCheckbox) holdsCheckbox.checked = modalShowHolds;

  const decisions = bot.decisions || [];
  const holds = decisions.filter((d) => d.action === 'hold').length;
  const filtered = modalShowHolds
    ? decisions
    : decisions.filter((d) => d.action !== 'hold');

  if (!decisions.length) {
    metaEl.textContent = 'Sin decisiones aún.';
    listEl.innerHTML = '<p class="modal-empty">La estrategia registrará cada tick al simular.</p>';
    return;
  }

  if (!modalShowHolds && holds > 0) {
    metaEl.textContent = `${filtered.length} operaciones · ${holds} holds ocultos · pasá el mouse para marcar en los gráficos`;
  } else {
    metaEl.textContent = `${decisions.length} decisiones · pasá el mouse para marcar en los gráficos`;
  }

  if (!filtered.length) {
    listEl.innerHTML = '<p class="modal-empty">Solo holds hasta ahora. Activá "Mostrar holds".</p>';
    return;
  }

  listEl.innerHTML = [...filtered].reverse().map(formatDecisionRow).join('');
}

function refreshBotModal(bot) {
  renderModalSummary(bot);
  updateModalChart(bot);
  renderModalDecisions(bot);
  renderModalPortfolio(bot);
}

function openBotModal(bot) {
  ensureModalStructure();
  els.modalBotName.textContent = bot.name;
  els.botModal.dataset.openBotId = bot.id;
  refreshBotModal(bot);
  els.botModal.classList.remove('hidden');
  els.botModal.setAttribute('aria-hidden', 'false');
}

function closeBotModal() {
  delete els.botModal.dataset.openBotId;
  modalZoomRange = null;
  modalZoomRangeBeforeHover = null;
  destroyModalCharts();
  els.botModal.classList.add('hidden');
  els.botModal.setAttribute('aria-hidden', 'true');
}

function renderDownloadProgress(state) {
  const progress = state.downloadProgress;
  const downloading = state.status === 'downloading';

  if (!downloading && !progress) {
    els.downloadProgressWrap.classList.add('hidden');
    els.downloadProgressBar.style.width = '0%';
    els.downloadStatus.textContent = '';
    return;
  }

  els.downloadProgressWrap.classList.remove('hidden');

  if (progress) {
    const pct = progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;
    els.downloadProgressBar.style.width = `${pct}%`;

    const phaseLabels = {
      checking: 'Verificando caché',
      downloading: 'Descargando desde Binance',
      cached: 'Cargado desde caché',
      done: 'Completado',
    };
    const phase = phaseLabels[progress.phase] || 'Procesando';
    els.downloadStatus.textContent = `${phase}: ${progress.symbol} (${progress.current}/${progress.total}) — ${pct}%`;
  } else {
    els.downloadStatus.textContent = 'Iniciando descarga...';
  }
}

function isConfigLocked(status) {
  return ['running', 'paused', 'finished', 'downloading'].includes(status);
}

function applyConfigLock(status) {
  const locked = isConfigLocked(status);
  els.configPanel.classList.toggle('config-locked', locked);
  if (locked) {
    els.configLockable.setAttribute('inert', '');
  } else {
    els.configLockable.removeAttribute('inert');
  }
}

function updateUI(state) {
  els.statusBadge.textContent = state.status;
  els.statusBadge.className = `badge ${state.status}`;

  if (state.dataBounds && state.config) {
    setConfigDatesInForm(state.config.startDate, state.config.endDate);
  }

  els.simClock.textContent = state.clock?.current
    ? state.dataBounds
      ? `${formatDateTimeDMY(state.clock.current)} (fin datos: ${formatDateTimeDMY(state.dataBounds.end)})`
      : formatDateTimeDMY(state.clock.current)
    : '—';

  renderDownloadProgress(state);

  els.btnStart.disabled = !['ready', 'paused'].includes(state.status);
  els.btnPause.disabled = state.status !== 'running';
  els.btnStop.disabled = !['running', 'paused', 'finished'].includes(state.status);
  els.btnSave.disabled = isConfigLocked(state.status);
  els.btnDownload.disabled = isConfigLocked(state.status) || state.status === 'downloading';

  applyConfigLock(state.status);

  if (!isConfigLocked(state.status) && state.config?.accelerationFactor != null) {
    setAccelerationUI(state.config.accelerationFactor);
  }

  renderDatasets(state.cachedDatasets, state.activeDataset);
  renderCacheStatus(state.cacheStatus, state.dataBounds);

  currentBots = state.bots || [];

  els.botsTable.innerHTML = currentBots
    .map(
      (bot) => `
    <tr class="bot-row" data-bot-id="${bot.id}" title="Ver detalle">
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

  if (!els.botModal.classList.contains('hidden')) {
    const openId = els.botModal.dataset.openBotId;
    const openBot = currentBots.find((b) => b.id === openId);
    if (openBot) refreshBotModal(openBot);
    else closeBotModal();
  }

  updateChart(state.history);
}

function updateChart(history) {
  if (!history?.series?.length) return;

  const labels = history.labels.map((t) => formatDateTimeDMY(t));
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
    if (event.type === 'download-complete' || event.type === 'dataset-loaded') {
      updateUI(event);
      return;
    }
    if (event.type === 'download-progress') {
      updateUI(event);
      return;
    }
    if (event.type === 'download-complete') {
      updateUI(event);
      return;
    }
    if (event.type === 'download-error') {
      updateUI(event);
      alert(event.error || 'Error en la descarga');
      return;
    }
    if (event.type === 'tick' || event.type === 'finished' || event.type === 'stopped') {
      const status = event.status ?? els.statusBadge.textContent;
      updateUI({
        status,
        clock: event.clock,
        bots: event.bots,
        history: event.history,
        dataBounds: event.dataBounds,
        cachedDatasets: event.cachedDatasets ?? cachedDatasets,
        cacheStatus: event.cacheStatus,
      });
      els.statusBadge.textContent = status;
      els.statusBadge.className = `badge ${status}`;
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

  applyConfig(state.config);
  updateUI(state);
  connectSSE();
  if (typeof initTutorial === 'function') initTutorial(els);
}

els.assetSearch.addEventListener('input', (e) => {
  assetSearchQuery = e.target.value;
  renderAssetSearch();
});

els.assetsList.addEventListener('click', (e) => {
  const btn = e.target.closest('.asset-add-btn');
  if (!btn) return;
  addAsset(btn.dataset.asset);
});

els.selectedAssetsList.addEventListener('click', (e) => {
  const btn = e.target.closest('.asset-chip-remove');
  if (!btn) return;
  removeAsset(btn.dataset.asset);
});

els.strategiesList.addEventListener('click', (e) => {
  const infoBtn = e.target.closest('.strategy-info-btn');
  if (!infoBtn) return;
  e.preventDefault();
  e.stopPropagation();
  const panel = document.querySelector(
    `.strategy-description[data-strategy-desc="${infoBtn.dataset.strategy}"]`,
  );
  if (panel) panel.classList.toggle('hidden');
});

els.strategiesList.addEventListener('change', (e) => {
  if (e.target.name !== 'strategy') return;
  toggleStrategyAssets(e.target.value, e.target.checked);
  if (!e.target.checked) return;
  const strategy = availableStrategies.find((s) => s.id === e.target.value);
  if (strategy?.assetsMode === 'multiple') {
    const experimentAssets = getSelectedAssets();
    experimentAssets.forEach((asset) => {
      const checkbox = document.querySelector(
        `.strategy-symbol-check[data-strategy="${e.target.value}"][value="${asset}"]`,
      );
      if (checkbox && !document.querySelector(
        `.strategy-symbol-check[data-strategy="${e.target.value}"]:checked`,
      )) {
        checkbox.checked = true;
      }
    });
  }
});

els.datasetsList.addEventListener('click', async (e) => {
  const deleteBtn = e.target.closest('.dataset-delete');
  if (deleteBtn) {
    e.stopPropagation();
    const dataset = cachedDatasets[Number(deleteBtn.dataset.index)];
    if (!dataset) return;
    const msg = `¿Eliminar los datos del ${formatDateDMY(dataset.startDate)} al ${formatDateDMY(dataset.endDate)} (${dataset.assets.join(', ')})?`;
    if (!confirm(msg)) return;
    try {
      const result = await api('/api/datasets', {
        method: 'DELETE',
        body: JSON.stringify({ startDate: dataset.startDate, endDate: dataset.endDate }),
      });
      renderDatasets(result.datasets, activeDataset);
      renderCacheStatus(result.cacheStatus);
      if (selectedDatasetKey === datasetKey(dataset)) {
        selectedDatasetKey = null;
      }
    } catch (err) {
      alert(err.message);
    }
    return;
  }

  const item = e.target.closest('.dataset-item');
  if (!item) return;
  const dataset = cachedDatasets[Number(item.dataset.index)];
  if (!dataset) return;

  if (selectedDatasetKey === datasetKey(dataset)) {
    selectedDatasetKey = null;
    renderDatasets(cachedDatasets, activeDataset);
    return;
  }

  try {
    await useSelectedDataset(dataset);
  } catch (err) {
    alert(err.message);
  }
});

els.botsTable.addEventListener('click', (e) => {
  const row = e.target.closest('.bot-row');
  if (!row) return;
  const bot = currentBots.find((b) => b.id === row.dataset.botId);
  if (bot) openBotModal(bot);
});

els.modalClose.addEventListener('click', closeBotModal);
els.botModal.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) closeBotModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeBotModal();
});

els.btnSave.addEventListener('click', async () => {
  try {
    const state = await persistExperimentConfig();
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
    renderDownloadProgress({ status: 'downloading', downloadProgress: null });

    await persistExperimentConfig();

    await api('/api/experiment/download', { method: 'POST' });
  } catch (err) {
    alert(err.message);
    renderDownloadProgress({ status: 'idle', downloadProgress: null });
    els.btnDownload.disabled = false;
  }
});

els.btnStart.addEventListener('click', async () => {
  try {
    await persistExperimentConfig();
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
