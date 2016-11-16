#!/usr/bin/env node

'use strict';

const http = require('http');
const diglet = require('..');
const config = require('./_config');
const port = process.argv[2];

function getTunnelUri(callback) {
  var request = http.request({
    host: config.client.remoteAddress,
    port: Number(config.client.remotePort),
    path: '/?id=' + require('crypto').randomBytes(6).toString('hex'),
    method: 'GET'
  }, (res) => {
    let body = '';

    function handleEnd() {
      body = JSON.parse(body);
      if (res.statusCode !== 201) {
        return callback(new Error(body.error));
      }
      callback(null, body);
    }

    res.on('data', (data) => body += data.toString());
    res.on('end', handleEnd);
  });

  request.on('error', callback).end();
}

function getMessageOfTheDay(callback) {
  var request = http.request({
    host: config.client.remoteAddress,
    port: Number(config.client.remotePort)
  }, function(res) {
    if (res.statusCode !== 200) {
      return callback(new Error(
        `Failed to get MOTD.
         Is ${config.client.remoteAddress} a valid diglet server?`
      ));
    }

    let motd = '';

    res.on('data', (data) => motd += data);
    res.on('end', () => callback(null, motd));
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

  tunnel.once('established', () => callback()).open();
}

var serverUri = [
  'http://'
  config.client.remoteAddress,
  ':',
  config.config.remotePort
].join('');

console.info(
  `Establishing tunnel with: ${serverUri}...`
);
getTunnelUri((err, info) => {
  if (err) {
    return console.error(err.message);
  }

  establishTunnel(info.tunnelHost, info.tunnelPort, (err) => {
    if (err) {
      return console.error(err.message);
    }

    getMessageOfTheDay((err, motd) => {
      if (err) {
        return console.error(err.message);
      }

      console.info(motd);
      console.info('');
      console.info(`Your tunnel address is: ${info.publicUrl}`);
    });
  });
});
