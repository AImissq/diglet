'use strict';

const config = require('rc')('diglet', {
  Hostname: 'tunnel.bookch.in',
  ProxyPort: 80,
  TunnelPort: 8088,
  Whitelist: false
});

module.exports = config;
