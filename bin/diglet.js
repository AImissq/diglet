#!/usr/bin/env node

'use strict';

const program = require('commander');
const rc = require('rc');

program
  .version(require('../package').version)
  .command('client', 'establish a diglet tunnel', { isDefault: true })
  .command('server', 'start a diglet tunnel server')
  .command('config', 'prints the current configuration')
  .parse(process.argv);
