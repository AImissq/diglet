'use strict';

const assert = require('assert');
const net = require('net');
const {createLogger} = require('bunyan');
const {EventEmitter} = require('events');
const {randomBytes} = require('crypto');

/**
 * Sets up a proxy server for use by the remote tunnel server
 */
class Proxy extends EventEmitter {

  /**
   * Creates a proxy for NAT'ed hosts to connect to
   * @param {Object} options
   * @param {Number} [options.idleTimeout=5000] - Destroy proxy after no activity
   * @param {String} [options.proxyId] - Unique ID for this proxy
   * @param {Number} [options.proxyPort=0] - TCP port to listen on
   * @param {Object} [options.maxConnections=10] - Maximum inbound connections
   * @param {Object} [options.logger=console] - Logger to use
   */
  constructor(options = {}) {
    super();
    options.maxConnections = options.maxConnections || 10;
    options.proxyPort = options.proxyPort || 0;
    options.proxyId = options.proxyId || randomBytes(20).toString('hex');
    options.idleTimeout = options.idleTimeout || 5000;
    options.logger = options.logger || createLogger({ name: 'diglet' });
    this._opts = this._checkOptions(options);
    this._server = net.createServer();
    this._waitingHandlers = [];
    this._connectedSockets = [];
    this._logger = this._opts.logger || console;

    this._server.on('close', () => this._cleanConnections());
    this._server.on('connection', (sock) => this._handleConnection(sock));
    this._server.on('error', (err) => this._handleProxyError(err));
  }

  /**
   * Validates options given to constructor
   * @private
   */
  _checkOptions(o) {
    assert(typeof o.idleTimeout === 'number', 'Invalid idleTimeout');
    assert(typeof o.proxyPort === 'number', 'Invalid proxyPort');
    assert(typeof o.maxConnections === 'number', 'Invalid maxConnections');
    assert(typeof o.proxyId === 'string', 'Invalid proxyId');
    return o;
  }

  /**
   * Opens the proxy for use by tunnel clients
   * @param {Proxy~openCallback} openCallback
   */
  open(openCallback) {
    const self = this;

    if (self._isOpened) {
      self._logger.error('cannot open proxy which is already open');
      return openCallback(new Error('Proxy is already opened'));
    }

    self._isOpened = true;

    self._logger.info('opening proxy tunnel for client to connect');
    self._server.listen(self._opts.proxyPort, () => openCallback());
    self._setDestroyTimeout();
  }
  /**
   * @callback Proxy~openCallback
   */

  /**
   * Returns the defined proxy port or the one that is bound
   * @returns {Number} proxyPort
   */
  getProxyPort() {
    return this._server.address() ?
      this._server.address().port :
      this._opts.proxyPort;
  }

  /**
   * Returns the proxy ID
   * @returns {String}
   */
  getProxyId() {
    return this._opts.proxyId;
  }

  /**
   * Returns a connected socket off the list to process a request and places it
   * back when the handler is finished
   * @param {Proxy~socketHandler} socketHandler
   */
  getSocket(socketHandler) {
    const self = this;
    const socket = self._connectedSockets.shift();

    self._logger.debug('getting socket from proxy tunnel');

    if (!socket) {
      self._logger.warn('no socket available, queuing handler');
      return self._waitingHandlers.push(socketHandler);
    } else if (socket.destroyed) {
      self._logger.warn('got destroyed socket, getting another...');
      self._handleSocketClose(socket);
      return self.getSocket(socketHandler);
    }

    self._logger.debug('got tunnel socket, passing to handler');
    socketHandler(socket, () => {
      self._logger.debug('socket handler finished, adding back to pool');

      if (!socket.destroyed) {
        self._connectedSockets.push(socket);
      }

      if (self._connectedSockets.length !== 0) {
        self._processNextWaitingHandler();
      }
    });
  }
  /**
   * @callback Proxy~socketHandler
   * @param {net.Socket} socket - The socket back to the client
   * @param {Proxy~socketHandlerCallback}
   */
  /**
   * @callback Proxy~socketHandlerCallback
   * @param {Error|null} error - Possible error during handling
   */

  /**
   * Pulls the next waiting hanlder off the list and processes it
   * @private
   */
  _processNextWaitingHandler() {
    const self = this;
    const waitingHandler = self._waitingHandlers.shift();

    if (waitingHandler) {
      self.getSocket(waitingHandler);
    }
  }

  /**
   * Cleans up waiting and open connections
   * @private
   */
  _cleanConnections() {
    const self = this;

    self._logger.debug('cleaning connection pool');
    clearTimeout(self._connectionTimeout);
    self._waitingHandlers.forEach((handler) => handler(null));
    self._connectedSockets.forEach((socket) => socket.destroy());

    /**
     * Triggered when the proxy is dead
     * @event Proxy#end
     */
    self.emit('end');
  }

  /**
   * Processes incoming connections from tunnel client
   * @private
   */
  _handleConnection(socket) {
    const self = this;

    self._logger.debug('handling incoming tunnel connection');

    if (self._connectedSockets.length >= self._opts.maxConnections) {
      self._logger.warn('maximum tunnel sockets enhausted');
      return socket.end();
    }

    self._logger.debug('establishing tunnel connection to client');
    clearTimeout(self._connectionTimeout);
    socket.on('close', () => self._handleSocketClose(socket));
    socket.on('error', (err) => self._handleSocketError(socket, err));
    self._connectedSockets.push(socket);
    self._processNextWaitingHandler();
  }

  /**
   * Handles a socket error
   * @private
   */
  _handleSocketError(socket, err) {
    const self = this;

    self._logger.error('socket encountered an error: %s', err.message);
    self._cleanConnections();
    socket.destroy();
  }

  /**
   * Handles a closed tunnel socket
   * @private
   */
  _handleSocketClose(socket) {
    const self = this;
    const socketIndex = self._connectedSockets.indexOf(socket);

    self._logger.debug('tunnel socket closed');

    if (socketIndex !== -1) {
      self._connectedSockets.splice(socketIndex, 1);
    }

    if (self._connectedSockets.length === 0) {
      self._setDestroyTimeout();
    }
  }

  /**
   * Handles errors from the proxy server
   * @private
   */
  _handleProxyError(err) {
    const self = this;

    self._logger.error('proxy server encountered an error: %s', err.message);
  }

  /**
   * Sets a timeout to destroy proxy
   * @private
   */
  _setDestroyTimeout() {
    const self = this;

    clearTimeout(self._connectionTimeout);
    self._connectionTimeout = setTimeout(
      () => self._destroy(),
      self._opts.idleTimeout
    );
  }

  /**
   * Destroys the proxy server and connections
   * @private
   */
  _destroy() {
    const self = this;

    self._logger.debug('destroying tunnel proxy');

    try {
      clearTimeout(self._connectionTimeout);
      self._server.close();
    } catch (err) {
      self._cleanConnections();
    }
  }
}

module.exports = Proxy;
