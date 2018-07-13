#!/usr/bin/env node

'use strict';

const http = require('http');
const diglet = require('..');
const path = require('path');
const tld = require('tldjs');
const bunyan = require('bunyan');
const logger = bunyan.createLogger({ name: 'diglet-server' });
const config = require('./_config');
const server = new diglet.Server({ logger });
const serveStatic = require('serve-static')(
  path.join(__dirname, '../static')
);

function getProxyIdFromSubdomain(request) {
  let subdomain = tld.getSubdomain(request.headers.host);
  let parts = subdomain.split('.');

  if (request.headers.host === config.Hostname) {
    return '';
  } else if (parts.length > 1) {
    return parts[0];
  } else {
    return subdomain;
  }
}

function getPublicUrlForProxy(proxy) {
  return `http://${proxy.id}.${config.Hostname}:${config.ProxyPort}`;
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

const proxy = http.createServer();

proxy.on('request', handleServerRequest)
proxy.on('upgrade', handleServerUpgrade)

proxy.listen(parseInt(config.ProxyPort), function() {
  logger.info('diglet proxy running on port %s', config.ProxyPort);
});
server.listen(parseInt(config.TunnelPort), function() {
  logger.info('diglet tunnel running on port %s', config.TunnelPort);
});
