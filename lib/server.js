'use strict';

const http = require('http');
const portastic = require('portastic');
const assert = require('assert');
const {createLogger} = require('bunyan');
const Proxy = require('./proxy');

/** Manages a collection of proxy tunnels and routing incoming requests */
class Server {

  /**
   * Represents a tunnel/proxy server
   * @param {Object} options
   * @param {Object} [options.proxyPortRange={}]
   * @param {Number} [options.proxyPortRange.min=12000] - Min port for proxies
   * @param {Number} [options.proxyPortRange.max=12023] - Max port for proxies
   * @param {Number} [options.maxProxiesAllowed=24] - Total proxies allowed
   * @param {Number} [options.proxyMaxConnections=10] - Max tunnels for proxy
   * @param {Number} [options.proxyIdleTimeout=5000] - Close proxy after timeout
   * @param {Number} [options.proxySocketTimeout=5000] - Max time to wait
   * before assuming a socket is dead
   * @param {Object} [options.logger=console] - Custom logger to use
   */
  constructor(options = {}) {
    options.proxySocketTimeout = options.proxySocketTimeout || 5000;
    options.proxyPortRange = options.proxyPortRange || {};
    options.proxyPortRange.min = options.proxyPortRange.min || 12000;
    options.proxyPortRange.max = options.proxyPortRange.max || 12023;
    this._opts = this._checkOptions(options);
    this._proxies = {};
    this._logger = this._opts.logger || createLogger({ name: 'diglet' });
  }

  /**
   * Validates options given to constructor
   * @private
   */
  _checkOptions(o) {
    assert(typeof o.proxyPortRange === 'object', 'Invalid proxyPortRange');
    assert(typeof o.proxyPortRange.min === 'number', 'Invalid proxyPortRange');
    assert(typeof o.proxyPortRange.max === 'number', 'Invalid proxyPortRange');
    assert(typeof o.proxySocketTimeout === 'number', 'Bad proxySocketTimeout');
    return o;
  }

  /**
   * Creates a new proxy
   * @param {String} proxyId - Unique ID for this proxy
   * @param {Server~addProxyCallback} callback
   */
  addProxy(id, callback) {
    const self = this;

    if (Object.keys(self._proxies).length >= self._opts.maxProxiesAllowed) {
      self._logger.error('refusing to add another proxy - limit reached');
      return callback(new Error('Maximum proxies reached'));
    }

    if (self.getProxyById(id)) {
      self._logger.warn('refusing to add proxy - ID is already in use');
      return callback(new Error('Proxy ID is already in use'));
    }

    self.getAvailablePort(function(err, port) {
      if (err) {
        self._logger.error('failed to get port, reason: %s', err.message);
        return callback(err);
      }

      const proxy = self._proxies[id] = new Proxy({
        logger: self._logger,
        proxyId: id,
        proxyPort: port,
        idleTimeout: self._opts.proxyIdleTimeout,
        maxConnections: self._opts.proxyMaxConnections
      });

      self._logger.info('opening new proxy %s on port %s', id, port);
      proxy.on('end', () => delete self._proxies[id]);
      proxy.open((err) => callback(err, proxy));
    });
  }
  /**
   * @callback Server~addProxyCallback
   * @param {Error|null} error
   * @param {Proxy} proxy
   */

  /**
   * Returns the proxy instance by it's ID
   * @param {String} id - Proxy ID
   * @returns {Proxy|null} proxy
   */
  getProxyById(id) {
    return this._proxies[id] || null;
  }

