# Walkthrough: interfaz y uso

Esta guía recorre el dashboard paso a paso. El objetivo es comparar estrategias de trading sobre datos históricos crypto (velas de 15 minutos) simulando el paso del tiempo.

---

## Para agentes (IA)

Referencia rápida para asistentes que modifican este repo. Leer esta sección antes de tocar UI, engine o estrategias.

### Mapa del proyecto

| Área | Archivos clave |
|------|----------------|
| Servidor / API | `src/index.js`, `src/server.js`, `src/api/routes.js` |
| Experimento | `src/experiment.js` — config, descarga, `useDataset`, `getState`, `getHistory` |
| Motor | `src/engine/clock.js`, `market.js`, `portfolio.js`, `simulator.js` |
| Estrategias | `strategies/*.js` — auto-discovery en `src/strategies/registry.js` |
| Dashboard | `public/index.html`, `public/app.js`, `public/style.css` |
| Tutorial UI | `public/tutorial.js` — panel lateral, pasos, `data-tutorial` anchors |
| Datos | `src/data/binance.js`, `src/data/cache.js` → `data/cache/*.json` |

### API REST relevante

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/assets` | Pares USDT de Binance |
| GET | `/api/strategies` | Lista estrategias (id, name, description, assetsMode) |
| GET | `/api/datasets` | Sets en caché local |
| GET/PUT | `/api/experiment` | Estado / guardar config |
| POST | `/api/experiment/download` | Descargar velas |
| POST | `/api/experiment/use-dataset` | Cargar set desde caché (lo llama el front al click en fila) |
| POST | `/api/experiment/start` \| `pause` \| `stop` | Control simulación |
| GET | `/api/experiment/stream` | SSE: `tick`, `finished`, `download-progress`, etc. |
| DELETE | `/api/datasets` | Borrar caché de un rango |

### Estado de un bot (`portfolio.toJSON`)

Cada bot en `state.bots` expone:

- `balance`, `cash`, `holdings`, `pnl`, `pnlPct`, `winning`
- `balanceHistory`: `[{ t, balance }]` — serie para gráfico del modal
- `decisions`: `[{ t, action: 'buy'|'sell'|'hold', symbol?, qty?, price? }]` — registrado en `portfolio.execute()`

El modal del bot (`public/app.js`: `refreshBotModal`) usa esos campos. No duplicar lógica de decisiones en el front.

### Tutorial en el dashboard

- Botón **Tutorial** en el header → `public/tutorial.js`
- Panel lateral fijo (`#tutorial-panel`), 9 pasos, resalta secciones con `data-tutorial="..."` en `index.html`
- Primera visita: se abre solo; `localStorage` key `trader-tutorial-dismissed`
- Al cambiar flujos de UI, actualizar **tanto** `public/tutorial.js` como esta guía

### Datos disponibles (UX actual)

- **No existe** el botón "Usar datos seleccionados"
- Click en fila de dataset → carga desde caché (`POST /api/experiment/use-dataset`) y marca selección
- Click de nuevo en la misma fila → deselecciona (solo visual; datos siguen en memoria si ya estaban cargados)
- Badge **En uso** = set activo en el experimento (`state.activeDataset`)

### Modal de estrategia (click en fila de bot)

Secciones en orden:

1. Resumen (balance, P&L, estado)
2. **Evolución** — gráfico Chart.js por bot (`#modal-bot-chart`, variable `modalChart`)
3. **Decisiones** — listado cronológico invertido; checkbox "Mostrar holds" (default: ocultos)
4. **Cartera** — efectivo y posiciones

Si el modal está abierto, `updateUI` llama `refreshBotModal` en cada tick SSE.

### Estrategias incluidas

| id | name | assetsMode | Resumen |
|----|------|------------|---------|
| `buy-and-hold` | Buy & Hold | multiple | Compra al inicio y mantiene |
| `sma-crossover` | SMA Crossover | single | Cruce de medias móviles |
| `suaxgrouth` | SUAXGROUTH | multiple | Solo compra activos en tendencia alcista; SL 1%, TP 10% |

