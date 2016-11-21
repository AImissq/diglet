'use strict';

const proxyquire = require('proxyquire');
const sinon = require('sinon');
const expect = require('chai').expect;
const Server = require('../lib/server');
const {EventEmitter} = require('events');

describe('Server', function() {

  describe('@constructor', function() {

    it('should use the default options', function() {
      const server = new Server();
      expect(server._opts.proxyPortRange.min).to.equal(12000);
      expect(server._opts.proxyPortRange.max).to.equal(12023);
    });

    it('should use the given options', function() {
      const server = new Server({
        proxyPortRange: { min: 8000, max: 8003 }
      });
      expect(server._opts.proxyPortRange.min).to.equal(8000);
      expect(server._opts.proxyPortRange.max).to.equal(8003);
    });

  });

  describe('#addProxy', function() {

    it('should callback max proxies reached', function(done) {
      const server = new Server({ maxProxiesAllowed: 0 });
      server.addProxy('test', (err) => {
        expect(err.message).to.equal('Maximum proxies reached');
        done();
      });
    });

    it('should callback id in use', function(done) {
      const server = new Server();
      server._proxies.test = true;
      server.addProxy('test', (err) => {
        expect(err.message).to.equal('Proxy ID is already in use');
        done();
      });
    });

    it('should callback err if no available port', function(done) {
      const server = new Server();
      const _getAvailablePort = sinon.stub(
        server,
        'getAvailablePort'
      ).callsArgWith(0, new Error('No port available'));
      server.addProxy('test', (err) => {
        expect(err.message).to.equal('No port available');
        done();
      });
    });

    it('should callback err if proxy cannot open', function(done) {
      const proxy = new EventEmitter();
      proxy.open = sinon.stub().callsArgWith(0, new Error('Failed'));
      const Server = proxyquire('../lib/server', {
        './proxy': sinon.stub().returns(proxy)
      });
      const server = new Server();
      const _getAvailablePort = sinon.stub(
        server,
        'getAvailablePort'
      ).callsArgWith(0, null, 0);
      server.addProxy('test', (err) => {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should callback err if no available port', function(done) {
      const proxy = new EventEmitter();
      proxy.open = sinon.stub().callsArgWith(0);
      const Server = proxyquire('../lib/server', {
        './proxy': sinon.stub().returns(proxy)
      });
      const server = new Server();
      const _getAvailablePort = sinon.stub(
        server,
        'getAvailablePort'
      ).callsArgWith(0, null, 0);
      server.addProxy('test', () => {
        proxy.emit('end');
        setImmediate(() => {
          expect(server._proxies.test).to.equal(undefined);
          done();
        });
      });
    });

  });

  describe('#getProxyById', function() {

    it('should return the proxy at _proxies[id]', function() {
      const server = new Server();
      server._proxies.test = true;
      expect(server.getProxyById('test')).to.equal(true);
    });

    it('should return null', function() {
      const server = new Server();
      expect(server.getProxyById('test')).to.equal(null);
    });

  });

  describe('#routeHttpRequest', function() {



  });

  describe('#routeWebSocketConnection', function() {



  });

  describe('#getAvailablePort', function() {

    it('should return the first available port', function(done) {
      const Server = proxyquire('../lib/server', {
        portastic: {
          find: sinon.stub().returns(new Promise((resolve) => resolve([8000])))
        }
      });
      const server = new Server();
      server.getAvailablePort((err, port) => {
        expect(port).to.equal(8000);
        done();
      });
    });

    it('should callback error', function(done) {
      const Server = proxyquire('../lib/server', {
        portastic: {
          find: sinon.stub().returns(
            new Promise((resolve, reject) => reject(new Error('Failed')))
          )
        }
      });
      const server = new Server();
      server.getAvailablePort((err) => {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });


  describe('Server#recreateWebSocketHeaders', function() {

    it('should recreate the headers', function() {
      const headers = 'GET /some/path HTTP/1.1' +
        '\r\nUser-Agent: Diglet Tests' +
        '\r\nHost: localhost' +
        '\r\nContent-Type: application/json' +
        '\r\n\r\n';
      expect(Server.recreateWebSocketHeaders({
        method: 'GET',
        url: '/some/path',
        httpVersion: '1.1',
        rawHeaders: [
          'User-Agent',
          'Diglet Tests',
          'Host',
          'localhost',
          'Content-Type',
          'application/json'
        ]
      })).to.equal(headers);
    });

  });

});
