'use strict';

// Measure the real synchronous log writer outside Jest instrumentation. The
// calling test owns the temporary directory and verifies every persisted line.
const { InstallTransaction } = require('../../bin/utils/install-transaction');

const transaction = new InstallTransaction({ logFile: process.argv[2] });
const start = Date.now();
for (let i = 0; i < 1000; i++) {
  transaction.log('INFO', `Log entry ${i}`);
}
const duration = Date.now() - start;
process.stdout.write(JSON.stringify({ duration, operationsCount: transaction.operations.length }) + '\n');
