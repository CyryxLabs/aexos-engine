#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

async function main() {
  const installedRoot = path.resolve(__dirname, '../..');
  const consumer = path.resolve(process.argv[2] || '');
  assert(process.argv[2] && !fs.existsSync(consumer), 'Provide a new disposable consumer path');
  fs.mkdirSync(consumer);
  const initialCwd = process.cwd();
  process.chdir(consumer);
  let assertions = 0;
  const check = (value, message) => { assert(value, message); assertions++; };
  try {
    const i18n = require(path.join(installedRoot, 'packages/installer/src/wizard/i18n'));
    const questions = require(path.join(installedRoot, 'packages/installer/src/wizard/questions'));
    for (const locale of ['en', 'pt', 'es']) {
      i18n.setLanguage(locale);
      check(i18n.getLanguage() === locale, `Locale ${locale} did not activate`);
      check(Object.keys(i18n.TRANSLATIONS[locale]).length === Object.keys(i18n.TRANSLATIONS.en).length, 'Incomplete locale');
      check(questions.getProjectTypeQuestion().message === i18n.t('projectTypeQuestion'), 'Question did not consume locale');
      check(i18n.tf('proIncorrectPassword', { remaining: 2 }).includes('2'), 'Placeholder did not render');
    }
    i18n.setLanguage('en');

    const generator = require(path.join(installedRoot, 'packages/installer/src/wizard/ide-config-generator'));
    fs.mkdirSync(path.join(consumer, '.claude/hooks'), { recursive: true });
    const customPath = path.join(consumer, '.claude/CLAUDE.md');
    const settingsPath = path.join(consumer, '.claude/settings.local.json');
    fs.writeFileSync(customPath, '# Custom project instructions\nPreserve this content.\n');
    fs.writeFileSync(settingsPath, '{broken');
    const failed = await generator.generateIDEConfigs(['claude-code'], { projectName: 'installed-sprint', projectType: 'brownfield' },
      { projectRoot: consumer, forceMerge: true, ci: true, yes: true });
    check(failed.success === false, 'Malformed settings were accepted');
    check(fs.readFileSync(customPath, 'utf8') === '# Custom project instructions\nPreserve this content.\n', 'Recovery lost existing rules');
    check(fs.readFileSync(settingsPath, 'utf8') === '{broken', 'Malformed settings were overwritten');
    fs.writeFileSync(settingsPath, '{ "custom": false, "permissions": { "deny": ["Write(.env)"] } }\n');
    const passed = await generator.generateIDEConfigs(['claude-code'], { projectName: 'installed-sprint', projectType: 'brownfield' },
      { projectRoot: consumer, forceMerge: true, ci: true, yes: true });
    check(passed.success === true, JSON.stringify(passed.errors));
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    check(settings.custom === false && settings.permissions.deny.includes('Write(.env)'), 'Settings merge lost custom permission');
    const before = fs.readFileSync(settingsPath);
    await generator.createClaudeSettingsLocal(consumer);
    check(fs.readFileSync(settingsPath).equals(before), 'Re-registration changed existing settings');

    fs.mkdirSync(path.join(consumer, '.aexos-core'), { recursive: true });
    fs.copyFileSync(path.join(installedRoot, '.aexos-core/core-config.yaml'), path.join(consumer, '.aexos-core/core-config.yaml'));
    const decisions = require(path.join(installedRoot, '.aexos-core/development/scripts/decision-recorder'));
    const previous = await decisions.initializeDecisionLogging('dev', 'prior.md', { enabled: true });
    decisions.recordDecision({ description: 'Prior session', reason: 'fixture' });
    await decisions.initializeDecisionLogging('qa', 'disabled.md', { enabled: false });
    check(decisions.getCurrentContext() === null, 'Disabled session retained previous context');
    check(decisions.recordDecision({ description: 'Do not record', reason: 'disabled' }) === null, 'Disabled session recorded data');
    check(previous.decisions.length === 1, 'Disabled session leaked into previous context');

    const pro = require(path.join(installedRoot, 'packages/installer/src/wizard/pro-setup'));
    const fixtureRoot = path.join(consumer, 'artifact-fixture');
    fs.mkdirSync(path.join(fixtureRoot, 'package'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'package/package.json'), JSON.stringify({ name: '@aexos/pro', version: '0.0.0-fixture',
      dependencies: { 'nonexistent-parity-test-package': '0.0.0' }, scripts: { install: 'exit 77' } }));
    fs.writeFileSync(path.join(fixtureRoot, 'package/content.md'), 'Static public-client fixture; no private Pro source.');
    const tarball = path.join(fixtureRoot, 'fixture.tgz');
    await require('tar').c({ cwd: fixtureRoot, file: tarball, gzip: true }, ['package']);
    const extracted = await pro._testing.extractProArtifactToTemp(tarball, path.join(consumer, 'staging with spaces'));
    check(fs.readFileSync(path.join(extracted, 'content.md'), 'utf8').includes('public-client fixture'), 'Artifact staging failed');
    check(!fs.existsSync(path.join(extracted, 'node_modules')), 'Static staging resolved dependencies');
    check((await pro.stepVerify({ copiedFiles: ['missing.md'] }, { targetDir: extracted })).success === false, 'Missing Pro file accepted');
    check((await pro.stepVerify({ copiedFiles: ['content.md'] }, { targetDir: extracted })).success === true, 'Readable installed file rejected');

    const configPath = path.join(consumer, '.aexos-core/core-config.yaml');
    const yaml = require('js-yaml');
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    config.devLoadAlwaysFiles = ['context-fixture.md'];
    fs.writeFileSync(configPath, yaml.dump(config));
    fs.writeFileSync(path.join(consumer, 'context-fixture.md'), '# Original context');
    const ContextLoader = require(path.join(installedRoot, '.aexos-core/development/scripts/dev-context-loader'));
    const contextLoader = new ContextLoader();
    await contextLoader.load({ fullLoad: true });
    check((await contextLoader.load({ fullLoad: true })).cacheHits === 1, 'Context cache did not activate');
    fs.writeFileSync(path.join(consumer, 'context-fixture.md'), '# Changed installed context');
    check((await contextLoader.load({ fullLoad: true })).files[0].content === '# Changed installed context', 'Context cache served stale instructions');
    check(contextLoader.getCacheKey('a-b.md', true) !== contextLoader.getCacheKey('a_b.md', true), 'Distinct context paths collided');
    const PreferenceManager = require(path.join(installedRoot, '.aexos-core/development/scripts/greeting-preference-manager'));
    const manager = new PreferenceManager(consumer);
    manager.setPreference('named');
    check(manager.getPreference() === 'named', 'Installed preference did not persist');
    const configurationBeforeFailure = fs.readFileSync(configPath);
    const rename = fs.renameSync;
    let failedReplacement = false;
    try {
      fs.renameSync = () => { throw new Error('Injected installed replacement failure'); };
      try { manager.setPreference('minimal'); } catch (error) { failedReplacement = error.message.includes('Injected installed replacement failure'); }
    } finally { fs.renameSync = rename; }
    check(failedReplacement, 'Replacement failure was swallowed');
    check(fs.readFileSync(configPath).equals(configurationBeforeFailure), 'Replacement failure destroyed configuration');

    const { execFileSync, spawnSync } = require('child_process');
    const gitRoot = path.join(consumer, 'ci-consumer');
    fs.mkdirSync(gitRoot);
    const git = args => execFileSync('git', args, { cwd: gitRoot, stdio: 'pipe', windowsHide: true });
    git(['init', '--quiet']);
    git(['-c', 'user.name=Parity Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'Fixture base']);
    // Generate the intentional security finding only inside this isolated fixture.
    const fakeCredential = 'FAKE_TEST_VALUE_NOT_A_CREDENTIAL';
    fs.writeFileSync(path.join(gitRoot, 'app.js'), `const password = ${JSON.stringify(fakeCredential)};\n`);
    git(['add', '--', 'app.js']);
    git(['-c', 'user.name=Parity Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture finding']);
    const review = spawnSync(process.execPath, [path.join(installedRoot, '.aexos-core/infrastructure/scripts/pr-review-ai.js'), '--local', 'HEAD~1', '--no-ai', '--security-only'],
      { cwd: gitRoot, encoding: 'utf8', windowsHide: true, timeout: 10000 });
    check(review.status === 1, 'Installed security CLI returned success for a critical finding');
    check(review.stdout.includes('request_changes') && review.stdout.includes('Potential hardcoded credential'), 'Security CLI did not report the actual finding');

    const storyRoot = path.join(consumer, 'story-consumer');
    fs.mkdirSync(path.join(storyRoot, 'docs/stories'), { recursive: true });
    const storyFile = path.join(storyRoot, 'docs/stories/story.md');
    fs.writeFileSync(storyFile, '# Story\n- [ ] Pending\n- [x] Complete\n');
    const validator = path.join(installedRoot, '.aexos-core/utils/aexos-validator.js');
    const validStories = spawnSync(process.execPath, [validator, 'stories'], { cwd: storyRoot, encoding: 'utf8', windowsHide: true });
    check(validStories.status === 0, 'Installed legacy validator did not execute');
    check(validStories.stdout.includes('1 Markdown files and 2 checkboxes'), 'Story gate did not measure its input');
    fs.appendFileSync(storyFile, '- [bad] Invalid state\n');
    const invalidStories = spawnSync(process.execPath, [validator, 'stories'], { cwd: storyRoot, encoding: 'utf8', windowsHide: true });
    check(invalidStories.status === 1, 'Story gate falsely accepted malformed checkbox');
    check(invalidStories.stdout.includes('Invalid checkbox state'), 'Story gate omitted its failure');
    const unknownValidator = spawnSync(process.execPath, [validator, 'unknown'], { cwd: storyRoot, encoding: 'utf8', windowsHide: true });
    check(unknownValidator.status === 1, 'Unknown validation silently succeeded');

    console.log(JSON.stringify({ status: 'passed', assertions, isolated_consumer: consumer,
      boundary: 'Real installed locale/question rendering, IDE recovery, permission retention, decision-session isolation, public artifact staging/readback, context-cache freshness, durable preference writes and local security CLI denial; no private Pro code, live entitlement or external AI call' }));
  } finally { process.chdir(initialCwd); }
}

if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { main };
