const { createServer } = require('./server');
const { Experiment } = require('./experiment');

const PORT = process.env.PORT || 3000;

const experiment = new Experiment();
const server = createServer(experiment);

server.listen(PORT, () => {
  console.log(`Trader evaluator running at http://localhost:${PORT}`);
  console.log(`Strategies folder: strategies/ (add .js files to register new strategies)`);
});
