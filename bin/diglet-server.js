#!/usr/bin/env node

'use strict';

const { camelCase } = require('camel-case');
const colors = require('colors/safe');
const pkg = require('../package');
const fs = require('fs');
const async = require('async');
const https = require('https');
const diglet = require('..');
const path = require('path');
const tld = require('tldjs');
const bunyan = require('bunyan');
const config = require('./_config');
const program = require('commander');

const started = Date.now();
const cpus = require('os').cpus().length;

program
  .version(require('../package').version)
  .option('-w, --workers <n>', 'number of worker processes to spawn', cpus)
  .option('-d, --debug', 'show verbose logs')
  .parse(process.argv);

if (!config.ServerPrivateKey || !config.ServerSSLCertificate) {
  console.error('\n  error: no private key or certificate defined in config');
  process.exit(1);
}

config.ServerPrivateKey = fs.readFileSync(config.ServerPrivateKey);
confid.ServerSSLCertificate = fs.readFileSync(config.ServerSSLCertificate);

const logger = bunyan.createLogger({
  name: 'diglet-server',
  level: program.debug ? 'info' : 'error'
});
const options = camelCase(config);
const cluster = new diglet.Cluster(parseInt(program.workers), {
  logger,
  ...options
});

console.info(colors.bold(`

   ____  _     _     _
  |    \\|_|___| |___| |_
  |  |  | | . | | -_|  _|
  |____/|_|_  |_|___|_|
          |___|

`));
console.info(colors.italic('   Copyright (c) 2019 Dead Canaries, Inc.'));
console.info(colors.italic('   Licensed under the GNU Affero General Public License Version 3'));
console.info('  ')
console.info('  ')
console.info('  ')

cluster.listen(function() {
  console.info(colors.bold('  Your proxy frontend is available at the following URL(s):'));
  console.info('  ');
  console.info(`      https://${config.Hostname}:${config.ProxyPort}`);
  console.info(`      https://*.${config.Hostname}:${config.ProxyPort}`);
  console.info('  ');
  console.log(colors.bold(`   Your tunnel backend is available at the following URL(s):`));
  console.info('  ');
  console.info(`      https://${config.Hostname}:${config.TunnelPort}`);
  console.info('  ');
});


