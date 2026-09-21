#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

// Installed runtime modules may register process-exit diagnostics. Keep this
// machine-readable scenario's stdout reserved for its single JSON result.
console.log = () => {};
console.warn = () => {};
console.error = () => {};

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function loadInstalledModule(installedRoot, relativePath) {
  return require(path.join(installedRoot, relativePath));
}

function parseCsvIdsAndPaths(content) {
  const records = [];
  let record = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      record.push(value);
      value = '';
    } else if (character === '\n' && !quoted) {
      record.push(value.replace(/\r$/, ''));
      if (record.some(Boolean)) records.push(record);
      record = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (value || record.length) {
    record.push(value.replace(/\r$/, ''));
    if (record.some(Boolean)) records.push(record);
  }

  const [header = [], ...rows] = records;
  const idIndex = header.indexOf('id');
  const pathIndex = header.indexOf('file_path');
  return rows.map((row) => ({ id: row[idIndex], filePath: row[pathIndex] }));
}

function presetCandidate() {
  return `# Installed Runtime Preset

## Metadata

\`\`\`yaml
preset:
  id: installed-runtime
  name: Installed Runtime
  version: 1.0.0
  description: Runtime facts extracted from the installed scenario source
  technologies:
    - Node.js
  suitable_for:
    - Local installed-package verification
  not_suitable_for:
    - Production deployment
\`\`\`

## Design Patterns

### Pattern 1: Explicit boundaries

**Purpose:** Keep installed-module and consumer paths explicit.

**Execution Score:** 9/10 | **Anti-Bug Score:** 9/10

\`\`\`javascript
const installedRoot = process.argv[2]
\`\`\`

**Bugs Eliminated:**

- Loading source-checkout modules accidentally

**Why It Works:**

- Every module path begins at the supplied installed root.

## Project Structure

\`\`\`text
consumer/
  .aexos-core/
\`\`\`

## Tech Stack

| Category | Technology | Version | Purpose |
| --- | --- | --- | --- |
| Runtime | Node.js | Installed version | Execute local verification |

## Coding Standards

Use explicit paths and fail closed on missing files.

### Good Example

\`\`\`javascript
require(path.join(installedRoot, modulePath))
\`\`\`

### Bad Example

\`\`\`javascript
require(modulePath)
\`\`\`

## Testing Strategy

Exercise real installed modules against an isolated consumer root.
`;
}

