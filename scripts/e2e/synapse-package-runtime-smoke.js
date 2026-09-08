#!/usr/bin/env node
'use strict';

// AEX-4.17: run after installing an exact local TGZ in a fresh npm-only consumer.
// Usage: node scripts/e2e/synapse-package-runtime-smoke.js <installed-core> <work-dir>
// Retains its unique fixture for inspection; never edits the supplied installation.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hookRelative = '.aexos-core/core/synapse/runtime/hook-runtime.js';
let fixture;
let observation = {};

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..'
    && !relative.startsWith(`..${path.sep}`));
}

function inventory(root, prefix = '') {
  const entries = {};
  for (const name of fs.readdirSync(root).sort()) {
    const file = path.join(root, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      entries[relative] = { link: fs.readlinkSync(file) };
    } else if (stat.isDirectory()) {
      entries[`${relative}/`] = { directory: true };
      Object.assign(entries, inventory(file, relative));
    } else {
      assert(stat.isFile(), `Unexpected special file: ${relative}`);
      entries[relative] = { sha256: sha256(fs.readFileSync(file)), mode: stat.mode };
    }
  }
  return entries;
}

function write(relative, content) {
  const file = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

async function main() {
  assert.equal(process.argv.length, 4,
    'Usage: node synapse-package-runtime-smoke.js <installed-core> <existing-work-dir>');
  assert(!process.env.NODE_PATH && !process.env.NODE_OPTIONS,
    'Run with NODE_PATH and NODE_OPTIONS unset to avoid ambient module injection');
  const installed = fs.realpathSync(process.argv[2]);
  const modules = path.resolve(installed, '..', '..');
  assert.equal(path.basename(installed), 'core', 'Expected installed @aexos/core');
  assert.equal(path.basename(path.dirname(installed)), '@aexos');
  assert.equal(path.basename(modules), 'node_modules', 'Supply an npm installation, not source');
  assert.equal(fs.realpathSync(path.resolve(process.argv[2])), path.resolve(process.argv[2]),
    'Installed package cannot be an alias or linked checkout');
  const consumer = path.dirname(modules);
  const consumerRequire = createRequire(path.join(consumer, 'package.json'));
  assert.equal(fs.realpathSync(consumerRequire.resolve('@aexos/core/package.json')),
    path.join(installed, 'package.json'), 'Consumer must resolve the supplied installed package');
  const metadata = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(metadata.name, '@aexos/core');
  const workDir = fs.realpathSync(process.argv[3]);
  const sourceRoot = path.resolve(__dirname, '..', '..');
  assert(!inside(installed, workDir) && !inside(sourceRoot, workDir),
    'Work directory must be outside supplied package and source checkout');
  const before = inventory(installed);
  observation = {
    node: process.version, version: metadata.version,
    hookSha256: before[hookRelative].sha256,
    packageInventorySha256: sha256(JSON.stringify(before)),
    scope: 'Local installed Node invocation; no native host or publication acceptance',
  };
  const loadedBefore = new Set(Object.keys(require.cache));
  fixture = fs.mkdtempSync(path.join(workDir, 'synapse-package-smoke-'));
  const previousCwd = process.cwd();
  process.chdir(fixture);
  try {
    const manifest = write('.synapse/manifest', [
      'AGENT_UX_STATE=active', 'AGENT_UX_AGENT_TRIGGER=ux-design-expert',
      'AGENT_DEV_STATE=active', 'AGENT_DEV_AGENT_TRIGGER=dev', '',
    ].join('\n'));
    const rule = 'AUTH: Follow the project UX acceptance rule.';
    const otherRule = 'AUTH: This unrelated development rule must not be selected.';
    const domain = write('.synapse/agent-ux', `${rule}\n`);
    const otherDomain = write('.synapse/agent-dev', `${otherRule}\n`);
    const config = write('.aexos-core/core-config.yaml',
      'synapse:\n  pipelineTimeoutMs: 444\n  session:\n    staleTTLHours: 24\n');
    const preserved = [manifest, domain, otherDomain, config]
      .map(file => [file, fs.readFileSync(file)]);
    const sessions = path.join(fixture, '.synapse', 'sessions');
    // 48h expires under the configured 24h TTL, but not the 168h default.
    const stale = write('.synapse/sessions/stale.json', JSON.stringify({
      last_activity: new Date(Date.now() - 48 * 3600000).toISOString(),
    }));
    const recent = write('.synapse/sessions/recent.json', JSON.stringify({
      last_activity: new Date(Date.now() - 12 * 3600000).toISOString(),
    }));
    const recentBytes = fs.readFileSync(recent);
    const runtimePath = path.join(fixture, '.aexos-core/core/synapse');
    assert(!fs.existsSync(runtimePath), 'Project must start without a SYNAPSE runtime');
    const { resolveHookRuntime, buildHookOutput } = require(path.join(installed, hookRelative));
    const { SynapseEngine } = require(path.join(installed, '.aexos-core/core/synapse/engine.js'));
    const runtime = resolveHookRuntime({ cwd: fixture, session_id: 'installed-check' });
    assert(runtime && runtime.engine instanceof SynapseEngine,
      'Absent project runtime must use the installed sibling engine');
    assert.equal(runtime.engine.config.manifest.domains.AGENT_UX.agentTrigger, 'ux-design-expert');
    assert.equal(runtime.engine.config.synapse.pipelineTimeoutMs, 444);
    assert.equal(runtime.sessionsDir, sessions);
    assert.equal(runtime.session.cwd, fixture);
    assert(!fs.existsSync(stale), 'Configured TTL must remove the 48h session');
    assert.deepEqual(fs.readFileSync(recent), recentBytes, 'Keep the 12h session unchanged');
    const sessionFile = path.join(sessions, 'installed-check.json');
    const sessionBytes = fs.readFileSync(sessionFile);
    const again = resolveHookRuntime({ cwd: fixture, sessionId: 'installed-check' });
    assert.deepEqual(again.session, JSON.parse(sessionBytes));
    assert.deepEqual(fs.readFileSync(sessionFile), sessionBytes, 'Reuse without replacing session');
    const output = await runtime.engine.process('Check project UX rules', {
      ...runtime.session, active_agent: { id: 'ux-design-expert' },
    });
    assert(output.xml.includes(rule), 'Actual pipeline must emit the selected project rule');
    assert(!output.xml.includes(otherRule), 'Actual pipeline must not select another agent domain');
    assert.deepEqual(buildHookOutput(output.xml), {
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: output.xml },
    });
    assert(!fs.existsSync(runtimePath), 'Fallback must not copy runtime code into the project');
    const sessionsBefore = inventory(sessions);
    fs.mkdirSync(runtimePath, { recursive: true });
    assert.equal(resolveHookRuntime({ cwd: fixture, sessionId: 'partial-must-not-create' }), null,
      'Present partial runtime must refuse instead of falling back');
    assert.deepEqual(inventory(sessions), sessionsBefore, 'Partial runtime must not mutate sessions');
    for (const [file, bytes] of preserved) assert.deepEqual(fs.readFileSync(file), bytes);
    const loaded = Object.keys(require.cache).filter(file => !loadedBefore.has(file));
    for (const file of loaded) {
      assert(inside(modules, fs.realpathSync(file)),
        'Runtime dependency resolved outside the supplied npm installation');
    }
    assert(loaded.includes(path.join(installed,
      '.aexos-core/core/synapse/session/session-manager.js')), 'Use installed sibling session manager');
    assert.deepEqual(inventory(installed), before, 'Installed package payload must remain unchanged');
    return {
      loadedInstalledModules: loaded.length,
      checks: ['installed-runtime', 'project-rule-output', 'project-config', 'configured-ttl',
        'session-create-reuse', 'partial-runtime-refusal', 'project-input-preservation',
        'installed-payload-preservation', 'installed-dependency-resolution'],
    };
  } finally {
    process.chdir(previousCwd);
    assert.deepEqual(inventory(installed), before, 'Installed package changed, including on failure');
    observation.packageFilesUnchanged = Object.values(before).filter(entry => entry.sha256).length;
  }
}

main().then(result => {
  console.log(JSON.stringify({ ...observation, ...result, result: 'PASS', fixture }, null, 2));
}).catch(error => {
  console.error(JSON.stringify({ ...observation, result: 'FAIL', fixture, error: error.message }));
  process.exitCode = 1;
});
