#!/usr/bin/env node

'use strict';

const qs = require('querystring');
const url = require('url');
const http = require('http');
const diglet = require('..');
const path = require('path');
const motd = require('fs').readFileSync(path.join(__dirname, '../motd'));

const config = require('rc')('diglet', {
  serverHost: 'localhost',
  serverPort: 8080,
  proxyPortRange: {
    min: 12000,
    max: 12023
  },
  maxProxiesAllowed: 24,
  proxyMaxConnections: 10,
  proxyIdleTimeout: 5000
});

const server = new diglet.Server({
  proxyPortRange: config.proxyPortRange,
  maxProxiesAllowed: config.maxProxiesAllowed,
  proxyMaxConnections: config.proxyMaxConnections,
  proxyIdleTimeout: config.proxyIdleTimeout
});

function getProxyIdFromSubdomain(request) {
  var parsedUrl = url.parse('http://' + request.headers.host);
  var domainParts = parsedUrl.host.split('.' + config.serverHost);
  var proxyId = domainParts.length > 1 ? domainParts[0] : null;
  return proxyId;
}

http.createServer()
  .on('request', function(request, response) {
    console.info('received request: %s', request.url);

    let proxyId = getProxyIdFromSubdomain(request);

    if (proxyId) {
      return server.routeHttpRequest(
        proxyId,
        request,
        response,
        (result) => console.info('routed request to proxy? %s', result)
      );
    }

    let parsedUrl = url.parse(request.url);
    let queryParams = parsedUrl.query ? qs.parse(parsedUrl.query) : null

    if (queryParams && queryParams.id) {
      return server.addProxy(queryParams.id, function(err, proxy) {
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
          id: proxy.getProxyId(),
          port: proxy.getProxyPort()
        }));
      })
    }

    response.writeHead(200, {
      'Content-Type': 'text/plain'
    });
    response.end(motd);
  })
  .on('upgrade', function(request, socket) {
    console.info('received upgrade: %s', request.url);

    let proxyId = getProxyIdFromSubdomain(request);

    if (proxyId) {
      return server.routeWebSocketConnection(
        proxyId,
        request,
        socket
      );
    }

    socket.destroy();
  })
  .listen(config.serverPort, function() {
    console.info('diglet server running on port %s', config.serverPort);
  });
