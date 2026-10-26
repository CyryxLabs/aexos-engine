/** CLI-first governed Cerberus gateway. */

'use strict';

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { CapabilityBroker } = require('../../../core/permissions/capability-broker');
const {
  CerberusGateway,
  createSubprocessTransport,
  validateRequest,
} = require('../../../core/cerberus');
const {
  DurableMissionRunner,
  MissionStore,
  missionSummary,
  validateMissionPlan,
} = require('../../../core/execution/durable-mission');

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer.`);
  return parsed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

async function executeGatewayRequest(request, options, task) {
  const workerPath = path.resolve(options.worker);
  const timeoutMs = positiveInteger(options.timeout, 'timeout');
  const maxRetries = positiveInteger(options.retries, 'retries');
  const identity = { agentId: 'cerberus-cli', task, resource: workerPath };
  const broker = new CapabilityBroker({
    policy: (candidate) => (
      candidate.agentId === identity.agentId
      && candidate.task === identity.task
      && candidate.capability === 'cerberus.knowledge'
      && candidate.resource === workerPath
      && candidate.scope === request.projectId
      && candidate.actions.length === 1
      && candidate.actions[0] === request.operation
    ),
  });
  const lease = broker.grant({
    ...identity,
    capability: 'cerberus.knowledge',
    actions: [request.operation],
    scope: request.projectId,
    ttlMs: Math.min(timeoutMs + 5_000, 300_000),
  });
  const gateway = new CerberusGateway({
    capabilityBroker: broker,
    transport: createSubprocessTransport({ workerPath }),
    timeoutMs,
    maxRetries,
  });
  return gateway.execute({ request, identity, capabilityToken: lease.token });
}

async function runOperation(operation, requestFile, options) {
  try {
    const request = validateRequest(readJson(requestFile));
    if (request.operation !== operation) {
      throw Object.assign(new Error(`Request operation must be ${operation}.`), {
        code: 'CERBERUS_OPERATION_MISMATCH',
      });
    }
    const result = await executeGatewayRequest(request, options, `cerberus-${operation}`);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Cerberus ${operation}: ${result.receipt.status}`);
      console.log(`Request: ${result.receipt.requestId}`);
      console.log(`Worker: ${result.receipt.provenance.workerVersion}`);
      console.log(`Source: ${result.receipt.provenance.sourceHash}`);
    }
  } catch (error) {
    console.error(`[${error.code || 'CERBERUS_INPUT_INVALID'}] ${error.message}`);
    process.exitCode = 4;
  }
}

function missionStore(options) {
  return new MissionStore({
    root: path.resolve(options.stateDir || path.join(process.cwd(), '.aexos', 'missions')),
  });
}

async function runMission(mode, missionFile, options) {
  try {
    const plan = validateMissionPlan(readJson(missionFile), { projectRoot: process.cwd() });
    const store = missionStore(options);
    const runner = new DurableMissionRunner({
      store,
      projectRoot: process.cwd(),
      executor: (request, context) => executeGatewayRequest(
        request,
        options,
        `cerberus-mission-${context.missionId}-${context.stepId}`,
      ),
    });
    const result = await runner[mode](plan);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Cerberus mission ${result.missionId}: ${result.status}`);
      console.log(`Revision: ${result.revision}`);
      console.log(`Steps: ${result.steps.filter((step) => step.status === 'completed').length}/${result.steps.length}`);
    }
    if (result.status !== 'completed') process.exitCode = 4;
  } catch (error) {
    console.error(`[${error.code || 'MISSION_INPUT_INVALID'}] ${error.message}`);
    process.exitCode = 4;
  }
}

function showMissionStatus(missionId, options) {
  try {
    const result = missionSummary(missionStore(options).load(missionId));
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Cerberus mission ${result.missionId}: ${result.status}`);
      console.log(`Revision: ${result.revision}`);
      for (const step of result.steps) {
        console.log(`${step.stepId}: ${step.status} (${step.attempts} attempt(s))`);
      }
    }
  } catch (error) {
    console.error(`[${error.code || 'MISSION_INPUT_INVALID'}] ${error.message}`);
    process.exitCode = 4;
  }
}

function addOperation(command, operation) {
  command
    .command(operation)
    .description(`${operation === 'ingest' ? 'Ingest material into' : 'Query'} an explicit Cerberus worker`)
    .argument('<request-file>', `aexos.cerberus/v1 ${operation} request JSON`)
    .requiredOption('--worker <path>', 'Explicit Cerberus worker executable or JavaScript file')
    .option('--timeout <ms>', 'Bounded operation timeout', '30000')
    .option('--retries <count>', 'Transient failure retries (maximum 3)', '1')
    .option('--json', 'Print response and sanitized receipt as JSON', false)
    .action((requestFile, options) => runOperation(operation, requestFile, options));
}

function addMissionExecution(mission, mode) {
  mission
    .command(mode)
    .description(`${mode === 'run' ? 'Run' : 'Resume'} a durable Cerberus mission`)
    .argument('<mission-file>', 'aexos.mission/v1 plan JSON')
    .requiredOption('--worker <path>', 'Explicit Cerberus worker executable or JavaScript file')
    .option('--state-dir <path>', 'Durable mission state root', '.aexos/missions')
    .option('--timeout <ms>', 'Bounded operation timeout', '30000')
    .option('--retries <count>', 'Transient worker retries (maximum 3)', '1')
    .option('--json', 'Print sanitized mission state as JSON', false)
    .action((missionFile, options) => runMission(mode, missionFile, options));
}

function addMissionCommands(command) {
  const mission = command.command('mission').description('Durable Cerberus missions');
  addMissionExecution(mission, 'run');
  addMissionExecution(mission, 'resume');
  mission
    .command('status')
    .description('Read and verify durable mission state')
    .argument('<mission-id>', 'Mission identity')
    .option('--state-dir <path>', 'Durable mission state root', '.aexos/missions')
    .option('--json', 'Print sanitized mission state as JSON', false)
    .action(showMissionStatus);
}

function createCerberusCommand() {
  const command = new Command('cerberus');
  command.description('Governed Cerberus knowledge gateway');
  addOperation(command, 'ingest');
  addOperation(command, 'query');
  addMissionCommands(command);
  return command;
}

module.exports = {
  createCerberusCommand,
  executeGatewayRequest,
  runMission,
  runOperation,
  showMissionStatus,
};
