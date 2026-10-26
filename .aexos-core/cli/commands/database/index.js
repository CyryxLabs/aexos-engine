'use strict';

const path = require('path');
const { Command } = require('commander');
const {
  auditDatabase,
  readJsonFile,
  validateRequest,
} = require('../../../core/database-reliability');

function diagnostic(error) {
  return {
    schemaVersion: 'aexos.database-audit.diagnostic/v1',
    status: error.code === 'DATABASE_ADAPTER_UNAVAILABLE' ? 'unavailable' : 'denied',
    code: /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code || '') ? error.code : 'DATABASE_REQUEST_INVALID',
  };
}

function print(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value)}\n`);
  else process.stdout.write(`${value.status}: ${value.code || value.requestHash}\n`);
}

function readRequest(requestFile) {
  return readJsonFile(path.resolve(requestFile), 'Database request');
}

function createDatabaseCommand(options = {}) {
  const host = options.host;
  const database = new Command('database');
  database.description('Validate bounded database reliability requests or report adapter availability');
  database
    .command('validate')
    .description('Validate one closed read-only database reliability request')
    .argument('<request-file>', 'Bounded request JSON')
    .option('--json', 'Print machine-readable output', false)
    .action((requestFile, options) => {
      try {
        const identity = validateRequest(readRequest(requestFile));
        print({ schemaVersion: 'aexos.database-audit.validation/v1', status: 'validated',
          auditId: identity.request.auditId, requestHash: identity.requestHash,
          sourceKind: 'request', adapterVerified: false }, options.json);
        process.exitCode = 0;
      } catch (error) {
        print(diagnostic(error), options.json);
        process.exitCode = 4;
      }
    });
  database
    .command('audit')
    .description('Run a bounded audit when composed with a trusted database host')
    .argument('<request-file>', 'Bounded request JSON')
    .option('--json', 'Print machine-readable output', false)
    .action(async (requestFile, options) => {
      try {
        const result = await auditDatabase(readRequest(requestFile), host);
        print(result, options.json);
        process.exitCode = 0;
      } catch (error) {
        print(diagnostic(error), options.json);
        process.exitCode = 4;
      }
    });
  return database;
}

module.exports = { createDatabaseCommand, diagnostic };
