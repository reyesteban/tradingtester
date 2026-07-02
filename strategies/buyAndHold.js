/**
 * Para agregar una estrategia nueva:
 * 1. Creá un archivo .js en esta carpeta (ej: miEstrategia.js)
 * 2. Exportá un objeto con: id, name, defaultParams, onTick
 * 3. Reiniciá el servidor — se detecta automáticamente
 *
 * onTick recibe { clock, portfolio, market, params } y retorna:
 * - 'hold' o null: no operar
 * - { side: 'buy'|'sell', symbol, qty? }: una orden
 * - array de órdenes
 *
 * El budget inicial es el capital total en USD para operar entre todos
 * los activos. portfolio.cash es el efectivo disponible; portfolio.getPosition(symbol)
 * devuelve la cantidad tenida de cada activo.
 */
module.exports = {
  id: 'buy-and-hold',
  name: 'Buy & Hold',
  defaultParams: { symbol: 'BTCUSDT' },
  onTick({ portfolio, market, params, clock }) {
    if (portfolio.getPosition(params.symbol) > 0) return 'hold';
    const price = market.getPrice(params.symbol, clock.current);
    if (!price) return 'hold';
    return { side: 'buy', symbol: params.symbol };
  },
};
