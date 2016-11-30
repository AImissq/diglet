'use strict';

const through = require('through');
const assert = require('assert');
const net = require('net');
const {createLogger} = require('bunyan');
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
   * @param {stream.Transform} [options.transform] - Transform stream for
   * manipulating incoming proxied stream
   */
  constructor(options = {}) {
    super();
    this.setMaxListeners(0);
    options.maxConnections = options.maxConnections || 10;
    options.logger = options.logger || createLogger({ name: 'diglet' });
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

    self._logger.info(
      'establishing %s connections to %s:%s',
      self._opts.maxConnections,
      self._opts.remoteAddress,
      self._opts.remotePort
    );
    self.once('open', () => self.emit('established'));
    self.on('open', (tunnel) => self._handleTunnelOpen(tunnel));

    for (let i = 0; i < self._opts.maxConnections; i++) {
      self._logger.debug('creating remote connection %s', i + 1);
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
    self._logger.debug('a tunnel connection was opened');

    function _handleClose() {
      self._logger.warn('all tunnel connections were closed');
      tunnelConnection.destroy();
    }

    function _handleTunnelClose() {
      self._logger.debug('a tunnel connection was closed');
      self._tunnelsOpened--;
      self.removeListener('close', _handleClose);
    }

    self.once('close', _handleClose);
    tunnelConnection.once('close', _handleTunnelClose);
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
    remoteConnection.setNoDelay(true);
    remoteConnection.on('error', (err) => {
      self._logger.error('error with remote connection: %s', err.message);
      self._handleRemoteError(remoteConnection, err)
    });
    remoteConnection.once('connect', () => {
      self._logger.debug('remote connection established');
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

    self._logger.debug('creating local connection...');

    if (remoteConnection.destroyed) {
      self._logger.warn('remote connection was destroyed, reconnecting...');
      return self._createRemoteConnection();
    }

    var localConnection = net.connect({
      host: self._opts.localAddress,
      port: self._opts.localPort
    });

    remoteConnection.pause();
    remoteConnection.once('close', () => {
      self._logger.debug('remote connection closed, ending local connection');
      localConnection.end();
      self._logger.debug('reopening remote tunnel connection');
      self._createRemoteConnection();
    });
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
    const self = this;

    localConnection.end();
    remoteConnection.removeAllListeners('close');
    self._logger.error('local connection encountered an error: %s', err.message);

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
    let stream = remoteConnection;

    self._logger.debug('local connection opened');

    if (self._opts.localAddress !== 'localhost') {
      stream = remoteConnection.pipe(self._transformHeaders());
    }

    if (self._opts.transform) {
      stream = stream.pipe(self._opts.transform);
    }

    self._logger.debug('connecting local and remote connections');
    stream.pipe(localConnection).pipe(remoteConnection);
  }

  /**
   * Transforms the host header
   * @private
   */
  _transformHeaders() {
    const self = this;
    var replaced = false;

    return through(function(chunk) {
      if (replaced) {
        return this.queue(chunk);
      }

      chunk = chunk.toString();

      this.queue(chunk.replace(/(\r\nHost: )\S+/, function(match, $1) {
        replaced = true;
        return $1 + self._opts.localAddress;
      }));
    });
  }

  /**
   * Handles errors from the remote proxy
   * @private
   */
  _handleRemoteError(remoteConnection, error) {
    const self = this;

    if (error.code === 'ECONNREFUSED') {
      this.emit('error', new Error('Tunnel connection refused'));
    }

    self._logger.error(
      'remote connection encountered error: %s',
      error.message
    );
    remoteConnection.end();
    remoteConnection.destroy();
  }

}

module.exports = Tunnel;
