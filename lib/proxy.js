'use strict';

const assert = require('assert');
const net = require('net');
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
    options.logger = options.logger || console;
    this._opts = this._checkOptions(options);
    this._server = net.createServer();
    this._waitingHandlers = [];
    this._connectedSockets = [];
    this._logger = this._opts.logger;
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
      return openCallback(new Error('Proxy is already opened'));
    }

    self._isOpened = true;

    self._server.on('close', () => self._cleanConnections());
    self._server.on('connection', (sock) => self._handleConnection(sock));
    self._server.on('error', (err) => self._handleProxyError(err));
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

    if (!socket) {
      return self._waitingHandlers.push(socketHandler);
    }

    socketHandler(socket, function(err) {
      if (err) {
        return self._log.error(err.message);
      }

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

    clearTimeout(self._connectionTimeout);
    self._waitingHandlers.forEach((handler) => handler(null));

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

    if (self._connectedSockets.length >= self._opts.maxConnections) {
      return socket.end();
    }

    clearTimeout(self._connectionTimeout);
    socket.once('close', () => self._handleSocketClose(socket));
    socket.on('error', (err) => socket.destroy());
    self._connectedSockets.push(socket);
    self._processNextWaitingHandler();
  }

  /**
   * Handles a closed tunnel socket
   * @private
   */
  _handleSocketClose(socket) {
    const self = this;
    const socketIndex = self._connectedSockets.indexOf(socket);

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

    try {
      clearTimeout(self._connectionTimeout);
      self._server.close();
    } catch (err) {
      self._cleanConnections();
    }
  }
}

module.exports = Proxy;
