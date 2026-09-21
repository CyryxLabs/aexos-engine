#!/usr/bin/env node
'use strict';

// Link measured installed journeys to upstream obligations without promoting
// those obligations to complete semantic or cross-environment acceptance.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { ROOT, OUTPUT, readJson, writeJson, sha256, candidateIdentity } = require('./lib');

const COVERAGE = {
  'installed-public-command-routing': ['bin/aiox.js', '.aiox-core/cli/index.js'],
  'installed-public-document-generation': [
    'bin/aiox.js', '.aiox-core/cli/commands/generate/index.js',
    '.aiox-core/product/templates/engine/index.js',
  ],
  'installed-public-mcp-configuration': [
    'bin/aiox.js', '.aiox-core/cli/commands/mcp/index.js',
    '.aiox-core/cli/commands/mcp/setup.js', '.aiox-core/cli/commands/mcp/add.js',
    '.aiox-core/cli/commands/mcp/status.js', '.aiox-core/cli/commands/mcp/link.js',
    '.aiox-core/core/mcp/global-config-manager.js', '.aiox-core/core/mcp/symlink-manager.js',
  ],
  'standalone-distribution-contracts': [
    'packages/installer/package.json', 'packages/aiox-install/package.json',
    'packages/aiox-pro-cli/package.json', 'compat/aiox-core/package.json',
  ],
  'installed-presets-manifests-checkpoint': [
    '.aiox-core/core/manifest/manifest-generator.js', '.aiox-core/core/manifest/manifest-validator.js',
    '.aiox-core/core/orchestration/workflow-executor.js',
    '.aiox-core/core/orchestration/workflow-orchestrator.js',
    '.aiox-core/core/orchestration/subagent-prompt-builder.js',
    '.aiox-core/core/orchestration/master-orchestrator.js',
    '.aiox-core/core/orchestration/agent-invoker.js',
    '.aiox-core/core/orchestration/executors/epic-3-executor.js',
    '.aiox-core/core/orchestration/executors/epic-4-executor.js',
    '.aiox-core/core/orchestration/executors/epic-6-executor.js',
    '.aiox-core/core/errors/aiox-error.js', '.aiox-core/core/errors/index.js',
    '.aiox-core/core/mcp/os-detector.js', '.aiox-core/core/health-check/checks/project/index.js',
    '.aiox-core/infrastructure/scripts/tool-resolver.js',
    '.aiox-core/infrastructure/scripts/tool-helper-executor.js',
    '.aiox-core/infrastructure/scripts/tool-validation-helper.js',
    ...['github-cli', 'llm-routing', 'railway-cli', 'supabase-cli'].map(name => `.aiox-core/infrastructure/tools/cli/${name}.yaml`),
    '.aiox-core/infrastructure/tools/local/ffmpeg.yaml',
    '.aiox-core/development/scripts/squad/squad-downloader.js',
    '.aiox-core/development/scripts/squad/squad-validator.js',
    '.aiox-core/development/scripts/squad/squad-loader.js',
    '.aiox-core/development/scripts/squad/squad-publisher.js',
    '.aiox-core/development/agents/devops.md',
    '.aiox-core/development/tasks/next.md',
    '.aiox-core/development/scripts/workflow-state-manager.js',
    '.aiox-core/workflow-intelligence/engine/suggestion-engine.js',
    '.aiox-core/workflow-intelligence/engine/output-formatter.js',
    '.aiox-core/infrastructure/scripts/documentation-integrity/gitignore-generator.js',
    ...['21st-dev-magic', 'browser', 'clickup', 'context7', 'desktop-commander', 'exa', 'google-workspace', 'n8n', 'supabase'].map(name => `.aiox-core/infrastructure/tools/mcp/${name}.yaml`),
  ],
  'installed-locale-ide-recovery-decision-session-public-artifact': [
    'packages/installer/src/wizard/i18n.js', 'packages/installer/src/wizard/questions.js',
    'packages/installer/src/wizard/ide-config-generator.js', 'packages/installer/src/wizard/pro-setup.js',
    '.aiox-core/development/scripts/decision-recorder.js', '.aiox-core/development/scripts/dev-context-loader.js',
    '.aiox-core/development/scripts/greeting-preference-manager.js', '.aiox-core/core/synapse/utils/atomic-write.js',
    '.aiox-core/infrastructure/scripts/pr-review-ai.js',
    '.aiox-core/infrastructure/scripts/aiox-validator.js', '.aiox-core/utils/aiox-validator.js',
  ],
  'installed-update-and-restart-dependency-recovery': ['packages/installer/src/updater/index.js'],
  'installed-published-release-transition': ['packages/installer/src/updater/index.js'],
  'installed-skills-ci-smoke': ['scripts/e2e/installed-skills-smoke.js'],
  'isolated-global-prefix-shim-and-project-install': ['bin/aiox.js'],
  'installed-managed-uninstall-preservation': ['bin/aiox.js'],
  'installed-auxiliary-scoped-package-bootstrap': ['packages/aiox-install/src/installer.js'],
  'installed-auxiliary-unpacked-migration': ['packages/aiox-install/src/installer.js'],
  'installed-auxiliary-legacy-package-migration': ['packages/aiox-install/src/installer.js'],
  'installed-statusline-setup-telemetry-preservation': ['.claude/setup/install.sh', '.claude/setup/settings.json', '.claude/setup/statusline-custom.sh'],
  'fresh-installed-agent-activation-context-authority': [
    '.synapse/manifest', '.synapse/agent-devops',
    '.aiox-core/development/scripts/generate-greeting.js',
    '.aiox-core/development/scripts/unified-activation-pipeline.js',
  ],
  'fresh-claude-protection-and-explicit-choice': [
    'packages/installer/src/wizard/index.js',
    'packages/installer/src/config/configure-environment.js',
  ],
  'doctor-after-install-and-recovery': [
    '.aiox-core/core/doctor/index.js',
  ],
  'installed-protection-and-publication-authority': [
    '.claude/hooks/enforce-git-push-authority.cjs',
    '.aiox-core/infrastructure/scripts/generate-settings-json.js',
    '.aiox-core/infrastructure/templates/grok-hooks/enforce-git-push-authority.cjs',
  ],
  'config-migration-roundtrip-customization-preservation': [
    '.aiox-core/cli/commands/config/index.js',
    '.aiox-core/core/config/config-resolver.js',
  ],
  'updater-backup-restore-after-injected-corruption': [
    'packages/installer/src/updater/index.js',
  ],
  'synapse-package-context-manifest-session': [
    '.aiox-core/core/synapse/runtime/hook-runtime.js',
    '.claude/hooks/synapse-engine.cjs',
  ],
  'grok-install-reinstall-customization-preservation': [
    '.aiox-core/infrastructure/scripts/grok-skills-sync/index.js',
    '.aiox-core/infrastructure/scripts/grok-skills-sync/validate.js',
  ],
  'claude-public-helpers-templates-reinstall': [
    '.claude/commands/AIOX/scripts/session-context-loader.js',
    ...Object.keys(require('./sync-claude-templates').PROJECTION_MAP).map(name => `.claude/templates/${name}`),
  ],
};

