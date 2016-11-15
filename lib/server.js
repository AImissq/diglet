'use strict';

const portastic = require('portastic');
const assert = require('assert');
const Proxy = require('./proxy');
const {EventEmitter} = require('events');
const BindingAgent = require('./binding-agent');
const {getSubdomain} = require('tldjs');
const onResponseFinished = require('on-finished');

/** Manages a collection of proxy tunnels and routing incoming requests */
class Server extends EventEmitter {

  /**
   * Represents a tunnel/proxy server
   * @param {Object} options
   * @param {Object} [options.proxyPortRange={}]
   * @param {Number} [options.proxyPortRange.min=12000]
   * @param {Number} [options.proxyPortRange.max=12023]
   * @param {Number} [options.maxProxiesAllowed=24]
   * @param {Number} [options.proxyMaxConnections=10]
   * @param {Number} [options.proxyIdleTimeout=5000]
   * @param {Object} [options.logger=console]
   */
  constructor(options = {}) {
    super();
    options.proxyPortRange = options.proxyPortRange || {};
    options.proxyPortRange.min = options.proxyPortRange.min || 12000;
    options.proxyPortRange.max = options.proxyPortRange.max || 12023;
    this._opts = this._checkOptions(options);
    this._proxies = {};
    this._logger = this._opts.logger;
  }

  /**
   * Validates options given to constructor
   * @private
   */
  _checkOptions(o) {
    assert(typeof o.proxyPortRange === 'object', 'Invalid proxyPortRange');
    assert(typeof o.proxyPortRange.min === 'number', 'Invalid proxyPortRange');
    assert(typeof o.proxyPortRange.max === 'number', 'Invalid proxyPortRange');
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
      return callback(new Error('Maximum proxies reached'));
    }

    if (self.getProxyById(id)) {
      return callback(new Error('Proxy ID is already in use'));
    }

    self.getAvailablePort(function(err, port) {
      if (err) {
        return callback(err);
      }

      const proxy = self._proxies[id] = new Proxy({
        logger: self._logger,
        proxyId: id,
        proxyPort: port,
        idleTimeout: self._opts.proxyIdleTimeout,
        maxConnections: self._opts.proxyMaxConnections
      });

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
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   * @param {Server~routeHttpRequestCallback} callback
   */
  routeHttpRequest(request, response, callback) {
    const self = this;
    const proxy = self.getProxyById(self.getProxyIdForRequest(request));

    if (!proxy) {
      res.statusCode = 502;
      res.end();
      res.connection.destroy();
      return callback(false);
    }

    let responseDidFinish = false;

    onResponseFinished(response, function() {
      responseDidFinish = true;
      request.connection.destroy();
    });

    proxy.getSocket(function(proxySocket) {
      if (responseDidFinish) {
        return;
      } else if (!proxySocket) {
        response.statusCode = 504;
        response.end();
        request.connection.destroy();
        return;
      }

      const clientRequest = http.request({
        path: request.url,
        method: request.method,
        headers: request.headers,
        agent: new BindingAgent({ socket: proxySocket })
      });

      function _forwardResponse(clientResponse) {
        response.writeHead(clientResponse.statusCode, clientResponse.headers);
        clientResponse.pipe(response);
      }

      clientRequest.on('response', (resp) => _forward(resp));
      clientRequest.on('error', () => request.connection.destroy());
      request.pipe(clientRequest);
    });

    callback(true);
  }
  /**
   * @callback Server~routeHttpRequestCallback
   * @param {Boolean} didRouteRequest
   */

  /**
   * Routes the incoming WebSocket connection to it's corresponding proxy
   * @param {http.IncomingMessage} request
   * @param {net.Socket} socket
   * @param {Server~routeWebSocketConnectionCallback} callback
   */
  routeWebSocketConnection(request, socket, callback) {
    const self = this;
    const proxy = self.getProxyById(self.getProxyIdForRequest(request));

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
      proxySocket.write(self._recreateWebSocketHeaders(request));
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
  _recreateWebSocketHeaders(request) {
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
   * User-implemented method for returning a proxy ID based on the request
   * and defaults to simply using the subdomain requested as the proxy ID.
   * Custom implementations will want to override this method to determine
   * how to parse a request and return the proxy ID
   * @param {http.IncomingMessage} request
   * @returns {String|null} proxyId
   */
  getProxyIdForRequest(request) {
    return getSubdomain(request.headers.host);
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
