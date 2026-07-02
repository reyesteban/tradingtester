const { listStrategies } = require('../strategies/registry');
const { listCachedDatasets } = require('../data/cache');
const { fetchUsdtSymbols } = require('../data/binance');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function createRoutes(experiment) {
  const sseClients = new Set();

  experiment.simulator.onTick((event) => {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
      client.write(payload);
    }
  });

  async function handler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;
    const method = req.method;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (method === 'GET' && pathname === '/api/assets') {
        const assets = await fetchUsdtSymbols();
        json(res, 200, { assets });
        return;
      }

      if (method === 'GET' && pathname === '/api/datasets') {
        json(res, 200, { datasets: listCachedDatasets() });
        return;
      }

      if (method === 'GET' && pathname === '/api/strategies') {
        json(res, 200, { strategies: listStrategies() });
        return;
      }

      if (method === 'GET' && pathname === '/api/experiment') {
        json(res, 200, experiment.getState());
        return;
      }

      if (method === 'GET' && pathname === '/api/experiment/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', ...experiment.getState() })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (method === 'PUT' && pathname === '/api/experiment') {
        const body = await readBody(req);
        experiment.configure(body);
        json(res, 200, experiment.getState());
        return;
      }

      if (method === 'POST' && pathname === '/api/experiment/download') {
        await experiment.download();
        json(res, 200, experiment.getState());
        return;
      }

      if (method === 'POST' && pathname === '/api/experiment/start') {
        experiment.simulator.start();
        json(res, 200, experiment.getState());
        return;
      }

      if (method === 'POST' && pathname === '/api/experiment/pause') {
        experiment.simulator.pause();
        json(res, 200, experiment.getState());
        return;
      }

      if (method === 'POST' && pathname === '/api/experiment/stop') {
        experiment.simulator.stop();
        json(res, 200, experiment.getState());
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error(err);
      json(res, 400, { error: err.message });
    }
  }

  return handler;
}

module.exports = { createRoutes };
