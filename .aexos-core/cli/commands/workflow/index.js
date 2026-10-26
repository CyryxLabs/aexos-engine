/** CLI-first Workflow Engineering process compiler. */

'use strict';

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { compileWorkflowMap } = require('../../../core/workflow-engineering/workflow-map');
const { createSopCommand } = require('./sop');
const { runGovernedWorkflow } = require(path.resolve(__dirname, '../../../core/execution/workflow-runner'));

const VERDICT_EXIT = Object.freeze({ PASS: 0, CONCERNS: 2 });

function createWorkflowCommand() {
  const workflow = new Command('workflow');
  workflow.description('Map a discovered process into AEXOS task contracts');
  workflow.addCommand(createSopCommand());
  workflow
    .command('run')
    .description('Execute the selected SDLC with a separate exact-run operator policy')
    .argument('<run-file>', 'Versioned local plan JSON')
    .requiredOption('--executor <name>', 'Explicit executor (local-plan)')
    .requiredOption('--policy <file>', 'Separate operator policy bound to the exact run hash')
    .requiredOption('--control-dir <directory>', 'Existing protected operator control directory outside the consumer')
    .option('--project-root <directory>', 'Authorized consumer project', process.cwd())
    .option('--json', 'Print sanitized machine-readable evidence', false)
    .action(async (runFile, options) => {
      const originalLog = console.log;
      // The orchestrator emits progress. Keep JSON stdout a single receipt.
      if (options.json) console.log = (...args) => console.error(...args);
      let receipt;
      try {
        receipt = await runGovernedWorkflow({ runFile: path.resolve(runFile), policyFile: path.resolve(options.policy),
          executor: options.executor, projectRoot: path.resolve(options.projectRoot),
          controlRoot: path.resolve(options.controlDir),
        });
      } catch (error) {
        receipt = { receiptVersion: 1, status: 'BLOCKED', errorCode: error.code || 'WORKFLOW_INPUT_INVALID' };
      } finally { console.log = originalLog; }
      if (options.json) console.log(JSON.stringify(receipt, null, 2));
      else console.log(`Workflow: ${receipt.status}${receipt.errorCode ? ` (${receipt.errorCode})` : ''}`);
      process.exitCode = receipt.status === 'ACCEPTED' ? 0 : 4;
    });
  workflow
    .command('map')
    .description('Compile a process JSON file without executing it')
    .argument('<process-file>', 'JSON process definition')
    .option('--json', 'Print machine-readable workflow evidence', false)
    .action((processFile, options) => {
      try {
        const input = JSON.parse(fs.readFileSync(path.resolve(processFile), 'utf8'));
        const result = compileWorkflowMap(input);
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else {
          console.log(`Workflow QA: ${result.qa.verdict}`);
          console.log(`Workflow: ${result.workflowId}`);
          console.log(`Tasks: ${result.steps.length} in ${result.waves.length} wave(s)`);
        }
        process.exitCode = VERDICT_EXIT[result.qa.verdict];
      } catch (error) {
        console.error(`[${error.code || 'WORKFLOW_INPUT_INVALID'}] ${error.message}`);
        process.exitCode = 4;
      }
    });
  return workflow;
}

module.exports = { VERDICT_EXIT, createWorkflowCommand };
