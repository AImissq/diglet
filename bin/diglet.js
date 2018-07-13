#!/usr/bin/env node

'use strict';

const program = require('commander');

program
  .version(require('../package').version)
  .command('tunnel <port>', 'establish a diglet tunnel')
  .command('server', 'start a diglet tunnel server', {
    isDefault: true
  })
  .parse(process.argv);
