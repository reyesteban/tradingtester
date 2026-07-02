const TUTORIAL_STORAGE_KEY = 'trader-tutorial-dismissed';

const TUTORIAL_STEPS = [
  {
    target: null,
    title: 'Bienvenido',
    body: 'Este evaluador compara estrategias de trading sobre datos históricos crypto (velas de 15 minutos). La pantalla tiene dos paneles: Configuración (izquierda) y Monitoreo (derecha).',
  },
  {
    target: '[data-tutorial="status"]',
    title: 'Estado del experimento',
    body: 'El badge del encabezado indica en qué fase estás: idle (sin datos cargados), downloading, ready (listo para simular), running, paused o finished.',
  },
  {
    target: '[data-tutorial="dates"]',
    title: 'Fechas y aceleración',
    body: 'Elegí el rango a descargar de Binance. Tras cargar datos, las fechas se ajustan al intervalo real de las velas. El factor de aceleración controla la velocidad; Max corre lo más rápido posible.',
  },
  {
    target: '[data-tutorial="assets"]',
    title: 'Activos',
    body: 'Buscá un par USDT (ej: BTC), click en + para agregarlo a Seleccionados. Esos activos se descargan y están disponibles para las estrategias.',
  },
  {
    target: '[data-tutorial="datasets"]',
    title: 'Datos disponibles',
    body: 'Sets ya guardados en disco. Click en una fila para cargarlo; click de nuevo para deseleccionar. La × elimina el set.',
  },
  {
    target: '[data-tutorial="strategies"]',
    title: 'Estrategias',
    body: 'Marcá las estrategias a evaluar (Buy & Hold, SMA Crossover, SUAXGROUTH, etc.), asigná budget y elegí activos. El icono i muestra la descripción de cada una.',
  },
  {
    target: '[data-tutorial="actions"]',
    title: 'Cargar y ejecutar',
    body: 'Descargar datos obtiene velas de Binance. Iniciar, Pausar y Detener quedan abajo: al correr la simulación el resto de la config se bloquea hasta Detener.',
  },
  {
    target: '[data-tutorial="monitor"]',
    title: 'Monitoreo',
    body: 'Seguí el tiempo simulado, la tabla de bots y el gráfico de balances. Click en una fila para ver evolución, decisiones y cartera en detalle.',
  },
  {
    target: null,
    title: 'Flujo recomendado',
    body: 'Primera vez: fechas → activos → estrategias → Descargar datos → Iniciar. Con caché: click en un set → Iniciar. En el modal del bot ves evolución, decisiones (compras/ventas/holds) y cartera.',
  },
];

function initTutorial(els) {
  let currentStep = 0;

  function highlightStep() {
    document.querySelectorAll('.tutorial-highlight').forEach((el) => {
      el.classList.remove('tutorial-highlight');
    });

    const step = TUTORIAL_STEPS[currentStep];
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        el.classList.add('tutorial-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  function renderStep() {
    const step = TUTORIAL_STEPS[currentStep];
    els.tutorialTitle.textContent = step.title;
    els.tutorialBody.textContent = step.body;
    els.tutorialProgress.textContent = `${currentStep + 1} / ${TUTORIAL_STEPS.length}`;
    els.tutorialPrev.disabled = currentStep === 0;
    els.tutorialNext.textContent = currentStep === TUTORIAL_STEPS.length - 1 ? 'Finalizar' : 'Siguiente';
    highlightStep();
  }

  function openTutorial() {
    els.tutorialPanel.classList.remove('hidden');
    els.tutorialPanel.setAttribute('aria-hidden', 'false');
    currentStep = 0;
    renderStep();
  }

  function closeTutorial() {
    els.tutorialPanel.classList.add('hidden');
    els.tutorialPanel.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('.tutorial-highlight').forEach((el) => {
      el.classList.remove('tutorial-highlight');
    });
  }

  els.btnTutorial.addEventListener('click', openTutorial);
  els.tutorialClose.addEventListener('click', closeTutorial);
  els.tutorialPrev.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep -= 1;
      renderStep();
    }
  });
  els.tutorialNext.addEventListener('click', () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      currentStep += 1;
      renderStep();
    } else {
      if (els.tutorialDismiss.checked) {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
      }
      closeTutorial();
    }
  });

  if (!localStorage.getItem(TUTORIAL_STORAGE_KEY)) {
    openTutorial();
  }
}

window.initTutorial = initTutorial;
