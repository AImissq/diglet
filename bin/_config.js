'use strict';

module.exports = require('rc')('diglet', {
  server: {
    serverHost: 'localhost',
    serverPort: 9000,
    proxyPortRange: {
      min: 12000,
      max: 12023
    },
    maxProxiesAllowed: 24,
    proxyMaxConnections: 10,
    proxyIdleTimeout: 5000
  },
  client: {
    localAddress: 'localhost',
    localPort: 8080,
    remoteAddress: 'localhost',
    remotePort: 9000
  }
});

