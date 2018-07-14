#!/usr/bin/env node

'use strict';

const fs = require('fs');
const async = require('async');
const https = require('http');
const diglet = require('..');
const path = require('path');
const tld = require('tldjs');
const bunyan = require('bunyan');
const config = require('./_config');
const serveStatic = require('serve-static')(
  path.join(__dirname, '../static')
);
const program = require('commander');

program
  .option('-d, --debug', 'show verbose logs')
  .parse(process.argv);

const logger = bunyan.createLogger({
  name: 'diglet-server',
  level: program.debug ? 'info' : 'error'
});
const whitelist = config.Whitelist && config.Whitelist.length
  ? config.Whitelist
  : false;
const server = new diglet.Server({ logger, whitelist });

function getProxyIdFromSubdomain(request) {
  let subdomain = tld.getSubdomain(request.headers.host);
  let parts = subdomain ? subdomain.split('.') : [];

  if (request.headers.host === config.Hostname) {
    return '';
  } else if (parts.length > 1) {
    return parts[0];
  } else {
    return subdomain;
  }
}

function getPublicUrlForProxy(proxy) {
  return `https://${proxy.id}.${config.Hostname}:${config.ProxyPort}`;
}

function handleServerRequest(request, response) {
  let proxyId = getProxyIdFromSubdomain(request);

  if (proxyId) {
    server.routeHttpRequest(proxyId, request, response, () => null);
  } else {
    serveStatic(request, response, () => response.end());
  }
}

function handleServerUpgrade(request, socket) {
  let proxyId = getProxyIdFromSubdomain(request);

  if (!proxyId) {
    return socket.destroy();
  }

  server.routeWebSocketConnection(proxyId, request, socket, () => null);
}

if (!config.ServerPrivateKey || !config.ServerSSLCertificate) {
  console.error('\n  error: no private key or certificate defined in config');
  process.exit(1);
}

const proxy = https.createServer({
  key: fs.readFileSync(config.ServerPrivateKey),
  cert: fs.readFileSync(config.ServerSSLCertificate)
});

proxy.on('request', handleServerRequest)
proxy.on('upgrade', handleServerUpgrade)

require('http').createServer(function(req, res) {
  res.writeHead(302, {
    Location: `https://${req.headers.host}${req.url}`
  });
  res.end();
}).listen(parseInt(config.RedirectPort));

console.info(`

   ____  _     _     _
  |    \\|_|___| |___| |_
  |  |  | | . | | -_|  _|
  |____/|_|_  |_|___|_|
          |___|

   Copyright (c) 2018, Gordon Hall
   Licensed under the GNU Affero General Public License Version 3
`);

proxy.listen(parseInt(config.ProxyPort), function() {
  console.log(
    `   Your Diglet proxy is running on port ${config.ProxyPort}`
  );
});
server.listen(parseInt(config.TunnelPort), function() {
  console.log(
    `   Your Diglet tunnel is running on port ${config.TunnelPort}`
  );
});

// NB: We do a heartbeat every minute
setInterval(() => {
  async.eachLimit([...server._proxies], 6, ([id, proxy], done) => {
    if (proxy._connectedSockets.length === 0) {
      logger.info('proxy %s has no connected sockets, destroying...', id);
      server._proxies.delete(id);
      return done();
    }

    const url = `https://${id}.${config.Hostname}:${config.ProxyPort}`;

    logger.info('sending heartbeat to %s (%s)', id, url);
    https.get(url, (res) => {
      res.resume();
      done();
    }).on('error', () => null);
  });
}, 60000);
