#!/usr/bin/env node

'use strict';

const colors = require('colors/safe');
const config = require('rc')('diglet', {
  server: {
    serverHost: 'localhost',
    serverPort: 9000,
    proxyPortRange: {
      min: 12000,
      max: 12023
    },
    maxProxiesAllowed: 24,
    proxyMaxConnections: 12,
    proxyIdleTimeout: 5000,
    proxySocketTimeout: 5000
  },
  client: {
    localAddress: 'localhost',
    localPort: 8080,
    remoteAddress: 'diglet.me',
    remotePort: 80,
    maxConnections: 12,
    requestProxyId: require('crypto').randomBytes(6).toString('hex')
  }
});

console.log('');

for (let prop in config.server) {
  console.log(
    colors.bold(`server.${prop} =`), config.server[prop]);
}

console.log('');

for (let prop in config.client) {
  console.log(colors.bold(`client.${prop} =`), config.client[prop]);
}

console.log('');

module.exports = config;
