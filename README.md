# Evaluador de estrategias de trading

Proyecto para evaluar el rendimiento de distintas estrategias de trading sobre datos históricos crypto (velas de 15 minutos vía Binance, pares USDT como proxy USD).

## Requisitos

- Node.js 18+

## Arranque

```bash
npm start
```

Abrir [http://localhost:3000](http://localhost:3000)

## Walkthrough

Guía completa de la interfaz y flujo de uso: **[WALKTHROUGH.md](WALKTHROUGH.md)**

## Resumen rápido

1. Configurar fechas, activos y estrategias
2. Cargar datos (**Descargar datos** o **click en un set** de Datos disponibles)
3. **Iniciar** la simulación y monitorear tabla + gráfico (click en fila para evolución, decisiones y cartera)

Cada bot tiene un **budget total** en USD compartido entre sus activos. El experimento solo corre en el intervalo de velas cargadas.

Estrategias incluidas: **Buy & Hold**, **SMA Crossover**, **SUAXGROUTH** (tendencia alcista + SL 1% / TP 10%).

## Agregar una estrategia nueva

Las estrategias viven en la carpeta [`strategies/`](strategies/). Para agregar una:

1. Creá un archivo `.js` en `strategies/` (ej: `strategies/miEstrategia.js`)
2. Exportá un objeto con esta interfaz:

```js
module.exports = {
  id: 'mi-estrategia',
  name: 'Mi Estrategia',
  description: 'Explicación breve de qué hace la estrategia.',
  assetsMode: 'single',          // 'single' | 'multiple'
  defaultParams: { symbols: ['BTCUSDT'], short: 10, long: 30 },
  onTick({ clock, portfolio, market, params }) {
    // params.symbols = activos elegidos para este bot
    // Retornar: 'hold' | null | orden | array de órdenes
  },
};
```

3. Reiniciá el servidor — el archivo se detecta automáticamente

Ver ejemplos en [`strategies/buyAndHold.js`](strategies/buyAndHold.js), [`strategies/smaCrossover.js`](strategies/smaCrossover.js) y [`strategies/suaxgrouth.js`](strategies/suaxgrouth.js).

## Arquitectura

- **Backend**: Node.js sin dependencias npm (`http`, `fs`, `https`)
- **Dashboard**: HTML/CSS/JS estático + Chart.js (CDN)
- **Datos**: Binance public API, cache local JSON
- **Simulación**: reloj global; los bots solo acceden a precios hasta `clock.current`. El experimento solo corre en el intervalo de los datos descargados.

## Limitaciones

- Pares en USDT (≈ USD, no idéntico)
- Sin comisiones ni slippage
- Órdenes ejecutadas al precio de cierre de la vela actual
