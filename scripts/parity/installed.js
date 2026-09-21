#!/usr/bin/env node
'use strict';

// Runs real packaged CLI consumers. No source checkout links or NODE_PATH.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { ROOT, OUTPUT, sha256, readJson, writeJson, candidateIdentity } = require('./lib');

function main() {
  const npmCli = process.env.AEXOS_PARITY_NPM_CLI || process.env.npm_execpath;
  if (!npmCli || !fs.existsSync(npmCli)) throw new Error('Set AEXOS_PARITY_NPM_CLI to the installed npm/bin/npm-cli.js (no downloads or guessed CLI)');
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-parity-installed-'));
  assert(!workRoot.startsWith(ROOT + path.sep));
  const profile = path.join(workRoot, 'profile');
  const cache = process.env.AEXOS_PARITY_NPM_CACHE || path.join(workRoot, 'npm-cache');
  const toolBin = path.join(workRoot, 'tools');
  const packDir = path.join(workRoot, 'artifacts');
  for (const dir of [profile, cache, toolBin, packDir]) fs.mkdirSync(dir, { recursive: true });
  const npmrc = path.join(profile, '.npmrc');
  fs.writeFileSync(npmrc, 'audit=false\nfund=false\n');
  // The isolated profile intentionally does not inherit personal safe.directory
  // entries. Trust only this already-authorized disposable candidate checkout.
  fs.writeFileSync(path.join(profile, '.gitconfig'), `[safe]\n\tdirectory = ${ROOT.replace(/\\/g, '/')}\n`);
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(toolBin, 'npm.cmd'), `@echo off\r\n"${process.execPath}" "${npmCli}" %*\r\n`);
    fs.writeFileSync(path.join(toolBin, 'npx.cmd'), `@echo off\r\n"${process.execPath}" "${path.join(path.dirname(npmCli), 'npx-cli.js')}" %*\r\n`);
  }
  const env = {
    PATH: [toolBin, path.dirname(process.execPath), process.platform === 'win32' ? 'C:\\Program Files\\Git\\cmd' : '/usr/bin', process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/bin'].join(path.delimiter),
    SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, ComSpec: process.env.ComSpec,
    TEMP: workRoot, TMP: workRoot, TMPDIR: workRoot, HOME: profile, USERPROFILE: profile,
    APPDATA: path.join(profile, 'AppData/Roaming'), LOCALAPPDATA: path.join(profile, 'AppData/Local'),
    npm_config_cache: cache, npm_config_userconfig: npmrc, npm_config_audit: 'false', npm_config_fund: 'false',
    npm_config_fetch_retries: '0', npm_config_fetch_timeout: '30000',
    CI: 'true', NO_COLOR: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(profile, '.gitconfig'),
    AEXOS_PARITY_NPM_CLI: npmCli, AEXOS_PARITY_NPM_CACHE: cache, AEXOS_PARITY_KEEP_WORK: '1',
  };
  if (process.env.AEXOS_PARITY_OFFLINE === '1') env.npm_config_offline = 'true';
  const identity = candidateIdentity();
  const lock = readJson(path.join(OUTPUT, 'baseline-lock.json'));
  const evidence = { schema_version: 1, upstream_commit: lock.upstream.commit, candidate: identity,
    environment: { platform: process.platform, node: process.version, architecture: process.arch,
      npm_resolution: process.env.AEXOS_PARITY_OFFLINE === '1' ? 'cache-only' : 'registry-with-prefer-offline-cache' },
    work_root: workRoot, started_at: new Date().toISOString(), status: 'running', steps: [], journeys: [], consumer_bindings: [] };
  let defaultConsumer, defaultPackageRoot, lastJourneyStep = 0;
  const reportPath = path.join(OUTPUT, 'evidence/installed.json');
  function run(label, args, cwd = ROOT, input, expectedExitCode = 0, timeout = 600000) {
    return runExecutable(label, process.execPath, args, cwd, input, expectedExitCode, timeout);
  }
  function runExecutable(label, executable, args, cwd = ROOT, input, expectedExitCode = 0, timeout = 600000) {
    console.log(`[parity:installed] ${label}`);
    // cmd.exe consumes the deliberately quoted /c expression itself. Node's
    // default C-runtime escaping corrupts quoted npm shim paths with spaces.
    const windowsVerbatimArguments = process.platform === 'win32' && path.basename(executable).toLowerCase() === 'cmd.exe';
    const result = spawnSync(executable, args, { cwd, env, input, encoding: 'utf8', timeout,
      maxBuffer: 24 * 1024 * 1024, windowsHide: true, windowsVerbatimArguments });
    const log = `${result.stdout || ''}\n${result.stderr || ''}`;
    const logPath = path.join(workRoot, `${String(evidence.steps.length + 1).padStart(2, '0')}-${label.replace(/[^a-z0-9-]/gi, '-')}.log`);
    fs.writeFileSync(logPath, log);
    evidence.steps.push({ label, command: [executable, ...args], cwd, input: input || null, windows_verbatim_arguments: windowsVerbatimArguments,
      exit_code: result.status, expected_exit_code: expectedExitCode, error: result.error && result.error.message, log_path: logPath, log_sha256: sha256(log) });
    writeJson(reportPath, evidence);
    if (result.error || result.status !== expectedExitCode) throw new Error(`${label} failed (${result.status}, expected ${expectedExitCode}): ${(result.stderr || result.stdout || '').slice(-2200)}`);
    return result.stdout;
  }
  function journey(name, assertions, detail = {}) {
    const consumerPath = path.resolve(detail.isolated_consumer || defaultConsumer);
    const packageRoot = path.resolve(detail.package_root || defaultPackageRoot);
    for (const target of [consumerPath, packageRoot]) {
      assert(fs.statSync(target).isDirectory() && !fs.lstatSync(target).isSymbolicLink());
      assert(fs.realpathSync(target).startsWith(fs.realpathSync(workRoot) + path.sep));
    }
    const binding = { id: `consumer-${evidence.consumer_bindings.length + 1}`, consumer_path: consumerPath,
      consumer_realpath: fs.realpathSync(consumerPath), package_root: packageRoot,
      package_realpath: fs.realpathSync(packageRoot),
      package_json_sha256: sha256(fs.readFileSync(path.join(packageRoot, 'package.json'))),
      cli_sha256: sha256(fs.readFileSync(path.join(packageRoot, 'bin/aexos.js'))),
      artifact_sha256: evidence.artifact.sha256, observed_at: new Date().toISOString(), observed_exists: true };
    const stepLabels = evidence.steps.slice(lastJourneyStep).map(step => step.label);
    assert(stepLabels.length > 0, `Journey ${name} has no executed child process`);
    evidence.consumer_bindings.push(binding);
    evidence.journeys.push({ name, status: 'passed', assertions, ...detail,
      isolated_consumer: binding.consumer_realpath, consumer_binding_id: binding.id, step_labels: stepLabels });
    lastJourneyStep = evidence.steps.length;
    writeJson(reportPath, evidence);
  }
  try {
    evidence.environment.npm = run('npm-version', [npmCli, '--version']).trim();
    // npm 10.9.2's bundled pacote/dir.js runs prepare even with ignoreScripts.
    // Inspect through its bundled packlist first; that path executes no lifecycle.
    const npmRoot = path.dirname(path.dirname(npmCli));
    const inspectScript = 'const path=require(\'path\'); const Arborist=require(path.join(process.argv[1],\'node_modules/@npmcli/arborist\')); const packlist=require(path.join(process.argv[1],\'node_modules/npm-packlist\')); new Arborist({path:process.cwd()}).loadActual().then(tree=>packlist(tree)).then(files=>process.stdout.write(JSON.stringify(files))).catch(error=>{console.error(error.message);process.exitCode=1});';
    const filePaths = JSON.parse(run('pack-inspection-no-lifecycle', ['-e', inspectScript, npmRoot]));
    assert(Array.isArray(filePaths) && filePaths.length > 0);
    const required = ['.aexos-core/core/synapse/runtime/hook-runtime.js', '.claude/hooks/synapse-engine.cjs',
      '.synapse/manifest', '.synapse/agent-devops', '.aexos-core/core/config/migration-compat.js',
      '.aexos-core/infrastructure/scripts/grok-skills-sync/validate.js',
      '.aexos-core/infrastructure/templates/grok-hooks/synapse-engine.cjs',
      'packages/installer/src/wizard/ide-config-generator.js'];
    for (const file of required) assert(filePaths.includes(file), `Missing tarball file ${file}`);
    evidence.inspected_paths_before_lifecycle = filePaths;
    // Executes the real prepare lifecycle. Inspection above is not counted as preparation.
    const packed = JSON.parse(run('pack-real-lifecycle', [npmCli, 'pack', '--json', '--pack-destination', packDir]));
    assert(packed.length === 1 && packed[0].filename);
    const tarball = path.join(packDir, packed[0].filename);
    evidence.artifact = { path: tarball, sha256: sha256(fs.readFileSync(tarball)), npm_integrity: packed[0].integrity, lifecycle_executed: true };
    const packagedPaths = [];
    require('tar').t({ file: tarball, sync: true, onentry: (entry) => {
      if (entry.type === 'File') packagedPaths.push(entry.path.replace(/^package\//, ''));
    } });
    for (const file of required) assert(packagedPaths.includes(file), `Missing prepared tarball file ${file}`);
    assert(!packagedPaths.some(file => /^\.synapse\/(sessions|metrics|cache)\//.test(file)), 'Runtime SYNAPSE state must never be packaged');
    evidence.packaged_paths = packagedPaths.sort();
    const project = path.join(workRoot, 'consumer');
    fs.mkdirSync(project);
    writeJson(path.join(project, 'package.json'), { name: 'aexos-parity-consumer', version: '1.0.0', private: true });
    fs.writeFileSync(path.join(project, 'existing-application.txt'), 'PRESERVE-EXISTING-APPLICATION\n');
    run('npm-install-real-tarball', [npmCli, 'install', tarball, '--prefer-offline', '--no-audit', '--no-fund'], project);
    const installedRoot = path.join(project, 'node_modules/@aexos/core');
    defaultConsumer = project;
    defaultPackageRoot = installedRoot;
    assert(!fs.lstatSync(installedRoot).isSymbolicLink(), 'Installed package must not be a checkout link');
    assert(fs.realpathSync(installedRoot).startsWith(workRoot + path.sep));
    const cli = path.join(installedRoot, 'bin/aexos.js');
    const help = run('installed-help', [cli, '--help'], project);
    assert(/AEXOS/.test(help));
    const manifest = readJson(path.join(installedRoot, 'package.json'));
    const npxVersion = run('installed-npm-exec-public-bin', [npmCli, 'exec', '--offline', '--', 'aexos', '--version'], project);
    assert(npxVersion.includes(manifest.version));
    for (const target of new Set(Object.values(manifest.bin))) assert(fs.existsSync(path.join(installedRoot, target)));
    journey('npm-tarball-install-and-cli', 6 + required.length, { package_root: installedRoot, source_resolution: 'No NODE_PATH, no workspace links, isolated profile and consumer outside checkout; actual npm exec bin invocation' });

    const commandConsumer = path.join(workRoot, 'public-command-consumer');
    fs.mkdirSync(commandConsumer);
    const commanderCommands = ['workers', 'manifest', 'qa', 'mcp', 'migrate', 'generate', 'metrics', 'config', 'pro', 'sdc', 'wave'];
    for (const command of commanderCommands) {
      const commandHelp = run(`installed-public-help-${command}`, [cli, command, '--help'], commandConsumer);
      assert(commandHelp.includes(`Usage: aexos ${command}`), commandHelp);
    }
    journey('installed-public-command-routing', commanderCommands.length, { isolated_consumer: commandConsumer,
      commands: commanderCommands,
      boundary: 'Every registered Commander top-level command is reached through the extracted public executable. Help confirms routing only; deeper behavior is proved by separately named journeys.' });
    const mcpBefore = JSON.parse(run('installed-mcp-status-before-setup', [cli, 'mcp', 'status', '--json'], commandConsumer));
    assert.equal(mcpBefore.global.exists, false);
    assert(path.resolve(mcpBefore.global.path).startsWith(profile + path.sep));
    run('installed-mcp-setup', [cli, 'mcp', 'setup'], commandConsumer);
    run('installed-mcp-add-local-definition', [cli, 'mcp', 'add', 'parity-local', '--command', 'node'], commandConsumer);
    run('installed-mcp-link', [cli, 'mcp', 'link'], commandConsumer);
    const mcpLinked = JSON.parse(run('installed-mcp-status-linked', [cli, 'mcp', 'status', '--json'], commandConsumer));
    assert.equal(mcpLinked.global.exists, true);
    assert.equal(mcpLinked.global.servers.total, 1);
    assert.equal(mcpLinked.global.servers.servers[0].name, 'parity-local');
    assert.equal(mcpLinked.project.linkStatus, 'linked');
    assert.equal(fs.realpathSync(mcpLinked.project.linkPath), fs.realpathSync(path.dirname(mcpLinked.global.path)));
    run('installed-mcp-remove-definition', [cli, 'mcp', 'add', 'parity-local', '--remove'], commandConsumer);
    run('installed-mcp-unlink', [cli, 'mcp', 'link', '--unlink'], commandConsumer);
    const mcpAfter = JSON.parse(run('installed-mcp-status-after-unlink', [cli, 'mcp', 'status', '--json'], commandConsumer));
    assert.equal(mcpAfter.global.servers.total, 0);
    assert.notEqual(mcpAfter.project.linkStatus, 'linked');
    journey('installed-public-mcp-configuration', 9, { isolated_consumer: commandConsumer,
      boundary: 'Actual public CLI setup, add, status, project link, remove and unlink under the isolated temporary profile. No MCP server or external provider execution.' });

    const documentContext = path.join(commandConsumer, 'adr-context.json');
    const generatedDocument = path.join(commandConsumer, 'adr-42.md');
    writeJson(documentContext, { title: 'Context title must be overridden',
      deciders: 'AEXOS Maintainers', context: 'Installed public commands must reach their declared implementation.',
      decision: 'Use the existing canonical Commander runner.',
      positiveConsequences: ['Installed users can generate validated documents'],
      negativeConsequences: ['The compatibility router retains explicit command forwarding'] });
    const templateInfo = JSON.parse(run('installed-generate-template-info', [cli, 'generate', 'info', 'adr', '--json'], commandConsumer));
    assert(Array.isArray(templateInfo.variables) && templateInfo.variables.length > 0);
    const generateArgs = [cli, 'generate', 'adr', '--non-interactive', '--title', 'Installed public command acceptance',
      '--number', '42', '--status', 'Accepted', '--context', documentContext, '--save', '--output', generatedDocument];
    run('installed-generate-valid-document', generateArgs, commandConsumer);
    assert(!/validation warnings|schema not found/i.test(fs.readFileSync(evidence.steps.at(-1).log_path, 'utf8')));
    const documentBytes = fs.readFileSync(generatedDocument);
    const documentText = documentBytes.toString('utf8');
    assert(documentText.includes('Installed public command acceptance'));
    assert(documentText.includes('Use the existing canonical Commander runner.'));
    assert(documentText.includes('AEXOS Maintainers'));
    assert(!documentText.includes('Context title must be overridden'));
    fs.writeFileSync(documentContext, '{ invalid JSON');
    run('installed-generate-reject-invalid-context', generateArgs, commandConsumer, undefined, 1);
    assert(fs.readFileSync(generatedDocument).equals(documentBytes));
    journey('installed-public-document-generation', 7, { isolated_consumer: commandConsumer,
      document_sha256: sha256(documentBytes),
      boundary: 'Actual public CLI loads template metadata, creates an ADR with schema validation and explicit context, honors CLI overrides, and preserves output when invalid context is rejected.' });

    // Test the package-only hook BEFORE the installer creates a canonical core.
    const synapse = path.join(project, '.synapse');
    fs.mkdirSync(synapse);
    fs.writeFileSync(path.join(synapse, 'manifest'), 'DEVMODE=false\nCONSTITUTION_STATE=active\nCONSTITUTION_NON_NEGOTIABLE=true\nAGENT_UX_STATE=active\nAGENT_UX_AGENT_TRIGGER=ux-design-expert\n');
    fs.writeFileSync(path.join(synapse, 'constitution'), 'CONSTITUTION_RULE_1=PARITY_INSTALLED_CONSTITUTION\n');
    fs.writeFileSync(path.join(synapse, 'agent-ux'), 'AGENT_UX_RULE_1=PARITY_INSTALLED_UX_AUTHORITY\n');
    const hook = path.join(project, '.claude/hooks/synapse-engine.cjs');
    fs.mkdirSync(path.dirname(hook), { recursive: true });
    fs.copyFileSync(path.join(installedRoot, '.claude/hooks/synapse-engine.cjs'), hook);
    const input = JSON.stringify({ cwd: project, sessionId: 'installed-package', prompt: 'Evaluate the user interface authority' });
    const first = JSON.parse(run('installed-package-hook-first', [hook], project, input));
    assert(first.hookSpecificOutput.additionalContext.includes('PARITY_INSTALLED_CONSTITUTION'));
    const sessionPath = path.join(synapse, 'sessions/installed-package.json');
    const session = readJson(sessionPath);
    session.active_agent = { id: 'ux-design-expert', activated_at: new Date().toISOString(), activation_quality: 'explicit' };
    writeJson(sessionPath, session);
    const second = JSON.parse(run('installed-package-hook-second', [hook], project, input));
    assert(second.hookSpecificOutput.additionalContext.includes('PARITY_INSTALLED_UX_AUTHORITY'));
    assert.equal(readJson(sessionPath).prompt_count, 2);
    journey('synapse-package-context-manifest-session', 3);

    run('installed-project-grok', [cli, 'install', '--ci', '--yes', '--ide', 'grok'], project);
    assert.equal(fs.readFileSync(path.join(project, 'existing-application.txt'), 'utf8'), 'PRESERVE-EXISTING-APPLICATION\n');
    const validator = path.join(installedRoot, '.aexos-core/infrastructure/scripts/grok-skills-sync/validate.js');
    run('installed-grok-strict-validation', [validator, '--strict', '--project-root', project], project);
    assert(fs.existsSync(path.join(project, '.grok/aexos-managed.json')));
    assert(fs.existsSync(path.join(project, '.grok/skills/develop-story/SKILL.md')));
    const custom = path.join(project, '.grok/skills/company-custom/SKILL.md');
    fs.mkdirSync(path.dirname(custom), { recursive: true });
    fs.writeFileSync(custom, '# PRESERVE-CUSTOM-SKILL\n');
    const grokConfigPath = path.join(project, '.grok/config.toml');
    fs.appendFileSync(grokConfigPath, '\n[mcp.parity_custom]\ncommand = "local-company-tool"\n');
    const customGrokConfig = fs.readFileSync(grokConfigPath);
    const configPath = path.join(project, '.aexos-core/core-config.yaml');
    fs.appendFileSync(configPath, '\n# PARITY-PRESERVE-CUSTOM-CONFIG\nparity_user_extension:\n  enabled: false\n  value: keep-me\n');
    run('installed-project-reinstall', [cli, 'install', '--ci', '--yes', '--ide', 'grok'], project);
    assert.equal(fs.readFileSync(custom, 'utf8'), '# PRESERVE-CUSTOM-SKILL\n');
    assert(fs.readFileSync(grokConfigPath).equals(customGrokConfig), 'Grok reinstall must preserve actual project TOML configuration');
    assert(fs.readFileSync(configPath, 'utf8').includes('PARITY-PRESERVE-CUSTOM-CONFIG'));
    assert.deepEqual(require('js-yaml').load(fs.readFileSync(configPath, 'utf8')).parity_user_extension, { enabled: false, value: 'keep-me' });
    run('reinstalled-grok-strict-validation', [validator, '--strict', '--project-root', project], project);
    journey('grok-install-reinstall-customization-preservation', 8);

    // Complete canonical hook must keep the same context and session contract.
    const canonical = JSON.parse(run('installed-canonical-hook', [hook], project, input));
    assert(canonical.hookSpecificOutput.additionalContext.includes('PARITY_INSTALLED_UX_AUTHORITY'));
    assert.equal(readJson(sessionPath).prompt_count, 3);
    journey('synapse-canonical-after-install', 2);

    // A separate clean Claude consumer catches wizard-order regressions that
    // an earlier Grok installation could otherwise hide.
    const freshClaudeProject = path.join(workRoot, 'fresh-claude-consumer');
    fs.mkdirSync(freshClaudeProject);
    writeJson(path.join(freshClaudeProject, 'package.json'), { name: 'aexos-parity-claude-consumer', version: '1.0.0', private: true });
    run('npm-install-claude-tarball', [npmCli, 'install', tarball, '--prefer-offline', '--no-audit', '--no-fund'], freshClaudeProject);
    const freshClaudeCli = path.join(freshClaudeProject, 'node_modules/@aexos/core/bin/aexos.js');
    run('fresh-installed-project-claude', [freshClaudeCli, 'install', '--ci', '--yes', '--ide', 'claude-code'], freshClaudeProject);
    const freshConfigPath = path.join(freshClaudeProject, '.aexos-core/core-config.yaml');
    const yamlParser = require('js-yaml');
    const freshConfig = yamlParser.load(fs.readFileSync(freshConfigPath, 'utf8'));
    const shippedConfig = yamlParser.load(fs.readFileSync(path.join(installedRoot, '.aexos-core/core-config.yaml'), 'utf8'));
    assert.equal(freshConfig.boundary.frameworkProtection, true);
    assert(readJson(path.join(freshClaudeProject, '.claude/settings.json')).permissions.deny.length >= 40);
    for (const key of ['synapse', 'models', 'lazyLoading']) assert.deepEqual(freshConfig[key], shippedConfig[key], `Fresh installation lost operational configuration: ${key}`);

    // No hand-written manifest or bridge: prove installer -> public activation
    // -> SYNAPSE context and registered authority consumer in the fresh product.
    const freshSynapse = path.join(freshClaudeProject, '.synapse');
    assert(fs.existsSync(path.join(freshSynapse, 'manifest')), 'Fresh install must provide operational SYNAPSE content');
    const domainIgnore = fs.readFileSync(path.join(freshSynapse, '.gitignore'), 'utf8');
    assert(domainIgnore.includes('sessions/') && domainIgnore.includes('cache/'));
    const activate = path.join(freshClaudeProject, '.claude/commands/AEXOS/scripts/generate-greeting.js');
    const activeBridge = path.join(freshSynapse, 'sessions/_active-agent.json');
    const freshGuardRegistration = readJson(path.join(freshClaudeProject, '.claude/settings.local.json'))
      .hooks.PreToolUse.flatMap(item => item.hooks).find(item => item.command.includes('enforce-git-push-authority.cjs'));
    assert(freshGuardRegistration);
    const freshGuardCommand = /^node\s+(\S+)\s*$/.exec(freshGuardRegistration.command);
    assert(freshGuardCommand);
    const freshGuard = path.resolve(freshClaudeProject, freshGuardCommand[1]);
    assert(freshGuard.startsWith(freshClaudeProject + path.sep));
    const guardedCommands = [
      'git -C . push origin main', 'git --no-pager push origin main',
      'gh --repo owner/repo pr create --title test', 'gh pr merge 1',
      'gh api repos/owner/repo/pulls -X POST',
      'gh api graphql -f query="mutation { createPullRequest(input: {}) { id } }"',
    ];
    const baseAgents = ['analyst', 'architect', 'data-engineer', 'dev', 'pm', 'po', 'qa', 'sm', 'squad-creator', 'ux-design-expert', 'aexos-master', 'devops'];
    for (const agent of baseAgents) {
      run(`installed-public-activation-${agent}`, [activate, agent], freshClaudeProject);
      const active = readJson(activeBridge);
      assert.equal(active.id, agent);
      assert.equal(active.source, 'uap');
      assert(['full', 'partial'].includes(active.activation_quality), 'Activation must not silently fall back');
      for (const [index, command] of guardedCommands.entries()) {
        const output = run(`installed-activated-${agent}-authority-${index}`, [freshGuard], freshClaudeProject,
          JSON.stringify({ cwd: freshClaudeProject, tool_input: { command } }), agent === 'devops' ? 0 : 2);
        if (agent !== 'devops') assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, 'deny');
        else assert.equal(output.trim(), '');
      }
    }
    const actualAgentRule = fs.readFileSync(path.join(freshSynapse, 'agent-devops'), 'utf8')
      .split(/\r?\n/).find(line => line.startsWith('AGENT_DEVOPS_RULE_0=')).split('=').slice(1).join('=');
    const activatedContext = JSON.parse(run('installed-activated-agent-context', [path.join(freshClaudeProject, '.claude/hooks/synapse-engine.cjs')],
      freshClaudeProject, JSON.stringify({ cwd: freshClaudeProject, session_id: 'installed-public-activation', prompt: 'Prepare the delivery checklist' })));
    assert(activatedContext.hookSpecificOutput.additionalContext.includes(actualAgentRule));
    journey('fresh-installed-agent-activation-context-authority', baseAgents.length * 9 + 4, { isolated_consumer: freshClaudeProject, package_root: path.join(freshClaudeProject, 'node_modules/@aexos/core'), agents: baseAgents,
      boundary: 'Real shipped domains and public helper write the bridge; hooks consume it. Proposed commands are stdin data, never executed. Live IDE invocation remains separate.' });

    fs.appendFileSync(path.join(freshSynapse, 'agent-devops'), '\n# PARITY-CUSTOM-DOMAIN\n');
    freshConfig.boundary.frameworkProtection = false;
    fs.writeFileSync(freshConfigPath, yamlParser.dump(freshConfig));
    run('explicit-disabled-protection-reinstall', [freshClaudeCli, 'install', '--ci', '--yes', '--ide', 'claude-code'], freshClaudeProject);
    assert(fs.readFileSync(path.join(freshSynapse, 'agent-devops'), 'utf8').includes('PARITY-CUSTOM-DOMAIN'));
    assert.equal(yamlParser.load(fs.readFileSync(freshConfigPath, 'utf8')).boundary.frameworkProtection, false);
    const disabledDoctor = JSON.parse(run('explicit-disabled-protection-doctor', [freshClaudeCli, 'doctor', '--json'], freshClaudeProject));
    const disabledCheck = disabledDoctor.checks.find(check => check.check === 'settings-json');
    assert.equal(disabledCheck.status, 'WARN');
    assert.equal(disabledCheck.autoFixable, false);
    journey('fresh-claude-protection-and-explicit-choice', 8, { isolated_consumer: freshClaudeProject, package_root: path.join(freshClaudeProject, 'node_modules/@aexos/core'),
      boundary: 'Fresh Claude setup preserves operational defaults and emits deny rules; reinstall preserves an explicit user opt-out and Doctor reports it without an ineffective auto-fix.' });

    run('installed-project-claude', [cli, 'install', '--ci', '--yes', '--ide', 'claude-code'], project);
    const templateMap = require(path.join(installedRoot, 'scripts/parity/sync-claude-templates')).PROJECTION_MAP;
    for (const name of Object.keys(templateMap)) {
      assert(fs.readFileSync(path.join(project, '.claude/templates', name))
        .equals(fs.readFileSync(path.join(installedRoot, '.claude/templates', name))), `Installed template differs: ${name}`);
    }
    const helper = path.join(project, '.claude/commands/AEXOS/scripts/session-context-loader.js');
    const helperOutput = JSON.parse(run('installed-claude-public-helper', [helper, 'load', 'dev'], project));
    assert(Object.hasOwn(helperOutput, 'sessionType'));
    const customTemplate = path.join(project, '.claude/templates/prd-tmpl.yaml');
    fs.appendFileSync(customTemplate, '\n# PARITY-CUSTOM-TEMPLATE\n');
    run('installed-claude-reinstall', [cli, 'install', '--ci', '--yes', '--ide', 'claude-code'], project);
    assert(fs.readFileSync(customTemplate, 'utf8').includes('PARITY-CUSTOM-TEMPLATE'));
    assert.equal(fs.readFileSync(custom, 'utf8'), '# PRESERVE-CUSTOM-SKILL\n');
    journey('claude-public-helpers-templates-reinstall', Object.keys(templateMap).length + 3);

    const settings = readJson(path.join(project, '.claude/settings.json'));
    const installedConfig = require('js-yaml').load(fs.readFileSync(configPath, 'utf8'));
    assert.equal(installedConfig.boundary.frameworkProtection, true, 'Fresh consumers must not inherit contributor-mode protection bypass');
    assert(settings.permissions.deny.length >= 40, 'Framework deny rules must actually be generated');
    const localSettings = readJson(path.join(project, '.claude/settings.local.json'));
    const registeredGuard = localSettings.hooks.PreToolUse.flatMap(item => item.hooks)
      .find(item => item.command.includes('enforce-git-push-authority.cjs'));
    assert(registeredGuard, 'Authority guard must be registered in the consumer');
    const guardCommand = /^node\s+(\S+)\s*$/.exec(registeredGuard.command);
    assert(guardCommand, 'Expected a direct local Node guard entrypoint');
    const guard = path.resolve(project, guardCommand[1]);
    assert(guard.startsWith(project + path.sep) && fs.existsSync(guard));
    // Hook stdin describes a proposed operation; the operation is never executed.
    const proposedPush = JSON.stringify({ cwd: project, tool_input: { command: ['git', 'pu' + 'sh', 'origin', 'main'].join(' ') } });
    const bridge = path.join(project, '.aexos/active-agent.json');
    const previousBridge = fs.existsSync(bridge) ? fs.readFileSync(bridge) : null;
    fs.mkdirSync(path.dirname(bridge), { recursive: true });
    try {
      writeJson(bridge, { id: '' });
      const unknown = JSON.parse(run('installed-authority-unknown-denied', [guard], project, proposedPush, 2));
      assert.equal(unknown.hookSpecificOutput.permissionDecision, 'deny');
      const nativeGuard = path.join(project, '.claude/hooks/enforce-git-push-authority.cjs');
      for (const [label, command] of [
        ['git-options', 'git -C . -c advice.detachedHead=false push origin main'],
        ['github-api', 'gh api repos/example/example/pulls -X POST -f title=fixture'],
      ]) {
        const output = JSON.parse(run(`installed-native-authority-${label}-denied`, [nativeGuard], project,
          JSON.stringify({ workspaceRoot: project, toolInput: { command } }), 2));
        assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
      }
      writeJson(bridge, { id: 'dev' });
      const denied = JSON.parse(run('installed-authority-denied', [guard], project, proposedPush, 2));
      assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
      writeJson(bridge, { id: 'devops' });
      assert.equal(run('installed-authority-allowed', [guard], project, proposedPush).trim(), '');
      assert.equal(run('installed-native-authority-bridge-allowed', [nativeGuard], project, proposedPush).trim(), '');
    } finally {
      if (previousBridge) fs.writeFileSync(bridge, previousBridge);
      else fs.unlinkSync(bridge);
    }
    journey('installed-protection-and-publication-authority', 11, { boundary: 'Generated framework deny rules and actual registered/native hook decisions including option-bearing Git commands, GitHub API mutations and activation bridge; proposed commands are data and never executed. Live host enforcement remains separate.' });

    // Use the shipped monolithic configuration as a real migration fixture.
    // This is configuration migration, not proof of upgrading an older package.
    const migrationProject = path.join(workRoot, 'legacy-config-consumer');
    fs.mkdirSync(path.join(migrationProject, '.aexos-core'), { recursive: true });
    const yaml = require('js-yaml');
    const legacyConfig = yaml.load(fs.readFileSync(path.join(installedRoot, '.aexos-core/core-config.yaml'), 'utf8'));
    legacyConfig.parityPrivateExtension = { enabled: false, retryCount: 0, tags: ['preserve', 'custom'], nested: { value: 'local-only', optional: null } };
    legacyConfig.synapse = { ...legacyConfig.synapse, pipelineTimeoutMs: 101, customFalsy: false };
    legacyConfig.prd = { ...legacyConfig.prd, epicFilePattern: 'parity-{n}*.md' };
    const legacyBytes = yaml.dump(legacyConfig);
    const legacyPath = path.join(migrationProject, '.aexos-core/core-config.yaml');
    fs.writeFileSync(legacyPath, legacyBytes);
    run('installed-config-migrate', [cli, 'config', 'migrate'], migrationProject);
    assert.equal(fs.readFileSync(legacyPath + '.backup', 'utf8'), legacyBytes);
    const resolveScript = 'const result=require(process.argv[1]).resolveConfig(process.cwd(),{skipCache:true});process.stdout.write(JSON.stringify(result.config));';
    const resolved = JSON.parse(run('installed-config-resolve', ['-e', resolveScript, path.join(installedRoot, '.aexos-core/core/config/config-resolver.js')], migrationProject));
    assert.deepEqual(resolved.parityPrivateExtension, legacyConfig.parityPrivateExtension);
    assert(Object.hasOwn(resolved, 'customTechnicalDocuments'));
    assert.equal(resolved.customTechnicalDocuments, null);
    assert(!Object.hasOwn(resolved, '_aexos_migration'));
    assert.equal(resolved.synapse.pipelineTimeoutMs, 101);
    assert.equal(resolved.prd.epicFilePattern, 'parity-{n}*.md');
    const sharedConfig = yaml.load(fs.readFileSync(path.join(migrationProject, '.aexos-core/project-config.yaml'), 'utf8'));
    assert(!Object.hasOwn(sharedConfig, 'parityPrivateExtension'));
    assert(fs.readFileSync(path.join(migrationProject, '.gitignore'), 'utf8').includes('.aexos-core/local-config.yaml'));
    const localConfig = fs.readFileSync(path.join(migrationProject, '.aexos-core/local-config.yaml'));
    run('installed-config-migrate-idempotent', [cli, 'config', 'migrate'], migrationProject);
    assert(fs.readFileSync(path.join(migrationProject, '.aexos-core/local-config.yaml')).equals(localConfig));
    const editedLocal = yaml.load(localConfig.toString('utf8'));
    editedLocal.synapse.pipelineTimeoutMs = 731;
    fs.writeFileSync(path.join(migrationProject, '.aexos-core/local-config.yaml'), yaml.dump(editedLocal));
    const hookConfig = JSON.parse(run('installed-layered-hook-config-consumer', ['-e',
      'process.stdout.write(JSON.stringify(require(process.argv[1]).loadCoreConfig(process.cwd())));',
      path.join(installedRoot, '.aexos-core/core/synapse/runtime/hook-runtime.js')], migrationProject));
    assert.equal(hookConfig.synapse.pipelineTimeoutMs, 731);
    assert.equal(hookConfig.customTechnicalDocuments, null);
    journey('config-migration-roundtrip-customization-preservation', 12, { isolated_consumer: migrationProject, fixture: 'Shipped real monolithic configuration with explicit test extension and root/nested literal nulls', boundary: 'Configuration migration and actual hook config consumer only; older-package upgrade is a separate obligation' });

    const recoveryOutput = run('installed-updater-backup-restore', [path.join(installedRoot, 'scripts/parity/installed-recovery-scenario.js'), project], project);
    const recovery = JSON.parse(recoveryOutput.trim().split('\n').at(-1));
    assert(recovery.assertions >= 8);
    const recoveredHook = JSON.parse(run('installed-hook-after-recovery', [hook], project, input));
    assert(recoveredHook.hookSpecificOutput.additionalContext.includes('PARITY_INSTALLED_UX_AUTHORITY'));
    journey('updater-backup-restore-after-injected-corruption', recovery.assertions + 1, { recovery: recovery.recovery, boundary: recovery.boundary });
    const sprintOutput = run('installed-sprint-regressions', [path.join(installedRoot, 'scripts/parity/installed-sprint-scenario.js'), path.join(workRoot, 'sprint-consumer')], workRoot);
    const sprint = JSON.parse(sprintOutput.trim().split('\n').at(-1));
    assert.equal(sprint.status, 'passed');
    assert(sprint.assertions >= 38);
    journey('installed-locale-ide-recovery-decision-session-public-artifact', sprint.assertions, sprint);
    const operationalOutput = run('installed-operational-paths', [
      path.join(installedRoot, 'scripts/parity/installed-operational-scenario.js'), installedRoot,
      path.join(workRoot, 'operational-consumer')], workRoot);
    const operational = JSON.parse(operationalOutput.trim().split('\n').at(-1));
    assert.equal(operational.success, true);
    assert(operational.assertions.length >= 19);
    journey('installed-presets-manifests-checkpoint', operational.assertions.length, { isolated_consumer: operational.isolated_consumer, checks: operational.checks,
      boundary: 'Real installed APIs and temporary consumer: validated preset/provenance, generated manifests and persistent explicit human checkpoint. No live agent/provider invocation.' });
    if (process.env.AEXOS_PARITY_COMPAT_NODE) {
      const compatibilityNode = path.resolve(process.env.AEXOS_PARITY_COMPAT_NODE);
      assert(fs.existsSync(compatibilityNode));
      const compatibilityVersion = runExecutable('installed-compatibility-node-version', compatibilityNode, ['--version'], workRoot).trim();
      const compatibilityDoctor = JSON.parse(runExecutable('installed-compatibility-doctor', compatibilityNode,
        [cli, 'doctor', '--json'], project));
      assert.equal(compatibilityDoctor.summary.fail, 0);
      const compatibilityOperational = JSON.parse(runExecutable('installed-compatibility-operational-paths', compatibilityNode,
        [path.join(installedRoot, 'scripts/parity/installed-operational-scenario.js'), installedRoot,
          path.join(workRoot, 'compatibility-operational-consumer')], workRoot).trim().split('\n').at(-1));
      assert.equal(compatibilityOperational.success, true);
      assert(compatibilityOperational.assertions.length >= 19);
      journey('installed-compatibility-runtime', compatibilityOperational.assertions.length + 1, {
        isolated_consumer: compatibilityOperational.isolated_consumer,
        node: compatibilityVersion, checks: compatibilityOperational.checks, doctor: compatibilityDoctor.summary,
        boundary: 'Same exact artifact under the explicitly supplied second Node executable. Named runtime/Doctor journeys only; not the complete OS or Node matrix.' });
    }
    const statuslineHome = path.join(workRoot, 'statusline home');
    fs.mkdirSync(path.join(statuslineHome, '.claude'), { recursive: true });
    const statuslineSettingsPath = path.join(statuslineHome, '.claude/settings.json');
    writeJson(statuslineSettingsPath, { model: 'owner-selected', permissions: { deny: ['Write(.env)'] }, custom: false });
    const statuslineInstaller = path.join(installedRoot, '.aexos-core/product/templates/statusline/install-statusline.js');
    run('installed-statusline-setup', [statuslineInstaller, '--home', statuslineHome], workRoot);
    const statuslineSettings = readJson(statuslineSettingsPath);
    assert.equal(statuslineSettings.model, 'owner-selected');
    assert.deepEqual(statuslineSettings.permissions, { deny: ['Write(.env)'] });
    assert.equal(statuslineSettings.custom, false);
    const statuslineScript = path.join(statuslineHome, '.claude/statusline-script.js');
    const statuslineOutput = run('installed-statusline-json-input', [statuslineScript], workRoot,
      JSON.stringify({ session_id: 'installed-statusline', context_window: { used_percentage: 125 }, cost: { total_cost_usd: 1.25, total_duration_ms: 65000 } }));
    assert(statuslineOutput.includes('100%') && statuslineOutput.includes('1.25'));
    assert(!statuslineOutput.includes('err:'));
    assert(statuslineOutput.includes('CPU(avg)') && statuslineOutput.includes('RAM'));
    run('installed-statusline-reinstall', [statuslineInstaller, '--home', statuslineHome], workRoot);
    assert.deepEqual(readJson(statuslineSettingsPath), statuslineSettings);
    fs.appendFileSync(statuslineScript, '\n// OWNER_STATUSLINE_CUSTOMIZATION\n');
    const customizedStatuslineScript = fs.readFileSync(statuslineScript);
    run('installed-statusline-preserve-edited-script', [statuslineInstaller, '--home', statuslineHome], workRoot);
    assert(fs.readFileSync(statuslineScript).equals(customizedStatuslineScript));
    writeJson(statuslineSettingsPath, { ...statuslineSettings, statusLine: { type: 'command', command: 'owner-custom-command' } });
    const customizedStatuslineBytes = fs.readFileSync(statuslineSettingsPath);
    run('installed-statusline-preserve-owner', [statuslineInstaller, '--home', statuslineHome], workRoot);
    assert(fs.readFileSync(statuslineSettingsPath).equals(customizedStatuslineBytes));
    for (const entry of ['install.sh', 'settings.json', 'statusline-custom.sh']) assert(evidence.packaged_paths.includes(`.claude/setup/${entry}`));
    journey('installed-statusline-setup-telemetry-preservation', 12, { isolated_consumer: statuslineHome,
      boundary: 'Actual distributed installer and JSON-stdin renderer in an isolated temporary profile; no personal profile or live Claude host changed.' });
    const lifecycleOutput = run('installed-update-and-restart-dependency-recovery', [path.join(installedRoot, 'scripts/parity/installed-lifecycle-scenario.js'), evidence.artifact.path, workRoot],
      workRoot, undefined, 0, 1800000);
    const lifecycle = JSON.parse(lifecycleOutput.trim().split('\n').at(-1));
    assert(lifecycle.assertions >= 19);
    assert.equal(lifecycle.successfulUpdate.validationPassed, true);
    assert.equal(lifecycle.interruptedRecovery.complete, true);
    assert.equal(lifecycle.interruptedRecovery.dependenciesRestored, true);
    journey('installed-update-and-restart-dependency-recovery', lifecycle.assertions, lifecycle);
    const publishedTarball = process.env.AEXOS_PARITY_PUBLISHED_TARBALL ||
      path.resolve(ROOT, '../.parity-environment/published/aexos-core-5.3.0.tgz');
    assert(fs.existsSync(publishedTarball), 'Set AEXOS_PARITY_PUBLISHED_TARBALL to the registry-verified public baseline tarball');
    const publishedOutput = run('installed-published-release-transition', [
      path.join(installedRoot, 'scripts/parity/installed-published-upgrade-scenario.js'),
      evidence.artifact.path, publishedTarball, workRoot,
    ], workRoot, undefined, 0, 1800000);
    const published = JSON.parse(publishedOutput.trim().split('\n').at(-1));
    assert.equal(published.status, 'passed');
    assert(published.assertions >= 28);
    assert.equal(published.candidate.updaterLoadedFromInstalledArtifact, true);
    assert.equal(published.candidate.version, manifest.version);
    assert.equal(published.update.validationPassed, true);
    assert.equal(published.doctor.fail, 0);
    journey('installed-published-release-transition', published.assertions, published);
    env.AEXOS_E2E_TARBALL = evidence.artifact.path;
    env.AEXOS_E2E_KEEP_TEMP = '1';
    // Exercise public npm.cmd resolution on Windows instead of relying only on
    // the harness's explicit Node/npm-cli.js execution path.
    delete env.AEXOS_PARITY_NPM_CLI;
    const skillsSmoke = run('installed-skills-ci-smoke', [path.join(installedRoot, 'scripts/e2e/installed-skills-smoke.js')], workRoot, undefined, 0, 1800000);
    env.AEXOS_PARITY_NPM_CLI = npmCli;
    assert(skillsSmoke.includes('PASS: installed project skills E2E completed for 3 agents'));
    const skillsResult = JSON.parse(skillsSmoke.split(/\r?\n/).find(line => line.startsWith('{"status":"passed","isolated_consumer":')));
    journey('installed-skills-ci-smoke', 1, { ...skillsResult, boundary: 'Existing CI smoke executed from the exact artifact, including nested core dependencies, npm exec CLI, Claude/Codex projections, three agent activations and Doctor; no live IDE host claim.' });
    const auxiliaryConsumer = path.join(workRoot, 'auxiliary-installer-consumer');
    fs.mkdirSync(auxiliaryConsumer);
    const auxiliaryCli = path.join(installedRoot, 'packages/aexos-install/bin/aexos-install.js');
    const auxiliaryOutput = run('installed-auxiliary-package-real-install', [auxiliaryCli,
      '--ci', '--yes', '--profile', 'advanced', '--skip-deps', '--ide', 'claude-code',
      '--core-package', evidence.artifact.path], auxiliaryConsumer, undefined, 0, 1200000);
    assert(auxiliaryOutput.includes('AEXOS installed successfully'));
    assert.equal(readJson(path.join(auxiliaryConsumer, 'node_modules/@aexos/core/package.json')).name, '@aexos/core');
    assert(fs.existsSync(path.join(auxiliaryConsumer, '.aexos-core/core-config.yaml')));
    assert(fs.existsSync(path.join(auxiliaryConsumer, '.claude/settings.json')));
    journey('installed-auxiliary-scoped-package-bootstrap', 4, { isolated_consumer: auxiliaryConsumer,
      boundary: 'Real shipped @aexos/install entrypoint installs the exact @aexos/core artifact, initializes Claude and verifies Doctor under an isolated profile; auxiliary npm registry publication is not claimed.' });
    const auxiliaryProfile = path.join(profile, '.aexos/user-config.yaml');
    fs.appendFileSync(auxiliaryProfile, '\n# OWNER_PROFILE_COMMENT\nowner_preference: preserve\n');
    const originalProfile = fs.readFileSync(auxiliaryProfile);
    for (const layout of ['unpacked', 'legacy-package']) {
      const brownfieldConsumer = path.join(workRoot, `auxiliary-${layout}-consumer`);
      fs.mkdirSync(brownfieldConsumer);
      writeJson(path.join(brownfieldConsumer, 'package.json'), { name: `aexos-${layout}-fixture`, version: '1.0.0', private: true });
      for (const directory of ['.aexos-core', '.claude', '.synapse']) {
        fs.cpSync(path.join(auxiliaryConsumer, directory), path.join(brownfieldConsumer, directory), { recursive: true });
      }
      if (layout === 'legacy-package') {
        // Reproduce the legacy resolution layout without inventing a historical release.
        fs.cpSync(path.join(auxiliaryConsumer, 'node_modules/@aexos/core'),
          path.join(brownfieldConsumer, 'node_modules/aexos-core'), { recursive: true });
      }
      const existingConfig = fs.readFileSync(path.join(brownfieldConsumer, '.aexos-core/core-config.yaml'));
      const brownfieldOutput = run(`installed-auxiliary-${layout}-migration`, [auxiliaryCli,
        '--ci', '--yes', '--skip-deps', '--ide', 'claude-code', '--core-package', evidence.artifact.path],
      brownfieldConsumer, undefined, 0, 1200000);
      assert(brownfieldOutput.includes('AEXOS installed successfully'));
      assert(brownfieldOutput.includes('Existing user profile preserved'));
      assert(fs.readFileSync(auxiliaryProfile).equals(originalProfile));
      assert.equal(readJson(path.join(brownfieldConsumer, 'node_modules/@aexos/core/package.json')).name, '@aexos/core');
      assert(fs.readFileSync(path.join(brownfieldConsumer, '.aexos-core/core-config.yaml.backup')).equals(existingConfig));
      assert(fs.existsSync(path.join(brownfieldConsumer, '.aexos-core/framework-config.yaml')));
      journey(`installed-auxiliary-${layout}-migration`, 6, { isolated_consumer: brownfieldConsumer,
        boundary: 'Real scoped dependency installation, migration and Doctor against an explicit legacy-layout fixture; original profile bytes and migration backup preserved. This is not a claim about an unavailable historical release.' });
    }
    const globalPrefix = path.join(workRoot, 'global prefix');
    run('isolated-global-package-install', [npmCli, 'install', '--global', '--prefix', globalPrefix,
      evidence.artifact.path, '--prefer-offline', '--no-audit', '--no-fund'], workRoot);
    const globalModules = run('isolated-global-package-root', [npmCli, 'root', '--global', '--prefix', globalPrefix], workRoot).trim();
    assert(globalModules.startsWith(globalPrefix + path.sep));
    const globalRoot = path.join(globalModules, '@aexos/core');
    assert.equal(readJson(path.join(globalRoot, 'package.json')).version, manifest.version);
    assert(!fs.lstatSync(globalRoot).isSymbolicLink());
    const globalConsumer = path.join(workRoot, 'global consumer');
    fs.mkdirSync(globalConsumer);
    const globalBin = path.join(globalPrefix, process.platform === 'win32' ? 'aexos.cmd' : 'bin/aexos');
    assert(fs.existsSync(globalBin));
    const invokeGlobal = (label, args) => process.platform === 'win32'
      ? runExecutable(label, process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
        ['/d', '/s', '/c', `""${globalBin}" ${args.join(' ')}"`], globalConsumer)
      : runExecutable(label, globalBin, args, globalConsumer);
    assert(invokeGlobal('isolated-global-public-shim-version', ['--version']).includes(manifest.version));
    invokeGlobal('isolated-global-public-shim-install', ['install', '--ci', '--yes', '--ide', 'codex']);
    assert(fs.existsSync(path.join(globalConsumer, '.aexos-core/development/agents/dev.md')));
    assert(fs.existsSync(path.join(globalConsumer, '.codex/skills/aexos-dev/SKILL.md')));
    journey('isolated-global-prefix-shim-and-project-install', 7, { isolated_consumer: globalConsumer, package_root: globalRoot,
      boundary: 'Actual npm global mode with an isolated temporary prefix and profile, public platform shim, and Codex project generation. No personal global installation or live Codex activation.' });
    const uninstall = JSON.parse(run('installed-managed-uninstall', [
      path.join(installedRoot, 'scripts/parity/installed-uninstall-scenario.js'), installedRoot,
      path.join(workRoot, 'uninstall-consumer')], workRoot).trim().split('\n').at(-1));
    assert.equal(uninstall.success, true);
    assert(uninstall.assertions.length >= 2);
    journey('installed-managed-uninstall-preservation', uninstall.assertions.length, {
      isolated_consumer: uninstall.isolated_consumer, checks: uninstall.checks,
      boundary: 'Real packaged CLI dry run and uninstall in a disposable consumer. New Grok/template/Claude-command ownership and keep-data only; legacy exclusive-directory semantics remain separate.' });
    const doctor = JSON.parse(run('installed-doctor-after-recovery', [cli, 'doctor', '--json'], project));
    assert.equal(doctor.summary.fail, 0);
    assert.equal(doctor.checks.find(check => check.check === 'npm-packages').status, 'PASS');
    assert.equal(doctor.checks.find(check => check.check === 'ide-sync').status, 'PASS');
    assert.equal(doctor.checks.find(check => check.check === 'settings-json').status, 'PASS');
    journey('doctor-after-install-and-recovery', 4, { summary: doctor.summary,
      boundary: 'Local Claude-configured consumer; reported warnings and skipped peer checks are retained, not treated as live-host validation.' });
    const standalone = JSON.parse(run('standalone-distribution-contracts', [
      path.join(installedRoot, 'scripts/parity/installed-standalone-scenario.js'), tarball, ROOT, workRoot,
    ], workRoot, undefined, 0, 1800000).trim().split('\n').at(-1));
    assert.equal(standalone.status, 'passed');
    assert.equal(standalone.artifacts.length, 4);
    assert.equal(standalone.assertions, standalone.checks.length);
    assert(standalone.checks.includes('standalone-doctor-zero-failures'));
    assert(standalone.checks.includes('pro-actual-local-entitlement-absence'));
    evidence.additional_artifacts = standalone.artifacts;
    journey('standalone-distribution-contracts', standalone.assertions, standalone);
    evidence.status = 'passed';
    evidence.scope = `Named local ${process.platform} journeys including configuration migration, explicit transition from the actual published 5.3.0 artifact to the candidate version, synthetic older-version update, real dependency reconciliation and restart recovery. Other historical releases, automatic registry update discovery, live hosts/providers, other operating systems and total parity require separate evidence. Inaccessible private Pro content is excluded by the owner; public Pro interfaces remain required.`;
    evidence.consumer_lock_sha256 = sha256(fs.readFileSync(path.join(project, 'package-lock.json')));
  } catch (error) {
    evidence.status = 'failed';
    evidence.failure = error.message;
    process.exitCode = 1;
    console.error(`[parity:installed] ${error.message}`);
  } finally {
    evidence.finished_at = new Date().toISOString();
    evidence.candidate_after = candidateIdentity();
    evidence.candidate_unchanged = evidence.candidate.tree_digest === evidence.candidate_after.tree_digest;
    if (!evidence.candidate_unchanged) { evidence.status = 'stale'; process.exitCode = 1; }
    writeJson(reportPath, evidence);
    console.log(JSON.stringify({ status: evidence.status, report: reportPath, work_root: workRoot, artifact: evidence.artifact, journeys: evidence.journeys.length }, null, 2));
  }
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
