/**
 * Para agregar una estrategia nueva:
 * 1. Creá un archivo .js en esta carpeta (ej: miEstrategia.js)
 * 2. Exportá un objeto con: id, name, description, assetsMode, defaultParams, onTick
 * 3. Reiniciá el servidor — se detecta automáticamente
 *
 * assetsMode:
 * - 'single': opera sobre un activo (el usuario elige cuál)
 * - 'multiple': opera sobre varios activos a la vez
 *
 * onTick recibe params.symbols (array) y params.symbol (primer activo, compat).
 */
module.exports = {
  id: 'buy-and-hold',
  name: 'Buy & Hold',
  description:
    'Compra los activos seleccionados al inicio del experimento repartiendo el budget en partes iguales, y mantiene las posiciones sin vender.',
  assetsMode: 'multiple',
  defaultParams: { symbols: ['BTCUSDT'] },
  onTick({ portfolio, market, params, clock }) {
    const symbols = params.symbols ?? [];
    const pending = symbols.filter((symbol) => portfolio.getPosition(symbol) === 0);
    if (!pending.length) return 'hold';

    const orders = [];
    const cashPerSymbol = portfolio.cash / pending.length;

    for (const symbol of pending) {
      const price = market.getPrice(symbol, clock.current);
      if (!price) continue;
      orders.push({ side: 'buy', symbol, qty: cashPerSymbol / price });
    }

    return orders.length ? orders : 'hold';
  },
};
