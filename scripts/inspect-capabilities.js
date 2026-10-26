#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { inspectCapabilityCoverage } = require(path.resolve(__dirname, '../.aexos-core/core/execution/capability-coverage'));
const { verifyTaskOutcome } = require(path.resolve(__dirname, '../.aexos-core/core/execution/outcome-verifier'));
const { rankAlternatives } = require(path.resolve(__dirname, '../.aexos-core/core/execution/decision-rubric'));

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === 'installed') return require('../.aexos-core/core/execution/installed-capabilities-cli').runInstalledCapabilities(argv.slice(1));
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (argv.includes('--help')) {
    console.log('aexos capabilities [--project-root=<path>] [--json] [--strict] [--verify=<outcome.json> | --rank=<rubric.json>]');
    console.log('Coverage is structural. Outcome JSON: {contract, success, produced}. No shell checks are executed.');
    console.log('aexos capabilities installed --archive=<tgz> [--manifest=<json>] [--installed-root=<npm-package>] [--project-root=<project>]');
    return;
  }
  const projectRoot = path.resolve(value('project-root') || process.cwd());
  if (value('verify') && value('rank')) throw new Error('Select either outcome verification or ranking.');
  let result;
  if (value('rank')) result = rankAlternatives(JSON.parse(fs.readFileSync(path.resolve(value('rank')), 'utf8')));
  else if (value('verify')) result = await verifyTaskOutcome(JSON.parse(fs.readFileSync(path.resolve(value('verify')), 'utf8')), { projectRoot });
  else result = inspectCapabilityCoverage(projectRoot);
  if (argv.includes('--json') || value('verify') || value('rank')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('AEXOS structural coverage — runtime readiness NOT_ASSESSED');
    for (const group of result.groups) {
      console.log(`${group.name}: ${group.contracted}/${group.total} contracted; ${group.invalid} invalid; ${group.errors.length} manifest errors`);
    }
  }
  if (!value('verify') && !value('rank')) {
    process.exitCode = result.hasErrors ? 1
      : argv.includes('--strict') && result.groups.some((group) => group.total === 0 || group.uncontracted > 0) ? 2 : 0;
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(`AEXOS capability inspection failed: ${error.message}`); process.exitCode = 1; });
}

module.exports = { main };
