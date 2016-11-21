'use strict';

const {expect} = require('chai');
const http = require('http');
const ws = require('ws');
const diglet = require('..');
const sinon = require('sinon');

sinon.stub(console, 'info');
sinon.stub(console, 'warn');
sinon.stub(console, 'error');

describe('Diglet/E2E', function() {

  let httpServer, httpPort, wsServer, tunnelServer, tunnelPort;
  let digletServer = new diglet.Server();
  let digletTunnel, proxyPort;

  before(function(done) {
    tunnelServer = http.createServer();
    tunnelServer.on('request', (req, res) => {
      digletServer.routeHttpRequest('test', req, res, () => null);
    });
    tunnelServer.on('upgrade', (req, sock) => {
      digletServer.routeWebSocketConnection('test', req, sock, () => null);
    });
    httpServer = http.createServer((req, res) => res.end('hello world'));
    wsServer = new ws.Server({ server: httpServer });
    wsServer.on('connection', (socket) => {
      socket.on('message', (data) => socket.send(data));
    });
    tunnelServer.listen(0, () => {
      tunnelPort = tunnelServer.address().port;
      httpServer.listen(0, () => {
        httpPort = httpServer.address().port;
        digletServer.addProxy('test', (err, proxy) => {
          proxyPort = proxy.getProxyPort();
          digletTunnel = new diglet.Tunnel({
            localAddress: 'localhost',
            localPort: httpPort,
            remoteAddress: 'localhost',
            remotePort: proxyPort
          });
          digletTunnel.once('established', done).open();
        });
      });
    });
  });

  after(function(done) {
    httpServer.close();
    done();
  });

  describe('HTTP', function() {

    it('should tunnel the HTTP request', function(done) {
      http.get(`http://localhost:${tunnelPort}/`, (res) => {
        let result = '';
        res.on('data', (data) => result += data.toString());
        res.on('end', () => {
          expect(result).to.equal('hello world');
          done();
        });
      });
    });

  });

  describe('WS', function() {

    it('should tunnel the websocket connection', function(done) {
      let websocket = new ws(`ws://localhost:${tunnelPort}`);
      websocket.on('message', (data) => {
        expect(data).to.equal('hello world');
        done();
      });
      websocket.on('open', () => {
        websocket.send('hello world');
      });
    });

  });

});