function isOutsideRoot(candidate, root = ROOT) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative.startsWith('..') || path.isAbsolute(relative);
}

function resolveJourneyEvidence(installed, journey, root = ROOT) {
  assert(journey && typeof journey.consumer_binding_id === 'string' && journey.consumer_binding_id,
    `Missing consumer binding: ${journey?.name || 'unknown journey'}`);
  assert(typeof journey.isolated_consumer === 'string' && path.isAbsolute(journey.isolated_consumer),
    `Missing explicit isolated consumer: ${journey.name}`);
  const matches = (installed.consumer_bindings || []).filter(item => item.id === journey.consumer_binding_id);
  assert.equal(matches.length, 1, `Invalid consumer binding: ${journey.name}`);
  const binding = matches[0];
  for (const key of ['consumer_path', 'consumer_realpath', 'package_root', 'package_realpath']) {
    assert(isOutsideRoot(binding[key], root), `Consumer binding ${key} is not isolated: ${journey.name}`);
  }
  for (const key of ['package_json_sha256', 'cli_sha256', 'artifact_sha256']) {
    assert.match(binding[key] || '', /^[a-f0-9]{64}$/, `Invalid consumer binding ${key}: ${journey.name}`);
  }
  assert.equal(binding.observed_exists, true, `Consumer was not observed: ${journey.name}`);
  assert(!Number.isNaN(Date.parse(binding.observed_at)), `Invalid consumer observation time: ${journey.name}`);
  assert.equal(binding.artifact_sha256, installed.artifact.sha256, `Consumer artifact mismatch: ${journey.name}`);
  assert.equal(journey.isolated_consumer, binding.consumer_realpath, `Consumer realpath mismatch: ${journey.name}`);

  assert(Array.isArray(journey.step_labels) && journey.step_labels.length > 0,
    `Missing journey step bindings: ${journey.name}`);
  assert.equal(new Set(journey.step_labels).size, journey.step_labels.length,
    `Duplicate journey step binding: ${journey.name}`);
  const executionSteps = journey.step_labels.map((label) => {
    const steps = installed.steps.filter(step => step.label === label);
    assert.equal(steps.length, 1, `Invalid journey step binding ${label}: ${journey.name}`);
    const step = steps[0];
    assert.equal(step.exit_code, step.expected_exit_code ?? 0, label);
    assert.equal(sha256(fs.readFileSync(step.log_path)), step.log_sha256, `Changed log: ${label}`);
    return {
      label: step.label,
      exit_code: step.exit_code,
      expected_exit_code: step.expected_exit_code ?? 0,
      log_path: step.log_path,
      log_sha256: step.log_sha256,
    };
  });
  return { isolated_consumer: journey.isolated_consumer, consumer_binding: binding, execution_steps: executionSteps };
}

