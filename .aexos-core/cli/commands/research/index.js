/** CLI-first local durable research commands. */
'use strict';

const path = require('path');
const { Command } = require('commander');
const {
  DEFAULT_OPERATOR_POLICY,
  cancelResearchAsync,
  exportJson,
  exportMarkdown,
  loadResearch,
  readPlan,
  recoverResearch,
  runResearch,
  sanitizeErrorCode,
} = require('../../../core/research');

const SUCCESS = new Set(['completed']);

function diagnostic(error) {
  return {
    schemaVersion: 'aexos.research-diagnostic/v1',
    status: 'error',
    code: sanitizeErrorCode(error.code, 'COLLECTION_FAILED'),
  };
}

function printArtifact(artifact, json) {
  if (json) process.stdout.write(exportJson(artifact));
  else {
    process.stdout.write(`Research: ${artifact.status}${artifact.reasonCode ? ` (${artifact.reasonCode})` : ''}\n`);
    process.stdout.write(`Run: ${artifact.runId}\n`);
    process.stdout.write(`Lineage: ${artifact.lineageStatus}; provider: ${artifact.providerVerification}\n`);
  }
}

function setExit(artifact) {
  process.exitCode = SUCCESS.has(artifact.status) ? 0 : 4;
}

function requireAbsolute(value, code) {
  if (!path.isAbsolute(value)) throw Object.assign(new Error('Absolute path required.'), { code });
  return path.resolve(value);
}

function executionCommand(parent, mode) {
  parent
    .command(mode)
    .description(`${mode === 'start' ? 'Start' : 'Resume'} a fixture-local durable research run`)
    .argument('<plan-file>', 'Strict versioned research plan JSON')
    .requiredOption('--input-root <directory>', 'Existing absolute local fixture root')
    .requiredOption('--state-dir <directory>', 'Existing absolute operator-owned state directory')
    .option('--json', 'Print canonical JSON artifact', false)
    .action(async (planFile, options) => {
      const controller = new AbortController();
      const onInterrupt = () => controller.abort();
      process.once('SIGINT', onInterrupt);
      try {
        const identity = readPlan(path.resolve(planFile), DEFAULT_OPERATOR_POLICY);
        const artifact = await runResearch({
          mode,
          plan: identity.plan,
          inputRoot: requireAbsolute(options.inputRoot, 'RESEARCH_INPUT_ROOT_INVALID'),
          stateDir: requireAbsolute(options.stateDir, 'RESEARCH_STORE_REQUIRED'),
          operatorPolicy: DEFAULT_OPERATOR_POLICY,
          signal: controller.signal,
        });
        printArtifact(artifact, options.json);
        setExit(artifact);
      } catch (error) {
        const output = diagnostic(error);
        if (options.json) process.stdout.write(`${JSON.stringify(output)}\n`);
        else process.stderr.write(`[${output.code}] Research command failed.\n`);
        process.exitCode = 4;
      } finally { process.removeListener('SIGINT', onInterrupt); }
    });
}

function createResearchCommand() {
  const research = new Command('research');
  research.description('Run bounded fixture-local research with durable evidence lineage');
  executionCommand(research, 'start');
  executionCommand(research, 'resume');
  research
    .command('status')
    .description('Validate and inspect a durable research run')
    .argument('<run-id>', 'Research run identity')
    .requiredOption('--state-dir <directory>', 'Existing absolute operator-owned state directory')
    .option('--json', 'Print canonical JSON artifact', false)
    .action((runId, options) => {
      try {
        const artifact = loadResearch({ runId,
          stateDir: requireAbsolute(options.stateDir, 'RESEARCH_STORE_REQUIRED') });
        printArtifact(artifact, options.json);
        process.exitCode = 0;
      } catch (error) {
        const output = diagnostic(error);
        if (options.json) process.stdout.write(`${JSON.stringify(output)}\n`);
        else process.stderr.write(`[${output.code}] Research status failed.\n`);
        process.exitCode = 4;
      }
    });
  research
    .command('export')
    .description('Export one validated immutable research snapshot')
    .argument('<run-id>', 'Research run identity')
    .requiredOption('--state-dir <directory>', 'Existing absolute operator-owned state directory')
    .requiredOption('--format <format>', 'json or markdown')
    .action((runId, options) => {
      try {
        const artifact = loadResearch({ runId,
          stateDir: requireAbsolute(options.stateDir, 'RESEARCH_STORE_REQUIRED') });
        if (!['json', 'markdown'].includes(options.format)) {
          throw Object.assign(new Error('Unsupported format.'), { code: 'RESEARCH_EXPORT_FORMAT' });
        }
        process.stdout.write(options.format === 'json' ? exportJson(artifact) : exportMarkdown(artifact));
        process.exitCode = 0;
      } catch (error) {
        process.stderr.write(`[${sanitizeErrorCode(error.code)}] Research export failed.\n`);
        process.exitCode = 4;
      }
    });
  research
    .command('recover')
    .description('Recover one protocol-v2 research writer after process death')
    .argument('<run-id>', 'Research run identity')
    .requiredOption('--state-dir <directory>', 'Existing absolute operator-owned state directory')
    .option('--json', 'Print fixed recovery result JSON', false)
    .action(async (runId, options) => {
      try {
        const result = await recoverResearch({ runId,
          stateDir: requireAbsolute(options.stateDir, 'RESEARCH_STORE_REQUIRED') });
        if (options.json) process.stdout.write(`${JSON.stringify(result)}\n`);
        else process.stdout.write(`Research recovery: ${result.status}\nRun: ${result.runId}\n`);
        process.exitCode = 0;
      } catch (error) {
        const output = diagnostic(error);
        if (options.json) process.stdout.write(`${JSON.stringify(output)}\n`);
        else process.stderr.write(`[${output.code}] Research recovery failed.\n`);
        process.exitCode = 4;
      }
    });
  research
    .command('cancel')
    .description('Durably cancel an idle nonterminal research run')
    .argument('<run-id>', 'Research run identity')
    .requiredOption('--state-dir <directory>', 'Existing absolute operator-owned state directory')
    .option('--json', 'Print canonical JSON artifact', false)
    .action(async (runId, options) => {
      try {
        const artifact = await cancelResearchAsync({ runId,
          stateDir: requireAbsolute(options.stateDir, 'RESEARCH_STORE_REQUIRED') });
        printArtifact(artifact, options.json);
        process.exitCode = artifact.status === 'cancelled' ? 4 : 0;
      } catch (error) {
        const output = diagnostic(error);
        if (options.json) process.stdout.write(`${JSON.stringify(output)}\n`);
        else process.stderr.write(`[${output.code}] Research cancellation failed.\n`);
        process.exitCode = 4;
      }
    });
  return research;
}

module.exports = { createResearchCommand };