  /**
   * Routes the incoming HTTP request to it's corresponding proxy
   * @param {String} proxyId - The unique ID for the proxy instance
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   * @param {Server~routeHttpRequestCallback} callback
   */
  routeHttpRequest(proxyId, request, response, callback) {
    const self = this;
    const proxy = self.getProxyById(proxyId);

    self._logger.info('routing HTTP request to proxy');

    if (!proxy) {
      self._logger.warn('no proxy with id %s exists', proxyId);
      response.statusCode = 502;
      response.end(JSON.stringify({
        error: 'Unable to route to tunnel, client is not connected'
      }));
      response.connection.destroy();
      return callback(false);
    }

    let responseDidFinish = false;

    function _onFinished() {
      self._logger.info('response finished, destroying connection');
      responseDidFinish = true;
      request.connection.destroy();
    }

    function _sendCannotService() {
      response.statusCode = 504;
      response.end(JSON.stringify({
        error: 'Client cannot service request at this time'
      }));
      request.connection.destroy();
    }

    response
      .once('finish', _onFinished)
      .once('error', _onFinished)
      .once('close', _onFinished);

    function getSocketHandler(proxySocket, addSocketBackToPool) {
      if (responseDidFinish) {
        self._logger.warn('response already finished, aborting');
        return addSocketBackToPool && addSocketBackToPool();
      } else if (!proxySocket) {
        self._logger.warn('no proxied sockets back to client are available');
        return _sendCannotService();
      }

      const clientRequest = http.request({
        path: request.url,
        method: request.method,
        headers: request.headers,
        createConnection: () => proxySocket
      });

      function _forwardResponse(clientResponse) {
        self._logger.info('forwarding tunneled response back to requester');
        proxySocket.setTimeout(0);
        response.writeHead(clientResponse.statusCode, clientResponse.headers);
        clientResponse.pipe(response);
      }

      self._logger.info('tunneling request through to client');
      proxySocket.setTimeout(self._opts.proxySocketTimeout);
      proxySocket.on('timeout', () => {
        _sendCannotService();
        clientRequest.abort();
        proxySocket.destroy();
      });
      response.once('finish', () => addSocketBackToPool());
      clientRequest.on('abort', () => proxy.getSocket(getSocketHandler));
      clientRequest.on('response', (resp) => _forwardResponse(resp));
      clientRequest.on('error', () => request.connection.destroy());
      request.pipe(clientRequest);
    }

    self._logger.debug('getting proxy tunnel socket back to client...');
    proxy.getSocket(getSocketHandler);
    callback(true);
  }
  /**
   * @callback Server~routeHttpRequestCallback
   * @param {Boolean} didRouteRequest
   */

  /**
   * Routes the incoming WebSocket connection to it's corresponding proxy
   * @param {String} proxyId - The unique ID for the proxy instance
   * @param {http.IncomingMessage} request
   * @param {net.Socket} socket
   * @param {Server~routeWebSocketConnectionCallback} callback
   */
  routeWebSocketConnection(proxyId, request, socket, callback) {
    const self = this;
    const proxy = self.getProxyById(proxyId);

    if (!proxy) {
      socket.destroy();
      return callback(false);
    }

    let socketDidFinish = false;

    socket.once('end', () => socketDidFinish = true);
    proxy.getSocket(function(proxySocket) {
      if (socketDidFinish) {
        return;
      } else if (!proxySocket) {
        socket.destroy();
        request.connection.destroy();
        return;
      }

      proxySocket.pipe(socket).pipe(proxySocket);
      proxySocket.write(Server.recreateWebSocketHeaders(request));
    });

    callback(true);
  }
  /**
   * @callback Server~routeWebSocketConnectionCallback
   * @param {Boolean} didRouteConnection
   */

  /**
   * Recreates the header information for websocket connections
   * @private
   */
  static recreateWebSocketHeaders(request) {
    var headers = [
      `${request.method} ${request.url} HTTP/${request.httpVersion}`
    ];

    for (let i = 0; i < (request.rawHeaders.length - 1); i += 2) {
      headers.push(`${request.rawHeaders[i]}: ${request.rawHeaders[i + 1]}`);
    }

    headers.push('');
    headers.push('');

    return headers.join('\r\n');
  }

  /**
   * Returns an avaiable port
   * @param {Server~getAvailablePortCallback}
   */
  getAvailablePort(callback) {
    portastic.find(this._opts.proxyPortRange)
      .then((ports) => callback(null, ports[0]))
      .catch((err) => callback(err));
  }
  /**
   * @callback Server~getAvailablePortCallback
   * @param {Error|null} error
   * @param {Number} port
   */

}

module.exports = Server;
