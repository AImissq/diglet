'use strict';

const proxyquire = require('proxyquire');
const sinon = require('sinon');
const expect = require('chai').expect;
const Tunnel = require('../lib/tunnel');
const {EventEmitter} = require('events');

describe('Tunnel', function() {

  describe('@constructor', function() {

    it('should use the default options', function() {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      expect(tunnel._opts.maxConnections).to.equal(10);
    });

    it('should use the supplied options', function() {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337,
        maxConnections: 6
      });
      expect(tunnel._opts.maxConnections).to.equal(6);
    });

  });

  describe('#open', function() {

    it('should open 10 remote connections', function() {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const _createRemoteConnection = sinon.stub(
        tunnel,
        '_createRemoteConnection'
      );
      tunnel.open();
      expect(_createRemoteConnection.callCount).to.equal(10);
    });

    it('should emit established and handle tunnel open', function(done) {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const _createRemoteConnection = sinon.stub(
        tunnel,
        '_createRemoteConnection'
      );
      const _handleTunnelOpen = sinon.stub(
        tunnel,
        '_handleTunnelOpen'
      );
      tunnel.on('established', () => {
        setImmediate(() => {
          expect(_handleTunnelOpen.called).to.equal(true);
          done();
        });
      });
      tunnel.open();
      setImmediate(() => tunnel.emit('open'));
    });

  });

  describe('#_handleTunnelOpen', function() {

    it('should increment tunnels opened', function() {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const socket = new EventEmitter();
      tunnel._handleTunnelOpen(socket);
      expect(tunnel._tunnelsOpened).to.equal(1);
    });

    it('should handle tunnel closed', function(done) {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const socket = new EventEmitter();
      tunnel._handleTunnelOpen(socket);
      socket.emit('close');
      setImmediate(() => {
        expect(tunnel._tunnelsOpened).to.equal(0);
        done();
      });
    });

    it('should handle all closed', function(done) {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const socket = new EventEmitter();
      socket.destroy = sinon.stub();
      tunnel._handleTunnelOpen(socket);
      tunnel.emit('close');
      setImmediate(() => {
        expect(socket.destroy.called).to.equal(true);
        done();
      });
    });

    it('should handle tunnel closed', function(done) {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const socket = new EventEmitter();
      tunnel._handleTunnelOpen(socket);
      socket.emit('close');
      setImmediate(() => {
        expect(tunnel._tunnelsOpened).to.equal(0);
        done();
      });
    });

  });

  describe('#_createRemoteConnection', function() {

    function createFakeSocket() {
      let sock = new EventEmitter();
      sock.setNoDelay = sinon.stub();
      sock.setKeepAlive = sinon.stub();
      return sock;
    }

    it('should connect and set options', function() {
      const socket = createFakeSocket();
      const connect = sinon.stub().returns(socket);
      const Tunnel = proxyquire('../lib/tunnel', {
        net: { connect: connect }
      });
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      tunnel._createRemoteConnection();
      expect(connect.called).to.equal(true);
      expect(socket.setKeepAlive.called).to.equal(true);
      expect(socket.setNoDelay.called).to.equal(true);
    });

    it('should create local connection', function(done) {
      const socket = createFakeSocket();
      const connect = sinon.stub().returns(socket);
      const Tunnel = proxyquire('../lib/tunnel', {
        net: { connect: connect }
      });
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const _createLocalConnection = sinon.stub(
        tunnel,
        '_createLocalConnection'
      );
      tunnel._createRemoteConnection();
      socket.emit('connect');
      setImmediate(() => {
        expect(_createLocalConnection.called).to.equal(true);
        done();
      });
    });

    it('should handle remote errors', function(done) {
      const socket = createFakeSocket();
      const connect = sinon.stub().returns(socket);
      const Tunnel = proxyquire('../lib/tunnel', {
        net: { connect: connect }
      });
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const _handleRemoteError = sinon.stub(
        tunnel,
        '_handleRemoteError'
      );
      tunnel._createRemoteConnection();
      socket.emit('error', new Error());
      setImmediate(() => {
        expect(_handleRemoteError.called).to.equal(true);
        done();
      });
    });

  });

  describe('#_createLocalConnection', function() {

    function createFakeSocket() {
      let sock = new EventEmitter();
      sock.destroy = sinon.stub();
      sock.pause = sinon.stub();
      sock.end = sinon.stub();
      return sock;
    }

    it('should create remote connection if it was destroyed', function() {
      const socket = createFakeSocket();
      const connect = sinon.stub().returns(socket);
      const Tunnel = proxyquire('../lib/tunnel', {
        net: { connect: connect }
      });
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const _createRemoteConnection = sinon.stub(
        tunnel,
        '_createRemoteConnection'
      );
      const remoteSock = createFakeSocket();
      remoteSock.destroyed = true;
      tunnel._createLocalConnection(remoteSock);
      expect(_createRemoteConnection.called).to.equal(true);
    });

    it('should reopen the tunnel on close', function(done) {
      const socket = createFakeSocket();
      const connect = sinon.stub().returns(socket);
      const Tunnel = proxyquire('../lib/tunnel', {
        net: { connect: connect }
      });
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const _createRemoteConnection = sinon.stub(
        tunnel,
        '_createRemoteConnection'
      );
      const remoteSock = createFakeSocket();
      tunnel._createLocalConnection(remoteSock);
      remoteSock.emit('close');
      setImmediate(() => {
        expect(socket.end.called).to.equal(true);
        expect(_createRemoteConnection.called).to.equal(true);
        done();
      });
    });

    it('should handle local errors', function(done) {
      const socket = createFakeSocket();
      const connect = sinon.stub().returns(socket);
      const Tunnel = proxyquire('../lib/tunnel', {
        net: { connect: connect }
      });
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const _handleLocalError = sinon.stub(tunnel, '_handleLocalError');
      const remoteSock = createFakeSocket();
      tunnel._createLocalConnection(remoteSock);
      socket.emit('error', new Error());
      setImmediate(() => {
        expect(_handleLocalError.called).to.equal(true);
        done();
      });
    });

   it('should handle local connection', function(done) {
      const socket = createFakeSocket();
      const connect = sinon.stub().returns(socket);
      const Tunnel = proxyquire('../lib/tunnel', {
        net: { connect: connect }
      });
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const _handleLocalOpen = sinon.stub(tunnel, '_handleLocalOpen');
      const remoteSock = createFakeSocket();
      tunnel._createLocalConnection(remoteSock);
      socket.emit('connect');
      setImmediate(() => {
        expect(_handleLocalOpen.called).to.equal(true);
        done();
      });
   });

  });

  describe('#_handleLocalError', function() {

    function createFakeSocket() {
      let sock = new EventEmitter();
      sock.end = sinon.stub();
      return sock;
    }

    it('should end both connections', function() {
      const local = createFakeSocket();
      const remote = createFakeSocket();
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      tunnel._handleLocalError(new Error(), local, remote);
      expect(local.end.called).to.equal(true);
      expect(remote.end.called).to.equal(true);
    });

    it('should retry local connection if refused', function() {
      const local = createFakeSocket();
      const clock = sinon.useFakeTimers();
      const remote = createFakeSocket();
      let error = new Error('connection refused');
      error.code = 'ECONNREFUSED';
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      const _createLocalConnection = sinon.stub(
        tunnel,
        '_createLocalConnection'
      );
      tunnel._handleLocalError(error, local, remote);
      clock.tick(1000);
      clock.restore();
      expect(local.end.called).to.equal(true);
      expect(_createLocalConnection.called).to.equal(true);
    });

  });

  describe('#_handleLocalOpen', function() {

    function createFakeSocket() {
      let sock = require('through')(function(data) {
        this.queue(data);
      });
      sinon.stub(sock, 'pipe', function(s) { return s; });
      return sock;
    }

    it('should setup the correct pipes', function() {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337,
        transform: require('through')(function(data) { this.queue(data) })
      });
      const local = createFakeSocket();
      const remote = createFakeSocket();
      tunnel._handleLocalOpen(local, remote);
      expect(remote.pipe.callCount).to.equal(1);
      expect(local.pipe.callCount).to.equal(1);
    });

  });

  describe('#_transformHeaders', function() {

    it('should only replace the host header', function(done) {
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      let result = '';
      const transform = tunnel._transformHeaders();
      transform.on('data', (data) => {
        result += data.toString();
      }).on('end', () => {
        expect(result).to.equal(
          '\r\nHost: 0.0.0.0\r\nContent-Type: application/json'
        );
        done();
      });
      setImmediate(() => {
        transform.write('\r\nHost: example.com');
        transform.write('\r\nContent-Type: application/json');
        transform.end();
      });
    });

  });

  describe('#_handleRemoteError', function() {

    function createFakeSocket() {
      let sock = new EventEmitter();
      sock.end = sinon.stub();
      sock.destroy = sinon.stub();
      return sock;
    }

    it('should end the connection', function() {
      const remote = createFakeSocket();
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      tunnel._handleRemoteError(remote, new Error());
      expect(remote.end.called).to.equal(true);
      expect(remote.destroy.called).to.equal(true);
    });

    it('should end the connection and emit error', function(done) {
      const remote = createFakeSocket();
      const tunnel = new Tunnel({
        remoteAddress: '0.0.0.0',
        remotePort: 1337,
        localAddress: '0.0.0.0',
        localPort: 1337
      });
      let error = new Error('connection refused');
      error.code = 'ECONNREFUSED';
      tunnel.on('error', () => done())
      tunnel._handleRemoteError(remote, error);
      expect(remote.end.called).to.equal(true);
      expect(remote.destroy.called).to.equal(true);
    });

  });

});
