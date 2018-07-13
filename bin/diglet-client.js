#!/usr/bin/env node

'use strict';

const bunyan = require('bunyan');
const diglet = require('..');
const config = require('./_config');
const logger = bunyan.createLogger({ name: 'diglet-client', levels: ['err'] });
const program = require('commander');

program
  .option('-p, --port <port>', 'local port to reverse tunnel', 8080)
  .parse(process.argv);

const tunnel = new diglet.Tunnel({
  localAddress: '127.0.0.1',
  localPort: parseInt(program.port),
  remoteAddress: config.Hostname,
  remotePort: config.TunnelPort,
  logger
});

tunnel.open().once('established', function() {
  console.info(`\n\tReverse Tunnel Established: ${tunnel.url}`);
});
