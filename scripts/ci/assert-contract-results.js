'use strict';

const fs = require('fs');

function assertContractResults(report, expectedSuites) {
  if (!Number.isInteger(expectedSuites) || expectedSuites < 1
    || report.success !== true
    || report.numTotalTestSuites !== expectedSuites
    || report.numPassedTestSuites !== expectedSuites
    || report.numFailedTestSuites !== 0
    || report.numPendingTestSuites !== 0
    || !Number.isInteger(report.numTotalTests) || report.numTotalTests < 1
    || report.numPassedTests !== report.numTotalTests
    || report.numFailedTests !== 0
    || report.numPendingTests !== 0
    || report.numTodoTests !== 0) {
    throw new Error('Mandatory contract suites must all execute and pass without skipped, empty or pending tests.');
  }
}

if (require.main === module) {
  try {
    const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    assertContractResults(report, Number(process.argv[3]));
    console.log(`Contract evidence: ${report.numPassedTestSuites} suites, ${report.numPassedTests} tests, zero skips.`);
  } catch {
    console.error('Contract evidence missing or invalid: all mandatory suites must execute and pass without skips.');
    process.exitCode = 1;
  }
}

module.exports = { assertContractResults };