Nueva estrategia: archivo en `strategies/`, reiniciar servidor. Estado entre ticks: se puede mutar `params` (ej. `params._entryPrices` en SUAXGROUTH).

### Reglas del simulador

- Un tick = 15 min simulados
- `market.getPrice` / `getClosePrices` no permiten futuro respecto a `clock.current`
- La simulación termina al llegar al fin de `market.getDataBounds()`
- Sin comisiones ni slippage; ejecución al cierre de vela

---

## Arranque

```bash
npm start
```

Abrí [http://localhost:3000](http://localhost:3000). El servidor debe quedar corriendo en la consola.

---

## Vista general

La pantalla se divide en dos paneles:

| Panel | Ubicación | Para qué sirve |
|-------|-----------|----------------|
| **Configuración** | Izquierda | Definir el experimento, cargar datos y elegir estrategias |
| **Monitoreo** | Derecha | Ver bots, balances y gráfico en tiempo simulado |

En el encabezado:

- **Estado** del experimento (badge)
- Botón **Tutorial** — guía interactiva paso a paso (panel lateral)

| Estado | Significado |
|--------|-------------|
| `idle` | Configurado pero sin datos cargados en memoria |
| `downloading` | Descargando o leyendo velas |
| `ready` | Datos cargados, listo para simular |
| `running` | Simulación en curso |
| `paused` | Simulación pausada |
| `finished` | Llegó al final del intervalo de datos |

---

## Tutorial interactivo

El botón **Tutorial** del encabezado abre un panel lateral con 9 pasos. Cada paso resalta la sección correspondiente del dashboard.

- **Siguiente / Anterior** para navegar
- Al finalizar podés marcar *No mostrar de nuevo al abrir*
- En la primera visita se abre automáticamente

---

## 1. Configurar fechas y aceleración

### Fecha inicio / Fecha fin

Definen el **rango que querés descargar** de Binance. Van una al lado de la otra.

> Después de cargar datos, las fechas se ajustan automáticamente al intervalo **real** de las velas disponibles. La simulación solo corre dentro de ese rango.

### Factor de aceleración

Controla qué tan rápido avanza el tiempo simulado:

- Un valor mayor = más ticks por segundo (cada tick = 15 minutos simulados).
- **Max**: desactiva el número y corre lo más rápido posible.

---

## 2. Elegir activos del experimento

Los activos vienen de **Binance** (pares `*USDT`).

1. Escribí en **Buscar y agregar activo** (ej: `BTC`, `ETH`).
2. Aparecen coincidencias; click en **+ BTCUSDT** para agregar.
3. Los activos elegidos quedan en **Seleccionados** como chips.
4. Click en **×** de un chip para quitarlo.

Estos activos son los que se descargarán y los que cada estrategia podrá usar.

> Podés buscar y agregar varios sin perder la selección anterior.

---

## 3. Datos disponibles (caché local)

Lista los conjuntos ya guardados en disco (`data/cache/`). Cada entrada muestra:

- Rango de fechas
- Activos incluidos

### Cargar o deseleccionar un set

- **Click en la fila** → carga las velas desde caché, pasa a `ready` y marca la fila (borde azul). Actualiza fechas/activos en el formulario.
- **Click de nuevo en la misma fila** → deselecciona (solo visual).
- El set **en uso** muestra badge verde **En uso**.

No hay botón separado: el click en la fila reemplaza el antiguo "Usar datos seleccionados".

### Eliminar un set

Click en **×** a la derecha de la fila. Pide confirmación y borra los archivos de caché de ese rango.

Debajo verás el **estado de caché** de la config actual: qué activos ya están descargados y cuáles faltan.

---

## 4. Elegir estrategias

Cada estrategia es un bot con su propio budget.

### Activar una estrategia

Marcá el checkbox junto al nombre.

### Budget total

Número a la derecha: capital en USD que el bot puede usar **entre todos sus activos** (efectivo + posiciones).

### Icono **i**

Muestra la descripción de la estrategia (definida en el código en `strategies/`).

### Activos por estrategia

Depende del tipo de estrategia:

| Tipo | UI | Ejemplo |
|------|-----|---------|
| `single` | Dropdown con un activo | SMA Crossover → elegís BTC o ETH |
| `multiple` | Checkboxes con varios activos | Buy & Hold, SUAXGROUTH → podés elegir varios |

Solo aparecen activos que hayas seleccionado en el experimento (sección 2).

### Estrategias disponibles

- **Buy & Hold** — compra al inicio y mantiene posiciones.
- **SMA Crossover** — compra/vende por cruce de medias móviles (un activo).
- **SUAXGROUTH** — compra solo activos con tendencia alcista (SMA corta > larga, precio sobre la media, crecimiento reciente). Cierra con **stop loss 1%** o **take profit 10%** respecto al precio de entrada.

---

## 5. Cargar datos

Tenés dos caminos:

### A) Usar datos guardados (recomendado si ya existen)

Sección **Datos disponibles** → click en la fila del set deseado.

### B) Descargar datos nuevos

1. Configurá fechas y activos.
2. Click en **Descargar datos**.

Aparece una **barra de progreso** por activo. Si ya estaba en caché, avanza rápido con mensaje "Cargado desde caché".

**Guardar config** guarda la configuración sin descargar (útil si querés persistir cambios antes de otra acción).

---

## 6. Ejecutar la simulación

Con estado `ready`:

| Botón | Acción |
|-------|--------|
| **Iniciar** | Arranca o reanuda la simulación |
| **Pausar** | Frena sin perder progreso |
| **Detener** | Resetea reloj y bots al inicio (vuelve a `ready`) |

El tiempo simulado avanza de a 15 minutos. Los bots operan solo con precios del pasado o presente simulado — nunca del futuro.

---

## 7. Monitorear resultados

### Reloj simulado

Muestra la fecha/hora actual dentro de la simulación (y el fin de datos cargados cuando aplica).

### Tabla de bots

Una fila por estrategia activa:

- **Bot**: nombre + activos configurados
- **Budget total**: capital inicial
- **Balance**: valor actual (efectivo + posiciones)
- **P&L**: ganancia/pérdida vs budget
- **Estado**: Ganando / Perdiendo

### Gráfico principal

Evolución del balance de **cada bot** a lo largo del tiempo simulado. Se actualiza en vivo durante la simulación.

### Modal de detalle (click en fila de bot)

Abre un panel con:

1. **Resumen** — balance, P&L y estado actual
2. **Evolución** — gráfico del balance de ese bot en el tiempo
3. **Decisiones** — listado de lo que hizo la estrategia tick a tick:
   - **Comprar** / **Vender** con activo, cantidad y precio
   - **Mantener** cuando no operó (ocultos por defecto; activar *Mostrar holds*)
4. **Cartera** — efectivo y posiciones por activo

El modal se actualiza en vivo si permanece abierto durante la simulación.

---

## Flujo típico (primera vez)

```
1. Elegir fechas
2. Buscar y agregar activos (ej: BTCUSDT, ETHUSDT)
3. Marcar estrategias, setear budget y activos por estrategia
4. Descargar datos
5. Iniciar
6. Revisar tabla, gráfico y modal (evolución + decisiones)
```

## Flujo típico (segunda vez, con caché)

```
1. En Datos disponibles, click en un set guardado
2. Ajustar estrategias si hace falta
3. Iniciar
```

---

## Consejos

- Si cambiás **fechas o activos** del experimento, hay que volver a cargar datos (descargar o click en un set).
- **Max** es útil para recorrer meses de datos en segundos.
- Compará varias estrategias con el mismo rango y budget para ver cuál rinde mejor.
- Las estrategias nuevas se agregan como archivos `.js` en `strategies/`; reiniciá el servidor para verlas.
- Para depurar una estrategia, abrí su modal y revisá el listado de **Decisiones**.

---

## Agregar estrategias

Ver [README.md](README.md#agregar-una-estrategia-nueva) para la interfaz de código (`id`, `name`, `description`, `assetsMode`, `onTick`).

Estado entre ticks: el objeto `params` del bot persiste en memoria hasta `resetBots()` / Detener. Podés usar `params._miEstado` para precios de entrada, contadores, etc. (ver `strategies/suaxgrouth.js`).
