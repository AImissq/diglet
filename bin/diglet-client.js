#!/usr/bin/env node

'use strict';

const http = require('http');
const diglet = require('..');
const config = require('./diglet-config');
const client = config.client;
const port = process.argv[2];
const uri = `http://${client.remoteAddress}:${client.remotePort}`;

function getTunnelUri(callback) {
  console.info(`establishing tunnel with: ${serverUri}...`);

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
        return callback(new Error(body.error));
      }
      callback(info);
      console.info(`your tunnel address is: ${info.publicUrl}`);
    }

    res.on('data', (data) => body += data.toString());
    res.on('end', handleEnd);
  });

  request.on('error', (err) => console.error(err.message)).end();
}

function establishTunnel(rHost, rPort, callback) {
  const tunnel = new diglet.Tunnel({
    localAddress: config.client.localAddress,
    localPort: port ? Number(port) : Number(config.client.localPort),
    remoteAddress: rHost,
    remotePort: rPort,
    maxConnections: Number(config.client.maxConnections)
  });

  tunnel.open();
}

getTunnelUri((info) => establishTunnel(info.tunnelHost, info.tunnelPort));
