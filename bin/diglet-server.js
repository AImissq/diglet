#!/usr/bin/env node

'use strict';

const qs = require('querystring');
const url = require('url');
const http = require('http');
const diglet = require('..');
const path = require('path');
const motd = require('fs').readFileSync(path.join(__dirname, '../motd'));

const config = require('./_config');
const server = new diglet.Server({
  proxyPortRange: {
    min: Number(config.server.proxyPortRange.min),
    max: Number(config.server.proxyPortRange.max)
  },
  maxProxiesAllowed: Number(config.server.maxProxiesAllowed),
  proxyMaxConnections: Number(config.server.proxyMaxConnections),
  proxyIdleTimeout: Number(config.server.proxyIdleTimeout)
});

function getProxyIdFromSubdomain(request) {
  var parsedUrl = url.parse('http://' + request.headers.host);
  var domainParts = parsedUrl.host.split('.' + config.server.serverHost);
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

        let publicUrl = [
          'http://',
          proxy.getProxyId(),
          '.',
          config.server.serverHost,
          ':',
          config.server.serverPort
        ];

        response.writeHead(201, {
          'Content-Type': 'application/json'
        });
        response.end(JSON.stringify({
          publicUrl: publicUrl.join(''),
          tunnelPort: proxy.getProxyPort(),
          tunnelHost: config.server.serverHost
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
  .listen(Number(config.server.serverPort), function() {
    console.info('diglet server running on port %s', config.server.serverPort);
  });