async function run() {
  const installedRoot = path.resolve(process.argv[2] || '');
  const consumerRoot = path.resolve(process.argv[3] || '');
  const assertions = [];
  const checks = {};

  assert.ok(process.argv[2], 'installedRoot argv is required');
  assert.ok(process.argv[3], 'consumerRoot argv is required');
  assert.ok(await pathExists(path.join(installedRoot, '.aexos-core')), 'installed .aexos-core is missing');
  await fs.mkdir(consumerRoot, { recursive: true });
  const scenarioRoot = await fs.mkdtemp(path.join(consumerRoot, 'installed-operational-'));

  try {
    await fs.cp(
      path.join(installedRoot, '.aexos-core'),
      path.join(scenarioRoot, '.aexos-core'),
      { recursive: true },
    );

    const templatePath = path.join(
      installedRoot,
      '.aexos-core/data/tech-presets/_template.md',
    );
    const template = await fs.readFile(templatePath, 'utf8');
    for (const heading of [
      '## Metadata',
      '## Design Patterns',
      '## Project Structure',
      '## Tech Stack',
      '## Coding Standards',
      '## Testing Strategy',
    ]) {
      assert.ok(template.includes(heading), `installed tech-preset template lacks ${heading}`);
    }
    assertions.push('installed tech-preset template exposes the required schema sections');

    const { addTechDoc } = loadInstalledModule(
      installedRoot,
      '.aexos-core/development/scripts/add-tech-doc.js',
    );
    const sourcePath = path.join(scenarioRoot, 'runtime documentation.txt');
    const candidatePath = path.join(scenarioRoot, 'extracted preset.md');
    const sourceContent = 'Node.js runs this local installed-package verification scenario.\n';
    await fs.writeFile(sourcePath, sourceContent, 'utf8');
    await fs.writeFile(candidatePath, presetCandidate(), 'utf8');

    const presetResult = await addTechDoc({
      projectRoot: scenarioRoot,
      filePath: sourcePath,
      presetName: 'installed-runtime',
      candidatePath,
    });
    const presetContent = await fs.readFile(presetResult.destinationPath, 'utf8');
    const expectedHash = crypto.createHash('sha256').update(sourceContent).digest('hex');
    assert.equal(presetResult.sourceHash, expectedHash);
    assert.match(presetContent, new RegExp(`sha256=${expectedHash}`));
    assertions.push('addTechDoc created a schema-valid preset with source SHA-256 provenance');

    const originalPreset = presetContent;
    await assert.rejects(
      addTechDoc({
        projectRoot: scenarioRoot,
        filePath: sourcePath,
        presetName: 'installed-runtime',
        candidatePath,
      }),
      /already exists/,
    );
    assert.equal(await fs.readFile(presetResult.destinationPath, 'utf8'), originalPreset);
    assertions.push('addTechDoc rejected a collision and preserved the existing preset byte-for-byte');

    await assert.rejects(
      addTechDoc({
        projectRoot: scenarioRoot,
        filePath: sourcePath,
        presetName: '../outside',
        candidatePath,
      }),
      /kebab-case/,
    );
    assert.equal(await pathExists(path.join(scenarioRoot, 'outside.md')), false);
    assertions.push('addTechDoc rejected preset-name traversal without an external write');
    checks.addTechDoc = {
      provenanceSha256: expectedHash,
      destination: path.relative(scenarioRoot, presetResult.destinationPath),
      collisionPreserved: true,
      traversalRejected: true,
    };

    const { ManifestGenerator } = loadInstalledModule(
      installedRoot,
      '.aexos-core/core/manifest/manifest-generator.js',
    );
    const { ManifestValidator } = loadInstalledModule(
      installedRoot,
      '.aexos-core/core/manifest/manifest-validator.js',
    );
    const generation = await new ManifestGenerator({ basePath: scenarioRoot }).generateAll();
    assert.deepEqual(generation.errors, []);
    for (const type of ['agents', 'workers', 'tasks']) {
      assert.equal(generation[type].success, true, `${type} manifest generation failed`);
      assert.equal(generation[type].errors.length, 0, `${type} manifest reported generation errors`);
    }

    const validation = await new ManifestValidator({ basePath: scenarioRoot }).validateAll();
    assert.equal(validation.summary.invalid, 0, JSON.stringify(validation));
    const manifestChecks = {};
    for (const type of ['agents', 'workers', 'tasks']) {
      const manifestPath = generation[type].path;
      const rows = parseCsvIdsAndPaths(await fs.readFile(manifestPath, 'utf8'));
      assert.equal(
        rows.length,
        generation[type].count,
        `${type} CSV row count does not match generator result`,
      );
      const ids = rows.map((row) => row.id);
      assert.equal(new Set(ids).size, ids.length, `${type} manifest contains duplicate IDs`);
      for (const row of rows) {
        assert.ok(row.filePath, `${type}:${row.id} has no consumer file path`);
        assert.ok(
          await pathExists(path.join(scenarioRoot, row.filePath)),
          `${type}:${row.id} points to missing ${row.filePath}`,
        );
      }
      manifestChecks[type] = { rows: rows.length, uniqueIds: true, consumerPathsExist: true };
    }
    assertions.push('real installed registry generated three valid manifests with unique IDs and existing consumer paths');
    checks.manifests = manifestChecks;

    const { WorkflowExecutor } = loadInstalledModule(
      installedRoot,
      '.aexos-core/core/orchestration/workflow-executor.js',
    );
    const storyPath = path.join(scenarioRoot, 'checkpoint-only.story.md');
    await fs.writeFile(
      storyPath,
      '# Checkpoint-only scenario\n\n```yaml\nstory_id: checkpoint-only\nstatus: Approved\n```\n',
      'utf8',
    );

    const seedExecutor = new WorkflowExecutor(scenarioRoot, { debug: false, useSessionState: false });
    await seedExecutor.initializeState(storyPath);
    seedExecutor.state.currentPhase = '6_checkpoint';
    await seedExecutor.saveState();

    const spawnedAgents = [];
    const waitingExecutor = new WorkflowExecutor(scenarioRoot, { debug: false, useSessionState: false });
    waitingExecutor.onAgentSpawn((agent, task) => spawnedAgents.push({ agent, task }));
    const waiting = await waitingExecutor.execute(storyPath);
    assert.equal(waiting.status, 'waiting_for_input');
    assert.equal(waiting.awaiting_input, true);
    assert.equal(waiting.state.currentPhase, '6_checkpoint');
    assert.equal(waiting.state.executor, undefined);
    assert.deepEqual(spawnedAgents, []);
    const stateFile = waitingExecutor.getStateFilePath(storyPath);
    assert.ok(await pathExists(stateFile), 'checkpoint state was not persisted');
    assertions.push('WorkflowExecutor persisted a waiting checkpoint without an executor or agent spawn');

    const resumedExecutor = new WorkflowExecutor(scenarioRoot, { debug: false, useSessionState: false });
    const resumedSpawns = [];
    let checkpointPhases = 0;
    resumedExecutor.onAgentSpawn((agent, task) => resumedSpawns.push({ agent, task }));
    resumedExecutor.onPhaseChange((phase) => {
      if (phase === '6_checkpoint') checkpointPhases += 1;
    });
    await resumedExecutor.submitCheckpointDecision(storyPath, 'GO');
    const completed = await resumedExecutor.execute(storyPath);
    assert.equal(completed.success, true);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.state.currentPhase, null);
    assert.equal(completed.phaseResults['6_checkpoint'].decision, 'GO');
    assert.equal(checkpointPhases, 1, 'checkpoint execution looped after GO');
    assert.deepEqual(resumedSpawns, []);
    assertions.push('reloaded checkpoint accepted GO and completed once without development, push, or provider execution');
    checks.workflowCheckpoint = {
      initialStatus: waiting.status,
      persisted: true,
      resumedStatus: completed.status,
      checkpointExecutionsAfterGo: checkpointPhases,
      agentSpawns: 0,
    };

    const workflowPath = path.join(scenarioRoot, '.aexos-core/development/workflows/brownfield-discovery.yaml');
    const dispatches = [];
    const declared = await new WorkflowExecutor(scenarioRoot, { dispatchSubagent: async payload => {
      assert(payload.prompt.includes(payload.phase.notes.trim().slice(0, 30)), 'Workflow instructions did not reach the dispatcher');
      dispatches.push({ phase: payload.phase.phase, step: payload.phase.step, agent: payload.agentId });
      const outputs = Array.isArray(payload.phase.creates) ? payload.phase.creates : [payload.phase.creates];
      for (const output of outputs.filter(Boolean)) {
        const concrete = output.replace('X.X-*', '1.1-discovery');
        const destination = path.join(scenarioRoot, concrete);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, `# Deterministic contract fixture\nStep: ${payload.phase.step}\n`);
      }
      return { status: payload.agentId === 'qa' ? 'APPROVED' : 'success', summary: 'Local deterministic adapter produced declared artifacts' };
    } }).executeWorkflow(workflowPath);
    assert.equal(declared.success, true, JSON.stringify(declared.errors));
    assert.equal(dispatches.length, 10, 'Eleven declared steps minus the absent database collection');
    assert.deepEqual(declared.skippedPhases, [2]);
    assert(dispatches.some(item => item.phase === 8), 'QA approval did not enable final assessment');
    assert(declared.outputs['10'].steps.epic_creation && declared.outputs['10'].steps.story_creation,
      'Repeated phase number lost one step result');
    assertions.push('installed brownfield YAML ran all applicable declared steps with real local output validation and QA-conditioned handoffs');
    checks.declaredWorkflow = { status: declared.status, dispatches, skippedPhases: declared.skippedPhases,
      boundary: 'Deterministic local adapter verifies orchestration contracts and artifacts, not LLM-authored analysis or a live provider.' };

    const MasterOrchestrator = loadInstalledModule(installedRoot, '.aexos-core/core/orchestration/master-orchestrator.js');
    const invokedTasks = [];
    const implementationPath = path.join(scenarioRoot, 'installed-calculation.cjs');
    const testPath = path.join(scenarioRoot, 'installed-calculation.test.cjs');
    const runImplementationTest = () => {
      const result = spawnSync(process.execPath, [testPath], {
        cwd: scenarioRoot, encoding: 'utf8', timeout: 10000, windowsHide: true,
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      return { exitCode: result.status, executable: process.execPath, args: [testPath] };
    };
    const master = new MasterOrchestrator(scenarioRoot, { storyId: 'INSTALLED-SPEC', autoRecovery: false,
      dashboardAutoUpdate: false, invokeAgent: async (_agent, task) => {
        invokedTasks.push(task.name);
        if (task.name === 'spec-write-spec') {
          const specPath = path.join(scenarioRoot, 'docs/stories/INSTALLED-SPEC/spec/spec.md');
          await fs.mkdir(path.dirname(specPath), { recursive: true });
          await fs.writeFile(specPath, '# Installed specification\n\nREQ-1: Exercise local execution contracts.\n');
          return { success: true, specPath };
        }
        if (task.name === 'spec-gather-requirements') return { success: true, requirements: ['REQ-1'] };
        if (task.name === 'spec-assess-complexity') return { success: true, complexity: 'STANDARD' };
        if (task.name === 'plan-create-implementation') {
          const planPath = path.join(scenarioRoot, 'docs/stories/INSTALLED-SPEC/plan/implementation.yaml');
          await fs.mkdir(path.dirname(planPath), { recursive: true });
          await fs.writeFile(planPath, 'storyId: INSTALLED-SPEC\nphases:\n  - id: 1\n    name: Implement\n    subtasks:\n      - id: "1.1"\n        description: Verify local calculation\n        status: pending\n');
          return { success: true, planPath };
        }
        if (task.name === 'plan-execute-subtask') {
          await fs.writeFile(implementationPath, 'module.exports = (a, b) => a + b;\n');
          await fs.writeFile(testPath, "const assert = require('node:assert/strict');\nconst add = require('./installed-calculation.cjs');\nassert.equal(add(19, 23), 42);\nassert.equal(add(-3, 3), 0);\n");
          return { success: true, verified: true, files: [implementationPath, testPath], evidence: runImplementationTest() };
        }
        if (task.name === 'run-tests') return { success: true, passed: true, ...runImplementationTest() };
        if (task.name === 'qa-review-story') {
          runImplementationTest();
          const reviewedRevision = crypto.createHash('sha256').update(await fs.readFile(implementationPath)).digest('hex');
          const gatePath = path.join(scenarioRoot, 'docs/qa/gates/INSTALLED-SPEC.yaml');
          await fs.mkdir(path.dirname(gatePath), { recursive: true });
          await fs.writeFile(gatePath, `schema: 1\nstory: INSTALLED-SPEC\ngate: PASS\nreviewer: installed-local-contract-scenario\nreviewed_revision: sha256:${reviewedRevision}\n`);
          return { success: true, gate: 'PASS', gatePath };
        }
        if (['spec-research-dependencies', 'spec-critique'].includes(task.name)) return { success: true };
        throw new Error(`No local contract adapter configured for ${task.name}`);
      } });
    await master.initialize();
    const specResult = await master.executeEpic(3);
    await master.dashboardIntegration.drain();
    assert.equal(specResult.success, true, JSON.stringify(specResult));
    assert.equal(invokedTasks.length, 5);
    assert((await fs.stat(specResult.result.specPath)).size > 0);
    assert.equal(master.getAgentInvoker().getInvocations().length, 5);
    assertions.push('installed master executed the five canonical spec tasks through its adapter and verified a real specification');
    checks.masterSpec = { status: 'passed', invokedTasks: [...invokedTasks],
      boundary: 'Real installed master, AgentInvoker and Epic3; local deterministic callback, no model provider.' };

    const implementation = await master.executeEpic(4);
    assert.equal(implementation.success, true, JSON.stringify(implementation));
    assert.deepEqual(implementation.result.progress, { total: 1, completed: 1, failed: 0 });
    assert.equal(implementation.result.testResults.exitCode, 0);
    assert.match(await fs.readFile(implementation.result.planPath, 'utf8'), /status: completed/);
    assertions.push('installed master executed implementation planning, persisted subtask completion and ran a real Node test process');
    const review = await master.executeEpic(6);
    await master.dashboardIntegration.drain();
    assert.equal(review.success, true, JSON.stringify(review));
    assert.equal(review.result.passed, true);
    const sourceHash = crypto.createHash('sha256').update(await fs.readFile(implementationPath)).digest('hex');
    assert.match(await fs.readFile(review.result.gatePath, 'utf8'), new RegExp(`reviewed_revision: sha256:${sourceHash}`));
    assertions.push('installed QA executor consumed a real gate tied to the tested implementation content hash');
    checks.masterImplementationAndReview = { status: 'passed', invokedTasks: invokedTasks.slice(5),
      testExitCode: implementation.result.testResults.exitCode, reviewedContentSha256: sourceHash,
      boundary: 'Real installed Epic4/Epic6, plan persistence, Node child test and QA artifact. Deterministic local adapter; no live model, publication or external QA.' };

    const errors = loadInstalledModule(installedRoot, '.aexos-core/core/errors');
    for (const name of ['AEXOSError', 'AIOXError', 'CYRYXError']) {
      assert.equal(typeof errors[name], 'function', `Missing public error constructor ${name}`);
      const actual = new errors[name]('Installed error contract');
      assert.equal(actual.toJSON().message, 'Installed error contract');
      assert.equal(errors.isAEXOSError(actual), true);
    }
    const mcpPaths = loadInstalledModule(installedRoot, '.aexos-core/core/mcp/os-detector');
    for (const name of ['getGlobalAexosDir', 'getGlobalAioxDir', 'getGlobalCyryxDir']) {
      assert.equal(typeof mcpPaths[name], 'function', `Missing public MCP path export ${name}`);
      assert.equal(mcpPaths[name](), path.join(require('node:os').homedir(), '.aexos'));
    }
    const projectChecks = loadInstalledModule(installedRoot, '.aexos-core/core/health-check/checks/project');
    for (const name of ['AexosDirectoryCheck', 'AioxDirectoryCheck', 'CyryxDirectoryCheck']) {
      assert.equal(typeof projectChecks[name], 'function', `Missing public project check ${name}`);
      assert.equal(new projectChecks[name]().id, 'project.aexos-directory');
    }
    assert.equal(Object.values(projectChecks).map(Check => new Check()).filter(check => check.id === 'project.aexos-directory').length, 1);
    assertions.push('installed public error, MCP path and project-check interfaces expose canonical and compatible names without duplicate registration');
    checks.publicInterfaces = { canonicalNamespace: 'AEXOS', legacyAliases: ['AIOX', 'CYRYX'], uniqueDirectoryCheck: true };

    const toolResolver = loadInstalledModule(installedRoot, '.aexos-core/infrastructure/scripts/tool-resolver');
    const definitionPaths = toolResolver.listAvailableTools();
    assert.equal(new Set(definitionPaths.map(file => path.resolve(file))).size, definitionPaths.length);
    const expectedToolIds = ['21st-dev-magic', 'browser', 'clickup', 'context7', 'desktop-commander', 'exa',
      'ffmpeg', 'github-cli', 'google-workspace', 'llm-routing', 'n8n', 'railway-cli', 'supabase', 'supabase-cli'];
    const definitions = await Promise.all(definitionPaths.map(file => toolResolver.resolveTool(path.basename(file, '.yaml'))));
    assert.deepEqual(definitions.map(tool => tool.id).sort(), expectedToolIds);
    assert(definitions.every(tool => tool._healthStatus === 'not_checked'));
    const routingDefinition = definitions.find(tool => tool.id === 'llm-routing');
    assert.equal(routingDefinition.type, 'cli');
    assert.equal(routingDefinition.installation.script, '.aexos-core/infrastructure/scripts/llm-routing/install-llm-routing.js');
    assert(routingDefinition.capabilities.length > 0);
    assert(routingDefinition.usage['claude-max']);
    assert(routingDefinition.health_check.windows.includes('where claude-free.cmd'));
    assertions.push('all fourteen packaged tool definitions resolve through actual discovery, preserve routing operational metadata and remain unexecuted by default');
    checks.toolCatalog = { ids: expectedToolIds, duplicates: false, routingMetadataRetained: true,
      boundary: 'Actual packaged YAML discovery and resolver/schema execution. No tool installation, provider, authentication or live service execution.' };
    const toolCases = [
      ['clickup', 'create_task', { name: 'Task', list_id: '12345678' }, { list_id: '123' }],
      ['google-workspace', 'create_file', { name: 'file.txt', content: 'data' }, { name: 'file.txt' }],
      ['n8n', 'execute_workflow', { workflow_id: 'wf_123' }, {}],
      ['supabase', 'execute_sql', { project_id: 'proj_123', query: 'SELECT 1' }, { project_id: 'proj_123', query: 'DROP DATABASE production' }],
    ];
    for (const [tool, command, accepted, rejected] of toolCases) {
      assert.equal((await toolResolver.validateCommand(tool, command, accepted)).valid, true);
      const denial = await toolResolver.validateCommand(tool, command, rejected);
      assert.equal(denial.valid, false);
      assert(denial.errors.length > 0);
    }
    assert.deepEqual(await toolResolver.executeHelper('clickup', 'format-assignee-for-create', { assignees: 456 }), [456]);
    assert.equal(await toolResolver.executeHelper('google-workspace', 'parse-drive-file-id', { input: 'https://drive.google.com/file/d/FILE_123/view' }), 'FILE_123');
    assert.equal((await toolResolver.validateCommand('github-cli', 'unconfigured', {})).valid, true);
    assertions.push('installed executable-knowledge API resolves packaged tools and runs four positive/negative validators plus actual data helpers');
    checks.executableKnowledge = { tools: toolCases.map(([tool]) => tool), validators: 8, helpers: 2,
      boundary: 'Actual package-owned YAML execution through the resolver API. No MCP/provider call or automatic host interception.' };

    const healthMarker = path.join(scenarioRoot, 'explicit-health-execution.txt');
    const processHealth = { id: 'installed-local-process', health_check: {
      method: 'command', command: process.execPath,
      args: ['-e', `require('fs').writeFileSync(${JSON.stringify(healthMarker)}, 'executed')`],
    } };
    assert.equal((await toolResolver.inspectHealth(processHealth)).status, 'not_checked');
    assert.equal(await pathExists(healthMarker), false);
    assert.equal(await toolResolver.checkHealth(processHealth, { execute: true }), true);
    assert.equal(await fs.readFile(healthMarker, 'utf8'), 'executed');
    assert.equal(await toolResolver.checkHealth({ health_check: {
      method: 'command', command: process.execPath, args: ['-e', 'process.exit(9)'],
    } }, { execute: true }), false);
    assert.equal((await toolResolver.resolveTool('context7'))._healthStatus, 'not_checked');
    assert.equal((await toolResolver.resolveTool('context7', { health: { execute: true } }))._healthStatus, 'unavailable');
    const healthCalls = [];
    const checkedContext7 = await toolResolver.resolveTool('context7', { health: {
      execute: true, mcpExecutor: async request => { healthCalls.push(request); return true; },
    } });
    assert.equal(checkedContext7._healthStatus, 'healthy');
    assert.equal(healthCalls[0].toolId, 'context7');
    assert.equal(healthCalls[0].command, 'resolve-library-id');
    assert.equal((await toolResolver.resolveTool('context7'))._healthStatus, 'not_checked');
    let healthRequests = 0;
    const healthServer = http.createServer((request, response) => {
      healthRequests++;
      response.statusCode = request.url === '/ready' ? 200 : 503;
      response.end('local health fixture');
    });
    await new Promise((resolve, reject) => {
      healthServer.once('error', reject);
      healthServer.listen(0, '127.0.0.1', resolve);
    });
    const healthEndpoint = `http://127.0.0.1:${healthServer.address().port}`;
    try {
      const httpHealth = { health_check: { method: 'http', endpoint: `${healthEndpoint}/ready` } };
      assert.equal(await toolResolver.checkHealth(httpHealth), false);
      assert.equal(healthRequests, 0);
      assert.equal(await toolResolver.checkHealth(httpHealth, { execute: true }), true);
      httpHealth.health_check.endpoint = `${healthEndpoint}/unavailable`;
      assert.equal(await toolResolver.checkHealth(httpHealth, { execute: true }), false);
      assert.equal(healthRequests, 2);
    } finally {
      healthServer.closeAllConnections();
      await new Promise(resolve => healthServer.close(resolve));
    }
    assertions.push('installed tool health requires explicit execution, observes real process and HTTP failures, recognizes nested MCP checks and never caches successful health');
    checks.toolHealth = { processReadBack: true, failedExitRejected: true, loopbackHttpRequests: healthRequests,
      nestedMcpCommand: healthCalls[0].command, noExecutorStatus: 'unavailable', unrequestedStatus: 'not_checked',
      boundary: 'Actual installed resolver, child Node process and loopback HTTP server. Explicit MCP adapter is a deterministic local fixture, not evidence of Context7 service availability.' };

    const { SquadDownloader } = loadInstalledModule(installedRoot,
      '.aexos-core/development/scripts/squad/squad-downloader');
    const squadsRoot = path.join(scenarioRoot, 'downloaded-squads');
    const squadName = 'installed-squad';
    const manifestText = `name: ${squadName}\nversion: 1.0.0\n`;
    const registryUrl = 'https://fixtures.invalid/registry.json';
    const contentApiBase = 'https://fixtures.invalid/contents/packages';
    const manifestUrl = 'https://fixtures.invalid/installed-squad.yaml';
    const catalog = { version: '1.0.0', squads: { official: [{ name: squadName, version: '1.0.0' }], community: [] } };
    let suppliedCatalog = catalog;
    let suppliedManifest = manifestText;
    let suppliedEntries = [{ type: 'file', name: 'squad.yaml', download_url: manifestUrl }];
    const requestedUrls = [];
    const downloader = new SquadDownloader({ squadsPath: squadsRoot, overwrite: true,
      registryUrl, contentApiBase, contentDownloadOrigins: ['https://fixtures.invalid'] });
    // The unavailable public registry is a separate acceptance obligation. This
    // controlled transport exercises the actual installed downloader, validator,
    // manifest loader and filesystem transaction without a remote service.
    downloader._fetch = async (url) => {
      requestedUrls.push(url);
      if (url === registryUrl) return Buffer.from(JSON.stringify(suppliedCatalog));
      if (url === `${contentApiBase}/${squadName}`) return Buffer.from(JSON.stringify(suppliedEntries));
      if (url === manifestUrl) return Buffer.from(suppliedManifest);
      throw new Error(`Unexpected fixture request: ${url}`);
    };
    await assert.rejects(() => downloader.download(`${squadName}@2.0.0`), error => error.code === 'VERSION_NOT_FOUND');
    const download = await downloader.download(`${squadName}@1.0.0`);
    assert.equal(download.validation.valid, true);
    assert.equal(download.manifest.name, squadName);
    assert.equal(download.manifest.version, '1.0.0');
    assert.equal(await fs.readFile(path.join(download.path, 'squad.yaml'), 'utf8'), manifestText);
    const customPath = path.join(download.path, 'owner-note.txt');
    await fs.writeFile(customPath, 'Keep this existing squad intact when replacement validation fails.');
    suppliedManifest = 'name: installed-squad\nversion: [invalid]\n';
    await assert.rejects(() => downloader.download(squadName));
    assert.equal(await fs.readFile(path.join(download.path, 'squad.yaml'), 'utf8'), manifestText);
    assert.match(await fs.readFile(customPath, 'utf8'), /Keep this existing squad intact/);
    suppliedManifest = manifestText;
    suppliedEntries = [{ type: 'file', name: '../escape.txt', download_url: manifestUrl }];
    await assert.rejects(() => downloader.download(squadName));
    assert.equal(await pathExists(path.join(squadsRoot, 'escape.txt')), false);
    assert.equal(await fs.readFile(path.join(download.path, 'squad.yaml'), 'utf8'), manifestText);
    suppliedCatalog = {};
    downloader.clearCache();
    await assert.rejects(() => downloader.listAvailable());
    assert.equal(downloader._registryCache, null);
    assertions.push('installed squad downloader validates real manifests, rejects unavailable versions and traversal, and preserves existing files after failed replacement');
    checks.squadDownload = { requestedUrls, explicitVersionRejected: true, manifestReadBack: true,
      malformedCatalogRejected: true, failedReplacementPreserved: true, traversalRejected: true,
      boundary: 'Actual installed downloader, SquadValidator, SquadLoader and filesystem; controlled response buffers replace HTTPS transport. No live catalog, sync service or provider acceptance.' };

    const { SquadPublisher } = loadInstalledModule(installedRoot, '.aexos-core/development/scripts/squad/squad-publisher');
    const publisher = new SquadPublisher();
    const publicationRoot = path.join(scenarioRoot, 'publication-local-contract');
    await fs.mkdir(publicationRoot);
    const registryPath = path.join(publicationRoot, 'registry.json');
    const originalRegistry = { version: '1.0.0', custom: { preserve: true }, squads: {
      official: [{ name: squadName, version: '0.9.0', provenance: 'preserve' }],
      community: [{ name: 'another-squad', version: '2.0.0' }],
    } };
    await fs.writeFile(registryPath, JSON.stringify(originalRegistry));
    await publisher._updateRegistry(registryPath, download.manifest, 'official');
    const updatedRegistry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
    assert.deepEqual(updatedRegistry.custom, originalRegistry.custom);
    assert.deepEqual(updatedRegistry.squads.community, originalRegistry.squads.community);
    assert.equal(updatedRegistry.squads.official[0].version, '1.0.0');
    assert.equal(updatedRegistry.squads.official[0].provenance, 'preserve');
    const malformedRegistry = '{ deliberately malformed registry';
    await fs.writeFile(registryPath, malformedRegistry);
    await assert.rejects(() => publisher._updateRegistry(registryPath, download.manifest));
    assert.equal(await fs.readFile(registryPath, 'utf8'), malformedRegistry);
    await publisher._copyDir(download.path, path.join(publicationRoot, 'payload'));
    assert.equal(await fs.readFile(path.join(publicationRoot, 'payload/squad.yaml'), 'utf8'), manifestText);
    const preview = publisher.generatePRBody(download.manifest, 'official');
    assert(preview.includes(`## New Squad: ${squadName}`));
    assert(preview.includes('**Category:** official'));
    assertions.push('installed squad publisher preserves catalog metadata, applies the requested category, rejects corrupt registries and prepares actual local payload bytes');
    checks.squadPublicationPreparation = { manifestReadBack: true, officialCategoryApplied: true,
      unrelatedMetadataPreserved: true, corruptRegistryPreserved: true,
      boundary: 'Actual installed local payload, registry and PR-body preparation only. No authentication check, GitHub subprocess, fork, push or pull request was performed.' };

    const agentParser = loadInstalledModule(installedRoot, '.aexos-core/infrastructure/scripts/ide-sync/agent-parser');
    const agentDefinitions = agentParser.parseAllAgents(path.join(installedRoot, '.aexos-core/development/agents'));
    const devopsDefinition = agentDefinitions.find(agent => agent.filename === 'devops.md');
    const gitignoreDependency = devopsDefinition.dependencies.utils.find(name => name.endsWith('gitignore-generator.js'));
    assert.equal(gitignoreDependency, 'documentation-integrity/gitignore-generator.js');
    const gitignoreGenerator = loadInstalledModule(installedRoot, `.aexos-core/infrastructure/scripts/${gitignoreDependency}`);
    const gitignoreConsumer = path.join(scenarioRoot, 'gitignore-consumer');
    await fs.mkdir(gitignoreConsumer);
    const gitignorePath = path.join(gitignoreConsumer, '.gitignore');
    const customRules = '# owner rules\nowner-cache/\n';
    await fs.writeFile(gitignorePath, customRules);
    const gitignoreGeneration = gitignoreGenerator.generateGitignoreFile(gitignoreConsumer, { hasPackageJson: true });
    assert.equal(gitignoreGeneration.success, true);
    assert.equal(gitignoreGeneration.mode, 'merged');
    const mergedRules = await fs.readFile(gitignorePath, 'utf8');
    assert(mergedRules.includes(customRules.trim()));
    assert(mergedRules.includes('AEXOS Integration Section'));
    assert.equal(gitignoreGenerator.generateGitignoreFile(gitignoreConsumer, { hasPackageJson: true }).success, true);
    assert.equal(await fs.readFile(gitignorePath, 'utf8'), mergedRules);
    assertions.push('installed DevOps declaration resolves its real gitignore generator and merges rules with owner preservation and idempotent rerun');
    checks.agentDependencyExecution = { agent: 'devops', dependency: gitignoreDependency,
      ownerRulesPreserved: true, idempotent: true,
      boundary: 'Actual packaged agent parser, declared dependency, canonical generator/templates and file readback. No live agent host or Git operation.' };

    const nextTask = await fs.readFile(path.join(installedRoot, '.aexos-core/development/tasks/next.md'), 'utf8');
    const nextSteps = [3, 4, 5].map(number => {
      const section = nextTask.split(`### Step ${number}:`)[1];
      const match = section && /```javascript\r?\n([\s\S]*?)```/.exec(section);
      assert(match, `Installed next task is missing executable Step ${number}`);
      return match[1];
    });
    const { SuggestionEngine } = loadInstalledModule(installedRoot,
      '.aexos-core/workflow-intelligence/engine/suggestion-engine.js');
    const nextFormatter = loadInstalledModule(installedRoot,
      '.aexos-core/workflow-intelligence/engine/output-formatter.js');
    const nextCases = [];
    for (const storyStatus of ['blocked', 'unknown']) {
      let displayed;
      const context = { agentId: 'dev', lastCommands: [], projectState: {
        storyStatus, qaStatus: 'unknown', ciStatus: 'unknown', hasUncommittedChanges: false,
      } };
      await vm.runInNewContext(`(async () => { ${nextSteps.join('\n')} })()`, {
        path, projectRoot: installedRoot, args: { all: true }, context,
        engine: new SuggestionEngine({ useLearnedPatterns: false }),
        require: target => {
          assert(path.resolve(target).startsWith(installedRoot + path.sep));
          if (target.endsWith('output-formatter.js')) return {
            displaySuggestions: result => { displayed = result; nextFormatter.displaySuggestions(result); },
          };
          return require(target);
        },
      }, { timeout: 10000 });
      const expected = storyStatus === 'blocked' ? '*orchestrate-status' : '*next';
      assert.equal(displayed.suggestions[0].command, expected);
      assert.equal(displayed.suggestions.filter(item => item.command === expected).length, 1);
      nextCases.push({ storyStatus, command: expected, occurrences: 1 });
    }
    assertions.push('installed next task executes its documented module imports and recommendation/formatting steps, deduplicates blocked-state handoff and retains unknown-state guidance');
    checks.nextTask = { cases: nextCases,
      boundary: 'Actual packaged Markdown Steps 3–5, state manager, suggestion engine and formatter; explicit local contexts. No live host or model execution.' };

    return { success: true, assertions, checks, isolated_consumer: scenarioRoot };
  } finally {
    if (process.env.AEXOS_PARITY_KEEP_WORK !== '1') await fs.rm(scenarioRoot, { recursive: true, force: true });
  }
}

run()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  })
  .catch((error) => {
    process.stdout.write(`${JSON.stringify({
      success: false,
      assertions: [],
      checks: {},
      error: error.message,
    })}\n`);
    process.exitCode = 1;
  });
