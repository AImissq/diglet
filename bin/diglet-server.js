#!/usr/bin/env node

'use strict';

const qs = require('querystring');
const url = require('url');
const http = require('http');
const diglet = require('..');
const path = require('path');
const tld = require('tldjs');
const bunyan = require('bunyan');
const logger = bunyan.createLogger({ name: 'diglet-server' });

const config = require('./diglet-config');
const server = new diglet.Server({
  logger: logger,
  proxyPortRange: {
    min: Number(config.server.proxyPortRange.min),
    max: Number(config.server.proxyPortRange.max)
  },
  maxProxiesAllowed: Number(config.server.maxProxiesAllowed),
  proxyMaxConnections: Number(config.server.proxyMaxConnections),
  proxyIdleTimeout: Number(config.server.proxyIdleTimeout),
  proxySocketTimeout: Number(config.server.proxySocketTimeout)
});
const serveStatic = require('serve-static')(
  path.join(__dirname, '../static')
);

function getProxyIdFromSubdomain(request) {
  return tld.getSubdomain(request.headers.host);
}

function getPublicUrlForProxy(proxy) {
  return [
    'http://',
    proxy.getProxyId(),
    '.',
    config.server.serverHost,
    ':',
    config.server.serverPort
  ].join('');
}

function isNewProxyRequest(request) {
  let parsedUrl = url.parse(request.url);
  let queryParams = parsedUrl.query ? qs.parse(parsedUrl.query) : null

  return [
    !!(queryParams && queryParams.id),
    queryParams ? queryParams.id : null
  ];
}

function createProxyById(requestedId, response) {
  server.addProxy(requestedId, function(err, proxy) {
    if (err) {
      response.writeHead(400, {
        'Content-Type': 'application/json'
      });
      response.end(JSON.stringify({ error: err.message }));
      return;
    }

    response.writeHead(201, {
      'Content-Type': 'application/json'
    });
    response.end(JSON.stringify({
      publicUrl: getPublicUrlForProxy(proxy),
      tunnelPort: proxy.getProxyPort(),
      tunnelHost: config.server.serverHost
    }));
  })
}

function handleServerRequest(request, response) {
  let proxyId = getProxyIdFromSubdomain(request);
  let [isProxyRequest, requestedId] = isNewProxyRequest(request);

  if (proxyId) {
    server.routeHttpRequest(proxyId, request, response, () => null);
  } else if (isProxyRequest) {
    createProxyById(requestedId, response);
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

const webServer = http.createServer();

webServer.on('request', handleServerRequest)
webServer.on('upgrade', handleServerUpgrade)

webServer.listen(Number(config.server.serverPort), function() {
  logger.info('diglet server running on port %s', config.server.serverPort);
});
