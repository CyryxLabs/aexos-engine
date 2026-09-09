/** CLI-first Security squad assessment gate. */

'use strict';

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { assessSecurity } = require('../../../core/security/security-assessment');

const VERDICT_EXIT = Object.freeze({ PASS: 0, CONCERNS: 2, FAIL: 3 });

function createSecurityCommand() {
  const security = new Command('security');
  security.description('Security squad assessment and release verdict');
  security
    .command('assess')
    .description('Evaluate a Security squad findings JSON file')
    .argument('<findings-file>', 'JSON assessment containing domainsAssessed and findings')
    .option('--json', 'Print machine-readable verdict evidence', false)
    .action((findingsFile, options) => {
      try {
        const input = JSON.parse(fs.readFileSync(path.resolve(findingsFile), 'utf8'));
        const result = assessSecurity(input);
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else {
          console.log(`Security verdict: ${result.verdict}`);
          console.log(`Assessment: ${result.assessmentId}`);
          console.log(`Findings: ${result.summary.total} (${result.summary.blocking} blocking)`);
        }
        process.exitCode = VERDICT_EXIT[result.verdict];
      } catch (error) {
        console.error(`[${error.code || 'SECURITY_INPUT_INVALID'}] ${error.message}`);
        process.exitCode = 4;
      }
    });
  return security;
}

module.exports = { VERDICT_EXIT, createSecurityCommand };
