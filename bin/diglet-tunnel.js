#!/usr/bin/env node

'use strict';

const path = require('path');
const os = require('os');
const bunyan = require('bunyan');
const diglet = require('..');
const config = require('./_config');
const logger = bunyan.createLogger({ name: 'diglet-client' });
const fs = require('fs');
const { randomBytes } = require('crypto');
const secp256k1 = require('secp256k1');
const program = require('commander');


function getPrivateKey() {
  const keypath = path.join(os.homedir(), '.diglet.key');

  if (fs.existsSync(keypath)) {
    return fs.readFileSync(keypath);
  }

  let key = Buffer.from([]);

  while (!secp256k1.privateKeyVerify(key)) {
    key = randomBytes(32);
  }

  fs.writeFileSync(keypath, key);
  return key;
}

program
  .option('-p, --port <port>', 'local port to reverse tunnel', 8080)
  .parse(process.argv);

const tunnel = new diglet.Tunnel({
  localAddress: '127.0.0.1',
  localPort: parseInt(program.port),
  remoteAddress: config.Hostname,
  remotePort: config.TunnelPort,
  logger,
  privateKey: getPrivateKey()
});

tunnel.open();
//console.info(`\n\tReverse Tunnel Established: ${tunnel.url}`);
