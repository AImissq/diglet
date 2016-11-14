'use strict';

const assert = require('assert');
const {Agent} = require('http');

/**
 * Returns the given socket as a request agent for using an
 * existing connection
 */
class BindingAgent extends Agent {

  /**
   * Create binding agent
   * @param {Socket} socket - The socket connection to use
   */
  constructor(options) {
    super(options);
    assert(options.socket, 'You must supply a socket object');
    this.socket = options.socket;
  }

  createConnection() {
    return this.socket;
  }

}

module.exports = BindingAgent;
