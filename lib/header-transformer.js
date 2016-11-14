'use strict';

const {Transform} = require('readable-stream');

/**
 * Modifies headers on incoming requests from tunnel before forwarding them to
 * the local server
 */
class HeaderTransformer extends Transform {

  /**
   * Creates a transform stream for modding headers
   * @param {Object} [options]
   * @param {String} [options.host=localhost] - Replace the host header with this
   */
  constructor(options) {
    options = options || {};
    super(options);
    this.host = options.host || 'localhost';
    this._replaced = false;
  }

  _transform(chunk, encoding, callback) {
    const self = this;

    if (self._replaced) {
      return callback(null, chunk);
    }

    chunk = chunk.toString();

    callback(null, chunk.replace(/(\r\nHost: )\S+/, function(match, $1) {
      self._replaced = true;
      return $1 + self.host;
    }));
  }

}

module.exports = HeaderTransformer;
