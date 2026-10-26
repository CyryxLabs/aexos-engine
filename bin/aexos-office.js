#!/usr/bin/env node
'use strict';

const { run } = require('../.aexos-core/core/virtual-office/cli');

run(process.argv.slice(2)).catch((error) => {
  console.error(`Virtual Office error: ${error.message}`);
  process.exit(1);
});

