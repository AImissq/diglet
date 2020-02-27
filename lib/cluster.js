'use strict';

const { createLogger } = require('bunyan');
const merge = require('merge');
const async = require('async')
const fs = require('fs');
const { EventEmitter } = require('events');
const cluster = require('cluster');
const Server = require('./server');
const Frontend = require('./frontend');


/**
 * Manages a pool of servers in a cluster and tracks
 * which worker owns a given proxy
 */
class Cluster extends EventEmitter {

  static get DEFAULTS() {
    return {
      hostname: 'tunnel.deadcanaries.org',
      proxyPort: 443,
      redirectPort: 80,
      tunnelPort: 8443,
      serverPrivateKey: null,
      serverSSLCertificate: null,
      whitelist: false,
      logger: createLogger({ name: 'diglet' }),
    };
  }

  _checkOptions(o) {
    o.proxyPort = parseInt(o.proxyPort);
    o.tunnelPort = parseInt(o.tunnelPort);
    o.redirectPort = parseInt(o.redirectPort);
    return o;
  }

  /**
   * @constructor
   * @param {number} [clusterSize=os.cpus().length] - Total workers to spawn
   * @param {object} [options]
   */
  constructor(clusterSize = os.cpus().length, options = {}) {
    super();

    this._clusterSize = clusterSize;
    this._opts = this._checkOptions(merge(Cluster.DEFAULTS, options));
    this._workers = new Set();
    this._proxies = new Map();
    this._logger = this._opts.logger;

    this._credentials = {
      key: this._opts.serverPrivateKey,
      cert: this._opts.serverSslCertificate
    };

    this.server = new Server({
      isClustered: !cluster.isMaster,
      ...this._opts,
      ...this._credentials
    });
    this.frontend = new Frontend({
      isClustered: !cluster.isMaster,
      tlsCredentials: this._credentials,
      ...this._opts
    });

    this.frontend.on('INCOMING_HTTPS', ({ proxy, request, response}) => {
      this._routeIncomingHttps(proxy, request, response);
    });
    this.frontend.on('INCOMING_WSS', ({ proxy, request, socket}) => {
      this._routeIncomingWss(proxy, request, socket);
    });
  }

  /**
   * Routes the request to the correct worker
   * @private
   */
  _routeIncomingHttps({ proxy, request, response }) {
    if (!this._proxies.has(params.proxy)) {
      this.server._respondErrorNoTunnelConnected(proxy, request, response);
    }

    this._proxies.get(params.proxy).send({
      method: 'ROUTE_HTTPS',
      params: { proxy, request, response }
    });
  }

  /**
   * @private
   */
  _routeIncomingWss(proxy, request, socket) {
    if (!this._proxies.has(params.proxy)) {
      socket.destroy();
    }

    this._proxies.get(params.proxy).send({
      method: 'ROUTE_WSS',
      params: { proxy, request, socket }
    });

  }

  /**
   * Tracks the proxy mapped to the worker who registered it
   * @private
   */
  _registerProxy(proxy, worker) {
    this._proxies.set(proxy, worker);
  }

  /**
   * Forks worker process, tracks it in a pool, sets up listener for selecting
   * the correct proxy to forward the socket to
   * @private
   */
  _fork() {
    const worker = cluster.fork();

    worker.on('message', msg => {
      const { method, params } = msg;

      switch (method) {
        case 'UNSERVICABLE_HTTPS':
          this._routeIncomingHttps(msg.params)
          break;
        case 'UNSERVICABLE_WSS':
          this._routeIncomingWss(msg.params)
          break;
        case 'REGISTERED_PROXY':
          this._registerProxy(msg.params, worker);
          break;
        default:
          console.debug(`unknown message ${msg}`);
      }
    });

    this._workers.add(worker);
  }

  /**
   * Removes all entries referencing the given worker
   * @private
   */
  _pruneProxies(worker) {
    for (let [proxy, handle] of this._proxies) {
      if (worker === handle) {
        this._proxies.delete(proxy);
      }
    }
  }

  /**
   * Establishes the server in a forked process
   */
  listen(callback) {
    if (cluster.isMaster) {
      cluster.on('exit', (worker, code, signal) => {
        this._logger.warn(`worker ${worker.process.pid} died`);
        this._workers.delete(worker);
        this._pruneProxies(worker);
      });

      for (let i = 0; i < this._clusterSize; i++) {
        this._fork();
      }

      callback();
    } else {
      async.parallel([
        (done) => this.server.listen(this._opts.tunnelPort, done),
        (done) => this.frontend.listen(this._opts.proxyPort, done),
        (done) => this.frontend.redirect(this._opts.redirectPort, done)
      ], callback);

      setInterval(() => this._heartbeat(), 60000);
    }
  }

  /**
   * @private
   */
  _heartbeat() {
    async.eachLimit([...this.server._proxies], 6, ([id, proxy], done) => {
      if (proxy._connectedSockets.length === 0) {
        this._logger.info('proxy %s has no connected sockets, destroying...', id);
        server._proxies.delete(id);
        return done();
      }

      const url = `https://${id}.${this._opts.hostname}:${this._opts.proxyPort}`;

      this._logger.info('sending heartbeat to %s (%s)', id, url);
      https.request({
        host: `${id}.${this._opts.hostname}`,
        port: parseInt(this._opts.proxyPort),
        headers: {
          'User-Agent': 'Diglet Heartbeat'
        }
      }, (res) => {
        res.resume();
        done();
      }).on('error', () => null);
    });
  }

  /**
   * Clean shutdown
   */
  close() {
    cluster.removeAllListeners('exit');

    for (let worker of this._workers) {
      worker.kill();
    }

    // TODO close servers here
  }

}

module.exports = Cluster;
