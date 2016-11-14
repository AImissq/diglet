'use strict';

const assert = require('assert');
const net = require('net');
const {EventEmitter} = require('events');

/** Manages a group of connections that compose a tunnel */
class Tunnel extends EventEmitter {

  /**
   * Create a tunnel
   * @param {Object} options
   * @param {String} options.localAddress - The local IP or hostname to expose
   * @param {Number} options.localPort - The local port to expose
   * @param {String} options.remoteAddress - The remote tunnel address
   * @param {Number} options.remotePort - The remote tunnel port
   * @param {Number} [options.maxConnections=10] - Total connections to maintain
   * @param {Object} [options.logger=console] - Logger to use
   */
  constructor(options = {}) {
    super();
    this.setMaxListeners(0);
    options.maxConnections = options.maxConnections || 10;
    options.logger = options.logger || console;
    this._opts = this._checkOptions(options);
    this._logger = this._opts.logger;
    this._tunnelsOpened = 0;
  }

  /**
   * Validates options given to constructor
   * @private
   */
  _checkOptions(o) {
    assert(typeof o.localAddress === 'string', 'Invalid localAddress');
    assert(typeof o.localPort === 'number', 'Invalid localPort');
    assert(typeof o.remoteAddress === 'string', 'Invalid remoteAddress');
    assert(typeof o.remotePort === 'number', 'Invalid remotePort');
    assert(typeof o.maxConnections === 'number', 'Invalid maxConnections');
    return o;
  }

  /**
   * Establishes the tunnel connection
   */
  open() {
    const self = this;

    self.once('open', () => self.emit('established'));
    self.on('open', (tunnel) => self._handleTunnelOpen(tunnel));

    for (let i = 0; i < self._tunnelsOpened.length; i++) {
      self._createRemoteConnection();
    }
  }

  /**
   * Sets up listeners and tracks status of a given tunnel
   * @private
   */
  _handleTunnelOpen(tunnelConnection) {
    const self = this;
    self._tunnelsOpened++;

    function _handleClose() {
      tunnelConnection.destroy();
    }

    self.once('close', _handleClose);
    tunnelConnection.once(
      'close',
      () => self.removeListener('close', _handleClose)
    );
  }

  /**
   * Connects out to the remote proxy
   * @private
   */
  _createRemoteConnection() {
    const self = this;

    var remoteConnection = net.connect({
      host: self._opts.remoteAddress,
      port: self._opts.remotePort
    });

    remoteConnection.setKeepAlive(true);
    remoteConnection.on('error', (err) => {
      self._handleRemoteError(remoteConnection, err)
    });
    remoteConnection.once('connect', () => {
      self.emit('open', remoteConnection);
      self._createLocalConnection(remoteConnection)
    });
  }

  /**
   * Opens the connection to the local server
   * @private
   */
  _createLocalConnection(remoteConnection) {
    const self = this;

    if (remoteConnection.destroyed) {
      return self._createRemoteConnection();
    }

    var localConnection = net.connect({
      host: self._opts.localAddress,
      port: self._opts.localPort
    });

    remoteConnection.pause();
    remoteConnection.once(
      'close',
      () => localConnection.end()
    );
    localConnection.once(
      'error',
      (err) => self._handleLocalError(err, localConnection, remoteConnection)
    );
    localConnection.once(
      'connect',
      () => self._handleLocalOpen(localConnection, remoteConnection)
    );
  }

  /**
   * Handles errors from the local server
   * @private
   */
  _handleLocalError(err, localConnection, remoteConnection) {
    localConnection.end();
    remoteConnection.removeAllListeners('close');

    if (err.code !== 'ECONNREFUSED') {
      return remoteConnection.end();
    }

    setTimeout(() => self._createLocalConnection(remoteConnection), 1000);
  }

  /**
   * Connects the local and remote sockets to create tunnel
   * @private
   */
  _handleLocalOpen(localConnection, remoteConnection) {
    const self = this;
    var incomingStream = remoteConnection;

    if (self._opts.localAddress !== 'localhost') {
      incomingStream = remoteConnection.pipe(new HeaderTransformer({
        host: self._opts.localAddress
      }));
    }

    incomingStream.pipe(localConnection).pipe(remoteConnection);
  }

  /**
   * Handles errors from the remote proxy
   * @private
   */
  _handleRemoteError(remoteConnection, error) {
    if (err.code === 'ECONNREFUSED') {
      this.emit('error', new Error('Tunnel connection refused'));
    }

    remoteConnection.end();
  }

}

module.exports = Tunnel;
