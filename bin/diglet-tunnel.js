#!/usr/bin/env node

'use strict';

const path = require('path');
const os = require('os');
const bunyan = require('bunyan');
const diglet = require('..');
const config = require('./_config');
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
  .option('-d, --debug', 'show verbose logs')
  .parse(process.argv);

const logger = bunyan.createLogger({ name: 'diglet-client', level: program.debug ? 'info' : 'error' });
const tunnel = new diglet.Tunnel({
  localAddress: '127.0.0.1',
  localPort: parseInt(program.port),
  remoteAddress: config.Hostname,
  remotePort: config.TunnelPort,
  logger,
  privateKey: getPrivateKey()
});

console.info(`

   ____  _     _     _
  |    \\|_|___| |___| |_
  |  |  | | . | | -_|  _|
  |____/|_|_  |_|___|_|
          |___|

   Copyright (c) 2018, Gordon Hall
   Licensed under the GNU Affero General Public License Version 3
`);
console.info(`
   Your tunnel is available at:
   ${tunnel.url}
`);
tunnel.open();
