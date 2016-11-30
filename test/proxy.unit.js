'use strict';

const sinon = require('sinon');
const expect = require('chai').expect;
const bunyan = require('bunyan');
const Proxy = require('../lib/proxy');
const {EventEmitter} = require('events');

describe('Proxy', function() {

  describe('@constructor', function() {

    it('should use the default options', function() {
      const proxy = new Proxy();
      expect(proxy._opts.maxConnections).to.equal(10);
      expect(proxy._opts.proxyPort).to.equal(0);
      expect(typeof proxy._opts.proxyId).to.equal('string');
      expect(proxy._opts.idleTimeout).to.equal(5000);
    });

    it('should use the supplied options', function() {
      const logger = bunyan.createLogger({ name: 'diglet-proxy-test' });
      const proxy = new Proxy({
        maxConnections: 12,
        proxyPort: 12000,
        proxyId: 'test',
        idleTimeout: 2000,
        logger: logger
      });
      expect(proxy._opts.maxConnections).to.equal(12);
      expect(proxy._opts.proxyPort).to.equal(12000);
      expect(proxy._opts.proxyId).to.equal('test');
      expect(proxy._opts.idleTimeout).to.equal(2000);
      expect(proxy._logger).to.equal(logger);
    });

  });

  describe('#open', function() {

    it('should callback error if already open', function(done) {
      const proxy = new Proxy();
      proxy._isOpened = true;
      proxy.open((err) => {
        expect(err.message).to.equal('Proxy is already opened');
        done();
      });
    });

    it('should clean connections on close', function(done) {
      const proxy = new Proxy();
      const _cleanConnections = sinon.stub(proxy, '_cleanConnections');
      proxy.open(() => {
        proxy._server.emit('close');
        setImmediate(() => {
          expect(_cleanConnections.called).to.equal(true);
          done();
        });
      });
    });

    it('should handle incoming connections', function(done) {
      const proxy = new Proxy();
      const _handleConnection = sinon.stub(proxy, '_handleConnection');
      proxy.open(() => {
        proxy._server.emit('connection');
        setImmediate(() => {
          expect(_handleConnection.called).to.equal(true);
          done();
        });
      });
    });

    it('should handle errors', function(done) {
      const proxy = new Proxy();
      const _handleProxyError = sinon.stub(proxy, '_handleProxyError');
      proxy.open(() => {
        proxy._server.emit('error');
        setImmediate(() => {
          expect(_handleProxyError.called).to.equal(true);
          done();
        });
      });
    });
  });

  describe('#getProxyPort', function() {

    it('should return the config port if server is not open', function() {
      const proxy = new Proxy();
      const _address = sinon.stub(proxy._server, 'address').returns(null);
      expect(proxy.getProxyPort()).to.equal(0);
    });

    it('should return the listening port if server is open', function() {
      const proxy = new Proxy();
      const _address = sinon.stub(proxy._server, 'address').returns({
        address: 'localhost',
        port: 12000
      });
      expect(proxy.getProxyPort()).to.equal(12000);
    });

  });

  describe('#getProxyId', function() {

    it('should return the proxy id', function() {
      const proxy = new Proxy({ proxyId: 'test' });
      expect(proxy.getProxyId()).to.equal('test');
    });

  });

  describe('#getSocket', function() {

    it('should queue the handler if no sockets available', function(done) {
      const proxy = new Proxy();
      const _push = sinon.stub(proxy._waitingHandlers, 'push', () => done());
      proxy.getSocket(() => null);
    });

    it('should call the socket handler', function(done) {
      const proxy = new Proxy();
      const _socket = {};
      const _shift = sinon.stub(
        proxy._connectedSockets,
        'shift'
      ).returns(_socket);
      proxy.getSocket((socket, addBackToPool) => {
        expect(socket).to.equal(_socket);
        done();
      });
    });

    it('should call the socket handler and add back to pool', function(done) {
      const proxy = new Proxy();
      const _socket = {};
      const _processNextWaitingHandler = sinon.stub(
        proxy,
        '_processNextWaitingHandler'
      );
      const _shift = sinon.stub(
        proxy._connectedSockets,
        'shift'
      ).returns(_socket);
      proxy.getSocket((socket, addBackToPool) => {
        expect(socket).to.equal(_socket);
        addBackToPool();
        expect(proxy._connectedSockets).to.have.lengthOf(1);
        expect(_processNextWaitingHandler.called).to.equal(true);
        done();
      });
    });

    it('should get another socket if destroyed', function(done) {
      const proxy = new Proxy({ idleTimeout: 10 });
      const _socket1 = { destroyed: true };
      const _socket2 = { destroyed: false };
      const _close = sinon.stub(proxy._server, 'close', () => {
        proxy._server.emit('close')
      });
      proxy._connectedSockets = [_socket1, _socket2];
      proxy.getSocket((socket, addBackToPool) => {
        expect(socket).to.equal(_socket2);
        addBackToPool();
        expect(proxy._connectedSockets).to.have.lengthOf(1);
        done();
      });
    });

    it('should cleanup if all sockets are destroyed', function(done) {
      const proxy = new Proxy({ idleTimeout: 10 });
      const _socket1 = { destroyed: true };
      const _socket2 = { destroyed: true };
      const _close = sinon.stub(proxy._server, 'close', () => {
        proxy._server.emit('close')
      });
      proxy._connectedSockets = [_socket1, _socket2];
      proxy.getSocket((socket, addBackToPool) => {
        expect(socket).to.equal(null);
        expect(proxy._connectedSockets).to.have.lengthOf(0);
        done();
      });
    });
  });

  describe('#_processNextWaitingHandler', function() {

    it('should call get a socket for the handler', function() {
      const proxy = new Proxy();
      const _getSocket = sinon.stub(proxy, 'getSocket');
      proxy._waitingHandlers.push(() => null);
      proxy._processNextWaitingHandler();
      expect(_getSocket.called).to.equal(true);
    });

    it('should not get a socket if no waiting handler', function() {
      const proxy = new Proxy();
      const _getSocket = sinon.stub(proxy, 'getSocket');
      proxy._processNextWaitingHandler();
      expect(_getSocket.called).to.equal(false);
    });

  });

  describe('#_cleanConnections', function() {

    it('should call all of the waiting handlers', function(done) {
      const proxy = new Proxy();
      proxy._waitingHandlers.push((arg) => {
        expect(arg).to.equal(null);
        done();
      });
      proxy._cleanConnections();
    });

  });

  describe('#_handleConnection', function() {

    it('should end the socket if max connections', function() {
      const proxy = new Proxy({ maxConnections: 1 });
      proxy._connectedSockets.push({});
      const sock = { end: sinon.stub() };
      proxy._handleConnection(sock);
      expect(sock.end.called).to.equal(true);
    });

    it('should handle socket close', function(done) {
      const proxy = new Proxy();
      const sock = new EventEmitter();
      const _handleSocketClose = sinon.stub(
        proxy,
        '_handleSocketClose'
      );
      const _processNextWaitingHandler = sinon.stub(
        proxy,
        '_processNextWaitingHandler'
      );
      const _push = sinon.stub(
        proxy._connectedSockets,
        'push'
      );
      proxy._handleConnection(sock);
      sock.emit('close');
      setImmediate(() => {
        expect(_processNextWaitingHandler.called).to.equal(true);
        expect(_push.called).to.equal(true);
        expect(_handleSocketClose.called).to.equal(true);
        done();
      });
    });

    it('should handle socket error', function(done) {
      const proxy = new Proxy();
      const sock = new EventEmitter();
      const _handleSocketError = sinon.stub(
        proxy,
        '_handleSocketError'
      );
      const _processNextWaitingHandler = sinon.stub(
        proxy,
        '_processNextWaitingHandler'
      );
      const _push = sinon.stub(
        proxy._connectedSockets,
        'push'
      );
      proxy._handleConnection(sock);
      sock.emit('error');
      setImmediate(() => {
        expect(_processNextWaitingHandler.called).to.equal(true);
        expect(_push.called).to.equal(true);
        expect(_handleSocketError.called).to.equal(true);
        done();
      });
    });

  });

  describe('#_handleSocketError', function() {

    it('should destroy the socket', function() {
      const proxy = new Proxy();
      const socket = { destroy: sinon.stub() };
      proxy._handleSocketError(socket, new Error());
      expect(socket.destroy.called).to.equal(true);
    });

  });

  describe('#_handleSocketClose', function() {

    it('should splice the socket and set destroy timeout', function() {
      const proxy = new Proxy();
      const socket = {};
      proxy._connectedSockets.push(socket);
      const _setDestroyTimeout = sinon.stub(proxy, '_setDestroyTimeout');
      proxy._handleSocketClose(socket);
      expect(proxy._connectedSockets).to.have.lengthOf(0);
      expect(_setDestroyTimeout.called).to.equal(true);
    });

  });

  describe('#_handleProxyError', function() {

    it('should log the error', function() {
      const proxy = new Proxy({ logger: { error: sinon.stub() } });
      proxy._handleProxyError(new Error());
      expect(proxy._logger.error.called).to.equal(true);
    });

  });

  describe('#_setDestroyTimeout', function() {

    it('should call destroy after idleTimeout', function(done) {
      const proxy = new Proxy({ idleTimeout: 10 });
      const _destroy = sinon.stub(proxy, '_destroy');
      proxy._setDestroyTimeout();
      setTimeout(() => {
        expect(_destroy.called).to.equal(true);
        done();
      }, 12);
    });

  });

  describe('#_destroy', function() {

    it('should close the server', function() {
      const proxy = new Proxy();
      const _close = sinon.stub(proxy._server, 'close');
      proxy._destroy();
      expect(_close.called).to.equal(true);
    });

    it('should clean connections if server close throws', function() {
      const proxy = new Proxy();
      const _cleanConnections = sinon.stub(proxy, '_cleanConnections');
      const _close = sinon.stub(proxy._server, 'close').throws(new Error());
      proxy._destroy();
      expect(_cleanConnections.called).to.equal(true);
    });

  });

});
