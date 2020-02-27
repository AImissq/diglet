'use strict';

const merge = require('merge');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');

/**
 * Frontend application that provides an interface to route incoming
 * connections
 */
class Frontend extends EventEmitter {

  static get DEFAULTS() {
    return {

    };
  }

  /**
   * @constructor
   */
  constructor(options){
    super();
    this._opts = this._checkOptions(merge(Frontend.DEFAULTS, options));
  }

  /**
   * @private
   */
  _checkOptions(o) {
    return o;
  }

  static getProxyIdFromSubdomain(request) {
    let subdomain = tld.getSubdomain(request.headers.host);
    let parts = subdomain ? subdomain.split('.') : [];

    if (request.headers.host === config.Hostname) {
      return '';
    } else if (parts.length > 1) {
      return parts[0];
    } else {
      return subdomain;
    }
  }

  handleServerRequest(request, response) {
    let proxyId = Frontend.getProxyIdFromSubdomain(request);

    if (proxyId) {
      this.emit('INCOMING_HTTPS', { proxy: proxyId, request, response });
    } else {
      // TODO route with express or something easier
      if (request.url === '/') {
        response.writeHead(200, {
          'Content-Type': 'application/json'
        });
        response.end(JSON.stringify({
          version: pkg.version,
          started,
        }));
      } else {
        const proxy = request.url.substr(1, 40);
        const info = null; // TODO

        if (info) {
          response.writeHead(200, {
            'Content-Type': 'application/json'
          });
          response.end(JSON.stringify(info));
        } else {
          response.writeHead(404, {
            'Content-Type': 'application/json'
          });
          response.end(JSON.stringify({ message: 'not found' }));
        }
      }
    }
  }

  handleServerUpgrade(request, socket) {
    let proxyId = Frontend.getProxyIdFromSubdomain(request);

    if (!proxyId) {
      return socket.destroy();
    }

    this.emit('INCOMING_WSS', { proxy: proxyId, request, socket });
  }

  listen() {
    this.proxy = https.createServer(this._credentials);

    this.proxy.on('request', (req, res) => {
      this.handleServerRequest(res, res);
    });
    this.proxy.on('upgrade', (req, sock) => {
      this.handleServerUpgrade(req, sock);
    });

    this.proxy.listen(...arguments);
  }

  redirect() {
    this.redirect = http.createServer(function(req, res) {
      res.writeHead(301, {
        Location: `https://${req.headers.host}${req.url}`
      });
      res.end();
    }).listen(...arguments);
  }

}

module.exports = Frontend;
