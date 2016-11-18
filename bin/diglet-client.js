#!/usr/bin/env node

'use strict';

const colors = require('colors/safe');
const http = require('http');
const bunyan = require('bunyan');
const diglet = require('..');
const config = require('./diglet-config');
const client = config.client;
const port = process.argv[2];
const uri = `http://${client.remoteAddress}:${client.remotePort}`;
const logger = bunyan.createLogger({ name: 'diglet-client' });

function getTunnelUri(callback) {
  const request = http.request({
    host: config.client.remoteAddress,
    port: Number(config.client.remotePort),
    path: '/?id=' + config.client.requestProxyId,
    method: 'GET'
  }, (res) => {
    let body = '';

    function handleEnd() {
      body = JSON.parse(body);
      if (res.statusCode !== 201) {
        return logger.error(body.error);
      }
      console.info(colors.bold('tunnel address ='), body.publicUrl);
      console.info('');
      callback(body);
    }

    res.on('data', (data) => body += data.toString());
    res.on('end', handleEnd);
  });

  request.on('error', (err) => logger.error(err.message)).end();
}

function establishTunnel(rHost, rPort, callback) {
  const tunnel = new diglet.Tunnel({
    localAddress: config.client.localAddress,
    localPort: port ? Number(port) : Number(config.client.localPort),
    remoteAddress: rHost,
    remotePort: rPort,
    maxConnections: Number(config.client.maxConnections),
    logger: logger
  });

  tunnel.open();
}

getTunnelUri((info) => establishTunnel(info.tunnelHost, info.tunnelPort));