function collect() {
  const installedPath = path.join(OUTPUT, 'evidence/installed.json');
  const installed = readJson(installedPath);
  const candidate = candidateIdentity();
  const inventory = readJson(path.join(OUTPUT, 'capabilities.json'));
  assert.equal(installed.status, 'passed', 'Installed run failed, incomplete or stale');
  assert.equal(installed.candidate_unchanged, true);
  assert.equal(installed.candidate.tree_digest, candidate.tree_digest, 'Source changed since installation');
  assert.equal(installed.upstream_commit, inventory.upstream.commit);
  assert.equal(sha256(fs.readFileSync(installed.artifact.path)), installed.artifact.sha256);
  for (const step of installed.steps) {
    assert.equal(step.exit_code, step.expected_exit_code ?? 0, step.label);
    assert.equal(sha256(fs.readFileSync(step.log_path)), step.log_sha256, `Changed log: ${step.label}`);
  }
  const results = [];
  for (const [name, upstreamPaths] of Object.entries(COVERAGE)) {
    const journey = installed.journeys.find(item => item.name === name);
    assert(journey && journey.status === 'passed' && journey.assertions > 0, `Missing journey: ${name}`);
    const journeyEvidence = resolveJourneyEvidence(installed, journey);
    for (const upstreamPath of upstreamPaths) {
      const cap = inventory.capabilities.find(item => item.contract === 'complete-artifact-contract' && item.upstream.paths.includes(upstreamPath));
      assert(cap, `No upstream obligation: ${upstreamPath}`);
      assert(cap.aexos.required_artifacts.every(file => installed.packaged_paths.includes(file)));
      results.push({ capability_id: cap.id, scenario: 'installed', environment: 'windows-node',
        status: 'passed', exit_code: 0, assertions: journey.assertions,
        command: 'node scripts/parity/installed.js', input: { journey: name, source: installedPath },
        output: { journey, installed_report_sha256: sha256(fs.readFileSync(installedPath)) },
        candidate_digest: candidate.tree_digest, upstream_commit: installed.upstream_commit,
        artifact_sha256: installed.artifact.sha256, artifact_path: installed.artifact.path,
        ...journeyEvidence, packaged_paths: installed.packaged_paths,
        coverage_scope: 'partial',
        coverage_limit: 'Only this named Windows installed journey; full artifact contract, other scenarios and live hosts remain unverified.',
      });
    }
  }
  const executionPath = path.join(OUTPUT, 'evidence/execution-installed.json');
  writeJson(executionPath, { schema_version: 1, kind: 'aexos-parity-execution', candidate,
    upstream_commit: installed.upstream_commit, results });
  const executionHash = sha256(fs.readFileSync(executionPath));
  const records = results.map(result => ({ ...result, evidence_path: path.relative(ROOT, executionPath).replace(/\\/g, '/'), evidence_sha256: executionHash }));
  writeJson(path.join(OUTPUT, 'acceptance-evidence.json'), {
    schema_version: 1, candidate, upstream_commit: installed.upstream_commit, records,
    semantic_reconciliation_complete: false,
    acceptance_status: 'INCOMPLETE — measured journeys are linked; no capability is promoted to complete acceptance',
    excluded_private_pro: readJson(path.join(OUTPUT, 'scope-exceptions.json')).exceptions,
  });
  console.log(JSON.stringify({ linked_records: records.length, accepted_capabilities: 0, status: 'INCOMPLETE' }));
}

if (require.main === module) {
  try { collect(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { collect, COVERAGE, resolveJourneyEvidence };
