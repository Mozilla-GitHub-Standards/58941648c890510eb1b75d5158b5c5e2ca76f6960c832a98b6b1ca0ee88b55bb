'use strict';

var cluster = require('cluster');
var spawn = require('child_process').spawn;
var fs = require('fs');
var crypto = require('crypto');

var log = require('./log');
var pkg = require('../package.json');
var SpdyProxy = require('./proxy');

var CONFIG = require('config');
var NAME = pkg.name;
var TITLE = NAME + '/' + pkg.version;
var ROOT_DIR = __dirname + '/..';
var STATSD_CONFIG_PATH = ROOT_DIR + '/config/statsd-runtime.js';

function showHelp() {
  console.log('%s\n' +
      '-h [--help]        shows help\n' +
      '-v [--version]     shows the version', TITLE);
}

function showVersion() {
  console.log(TITLE);
}

function addVersionConfig() {
  CONFIG.version = pkg.version;
  CONFIG.title = TITLE;
  CONFIG.name = NAME;
}

// Parse YAML configuration file and set options.
CONFIG.getConfigSources().forEach(function(config) {
  addVersionConfig();
  log.info('Using configuration %s', config.name);
});

var cryptoSettings = {};

function initCryptoSettings() {
  cryptoSettings = {
    salt: crypto.createHash('sha256')
          .update(crypto.randomBytes(256))
          .digest('hex')
  };
}

function loadCryptoSettings() {
  cryptoSettings = JSON.parse(process.env.crypto);
}

// Handle command-line arguments.
function handleArgs() {
  process.argv.forEach(function(value) {
    if (value === '-h' || value === '--help') {
      showHelp();
      process.exit(1);
    }
    if (value === '-v' || value === '--version') {
      showVersion();
      process.exit(1);
    }
  });
}

function getWorkerCount() {
  if (!CONFIG.cluster.enabled) {
    // We start at least one worker, the master only serves PACs.
    return 1;
  }

  if (CONFIG.cluster.workers.auto) {
    // Using the general heuristic of 2x physical cores.
    return 2 * require('os').cpus().length;
  } else {
    return CONFIG.cluster.workers.count || 1;
  }
}

function startProxy() {
  var proxy = new SpdyProxy(CONFIG, cryptoSettings);
  proxy.listen(CONFIG.proxy.port);
}

function spawnWorkers(n) {
  log.debug('starting %d workers', n);
  var env = { crypto: JSON.stringify(cryptoSettings) };
  for (var i = 0; i < n; ++i) {
    cluster.fork(env);
  }

  cluster.on('exit', function(worker, code, signal) {
    log.debug('worker %d died (%s)', worker.process.pid, signal || code);
    cluster.fork(env);
  });
}

// Spawns a StatsD backend with the provided configuration.
function spawnMetricsServer() {
  // Write the StatsD configuration to file.
  fs.writeFileSync(STATSD_CONFIG_PATH, JSON.stringify(CONFIG.metrics.statsd));

  // Spawn the daemon.
  var metrics = spawn('node', [
    ROOT_DIR + '/node_modules/statsd/stats.js',
    STATSD_CONFIG_PATH
  ]);

  metrics.stdout.on('data', function(data) {
    log.debug(data.toString());
  });

  metrics.stderr.on('data', function(data) {
    log.error(data.toString());
  });

  metrics.on('close', function(code) {
    log.debug(code);
  });

  metrics.on('error', function(err) {
    log.error(err);
  });
}

if (cluster.isMaster) {
  handleArgs();
  initCryptoSettings();

  if (CONFIG.metrics.enabled && CONFIG.metrics.statsd.spawn) {
    spawnMetricsServer();
  }

  spawnWorkers(getWorkerCount());
} else {
  loadCryptoSettings();
  startProxy();
}
