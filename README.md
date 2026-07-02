# Evaluador de estrategias de trading

Proyecto para evaluar el rendimiento de distintas estrategias de trading sobre datos históricos crypto (velas de 15 minutos vía Binance, pares USDT como proxy USD).

## Requisitos

- Node.js 18+

## Arranque

```bash
npm start
```

Abrir [http://localhost:3000](http://localhost:3000)

## Flujo de uso

1. Configurar fechas, activos (listados desde Binance, pares USDT) y estrategias
2. Revisar **Datos disponibles** para reutilizar rangos ya descargados (click para aplicar fechas y activos)
2. Click **Guardar config** (opcional si vas directo a descargar)
3. Click **Descargar datos** — obtiene velas de Binance y las cachea en `data/cache/`
4. Click **Iniciar** — corre la simulación avanzando el tiempo cada 15 minutos
5. Monitorear balances y cartera de cada bot en tiempo real (tabla, cartera y gráfico)

Cada bot recibe un **budget total** en USD que puede distribuir entre cualquier activo. La cartera muestra efectivo disponible y posiciones abiertas por símbolo.

Controles: **Pausar**, **Detener** (resetea el reloj y los bots).

## Agregar una estrategia nueva

Las estrategias viven en la carpeta [`strategies/`](strategies/). Para agregar una:

1. Creá un archivo `.js` en `strategies/` (ej: `strategies/miEstrategia.js`)
2. Exportá un objeto con esta interfaz:

```js
module.exports = {
  id: 'mi-estrategia',           // identificador único
  name: 'Mi Estrategia',         // nombre visible en el dashboard
  defaultParams: { symbol: 'BTCUSDT' },
  onTick({ clock, portfolio, market, params }) {
    // clock.current = tiempo simulado actual
    // portfolio.cash = efectivo disponible (del budget total)
    // portfolio.getPosition(symbol) = cantidad tenida de cada activo
    // El budget es capital total compartido entre todos los activos
    // market.getPrice(symbol, atTime) — solo pasado/presente
    // market.getClosePrices(symbol, count, atTime) — historial de cierres

    // Retornar:
  // 'hold' | null          → no operar
  // { side: 'buy'|'sell', symbol, qty? }  → una orden (qty opcional, usa todo el cash al comprar)
  // [{ ... }, { ... }]     → múltiples órdenes
  },
};
```

3. Reiniciá el servidor — el archivo se detecta automáticamente

Ver ejemplos en [`strategies/buyAndHold.js`](strategies/buyAndHold.js) y [`strategies/smaCrossover.js`](strategies/smaCrossover.js).

## Arquitectura

- **Backend**: Node.js sin dependencias npm (`http`, `fs`, `https`)
- **Dashboard**: HTML/CSS/JS estático + Chart.js (CDN)
- **Datos**: Binance public API, cache local JSON
- **Simulación**: reloj global; los bots solo acceden a precios hasta `clock.current`

## Limitaciones

- Pares en USDT (≈ USD, no idéntico)
- Sin comisiones ni slippage
- Órdenes ejecutadas al precio de cierre de la vela actual
