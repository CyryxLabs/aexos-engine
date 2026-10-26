#!/usr/bin/env node

'use strict';

const path = require('path');
const { validateTaskCorpus } = require('../.aexos-core/core/execution/task-contract');

function getArgumentValue(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

function main() {
  const projectRoot = path.resolve(getArgumentValue('project-root', process.cwd()));
  const taskRoot = getArgumentValue(
    'task-root',
    path.join(projectRoot, '.aexos-core', 'development', 'tasks'),
  );
  const enforcement = getArgumentValue('enforcement', 'warn');
  const report = validateTaskCorpus({ projectRoot, taskRoot, enforcement });

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log('AEXOS task contract validation');
    console.log(`Mode: ${report.enforcement}`);
    console.log(`Tasks: ${report.total}`);
    console.log(`Contracted: ${report.contracted}`);
    console.log(`Uncontracted: ${report.uncontracted}`);
    console.log(`Invalid: ${report.invalid}`);
    console.log(`Coverage: ${report.coverage}%`);

    for (const result of report.results.filter((item) => item.status === 'invalid')) {
      console.error(`INVALID ${path.relative(projectRoot, result.filePath)}`);
      for (const error of result.errors) {
        console.error(`  ${error.code || error.path}: ${error.message}`);
      }
    }
  }

  process.exitCode = report.valid ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(`Task contract validation failed: ${error.message}`);
  process.exitCode = 1;
}
