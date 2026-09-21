'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { createClaudeSettingsLocal, generateIDEConfigs } = require('../../packages/installer/src/wizard/ide-config-generator');
const { captureIdeState } = require('../../packages/installer/src/wizard/ide-state-snapshot');

describe('IDE settings preservation and failure recovery', () => {
  let root;
  let externalRoot;
  let displacedRoot;
  let settingsPath;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-ide-recovery-'));
    settingsPath = path.join(root, '.claude/settings.local.json');
    await fs.outputFile(path.join(root, '.claude/hooks/synapse-engine.cjs'), '// fixture hook');
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.remove(root);
    if (externalRoot) await fs.remove(externalRoot);
    if (displacedRoot) await fs.remove(displacedRoot);
  });

  test.each(['{broken', 'null', '[]', '{"hooks":false}', '{"hooks":{"UserPromptSubmit":{}}}'])('preserves malformed settings %s instead of claiming success', async content => {
    await fs.writeFile(settingsPath, content);
    await expect(createClaudeSettingsLocal(root)).rejects.toThrow(/invalid Claude/);
    expect(await fs.readFile(settingsPath, 'utf8')).toBe(content);
  });

  test('propagates a failed atomic replacement and preserves all original bytes', async () => {
    const original = '{ "permissions": { "deny": ["Bash(git push:*)"] }, "custom": false }\n';
    await fs.writeFile(settingsPath, original);
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('injected disk failure'));
    await expect(createClaudeSettingsLocal(root)).rejects.toThrow('Failed to write Claude settings');
    expect(await fs.readFile(settingsPath, 'utf8')).toBe(original);
    expect((await fs.readdir(path.dirname(settingsPath))).some(file => file.endsWith('.tmp'))).toBe(false);
  });

  test('idempotent registration retains formatting and permission choices', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ permissions: { deny: ['Write(.env)'] }, custom: false }));
    await createClaudeSettingsLocal(root);
    const value = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    const customized = JSON.stringify(value, null, 4) + '\n';
    await fs.writeFile(settingsPath, customized);
    await createClaudeSettingsLocal(root);
    expect(await fs.readFile(settingsPath, 'utf8')).toBe(customized);
    expect(value.permissions.deny).toEqual(['Write(.env)']);
    expect(value.custom).toBe(false);
  });

  test('restores overwritten originals and preserves unrelated files during rollback', async () => {
    const original = path.join(root, '.claude/CLAUDE.md');
    const custom = path.join(root, '.claude/templates/custom.md');
    await fs.outputFile(original, 'original rules');
    await fs.outputFile(custom, 'custom template');
    const snapshot = await captureIdeState(root, ['claude-code']);
    await fs.writeFile(original, 'merged rules');
    await fs.writeFile(custom, 'overwritten');
    const generated = path.join(root, '.claude/agents/generated.md');
    const concurrent = path.join(root, '.claude/agents/user-note.md');
    await fs.outputFile(generated, 'generated');
    await fs.writeFile(concurrent, 'keep this');
    const failures = await snapshot.rollback([original, custom, generated], [path.dirname(generated)]);
    expect(await fs.readFile(original, 'utf8')).toBe('original rules');
    expect(await fs.readFile(custom, 'utf8')).toBe('custom template');
    expect(await fs.pathExists(generated)).toBe(false);
    expect(await fs.readFile(concurrent, 'utf8')).toBe('keep this');
    expect(failures).toHaveLength(1);
  });

  test('attempts every restoration when one fails and reports the precise path', async () => {
    const first = path.join(root, '.claude/CLAUDE.md');
    await fs.outputFile(first, 'original');
    await fs.writeFile(settingsPath, '{}');
    const snapshot = await captureIdeState(root, ['claude-code']);
    await fs.writeFile(first, 'modified');
    await fs.writeFile(settingsPath, '{"modified":true}');
    const write = fs.writeFile.bind(fs);
    jest.spyOn(fs, 'writeFile').mockImplementation((file, ...args) => file === first ? Promise.reject(new Error('injected restoration failure')) : write(file, ...args));
    const failures = await snapshot.rollback([], []);
    expect(failures).toEqual([{ path: first, error: 'injected restoration failure' }]);
    expect(await fs.readFile(settingsPath, 'utf8')).toBe('{}');
  });

  test('real generator failure retains existing customized Claude surfaces', async () => {
    const original = path.join(root, '.claude/CLAUDE.md');
    const custom = path.join(root, '.claude/templates/custom.md');
    await fs.outputFile(original, '# Project custom rules\nKeep the application boundary.\n');
    await fs.outputFile(custom, 'custom template');
    await fs.writeFile(settingsPath, '{broken');
    const result = await generateIDEConfigs(['claude-code'], { projectName: 'parity-fixture', projectType: 'brownfield' }, { projectRoot: root, forceMerge: true, ci: true, yes: true });
    expect(result.success).toBe(false);
    expect(result.errors[0].error).toContain('invalid Claude settings');
    expect(await fs.readFile(original, 'utf8')).toBe('# Project custom rules\nKeep the application boundary.\n');
    expect(await fs.readFile(custom, 'utf8')).toBe('custom template');
    expect(await fs.readFile(settingsPath, 'utf8')).toBe('{broken');
  });

  test('rolls back a partial helper write registered before the copy fails', async () => {
    const originalCopy = fs.copy.bind(fs);
    let injected = false;
    jest.spyOn(fs, 'copy').mockImplementation(async (source, destination, options) => {
      if (!injected && destination.includes(path.join('.claude', 'commands', 'AEXOS', 'agents'))) {
        injected = true;
        await fs.writeFile(destination, 'partial helper bytes');
        throw new Error('injected mid-helper copy failure');
      }
      return originalCopy(source, destination, options);
    });

    const result = await generateIDEConfigs(
      ['claude-code'],
      { projectName: 'parity-fixture', projectType: 'greenfield' },
      { projectRoot: root, ci: true, yes: true },
    );

    expect(injected).toBe(true);
    expect(result.success).toBe(false);
    expect(result.errors[0].error).toContain('injected mid-helper copy failure');
    expect(result.rollbackIncomplete).toBe(false);
    expect(await fs.pathExists(path.join(root, '.claude', 'CLAUDE.md'))).toBe(false);
    expect(await fs.pathExists(path.join(root, '.claude', 'commands'))).toBe(false);
  });

  test('keeps an absent target owned by the journal after repeated registration', async () => {
    const snapshot = await captureIdeState(root, ['cursor']);
    const targetDir = path.join(root, '.cursor', 'rules', 'agents');
    const target = path.join(targetDir, 'generated.mdc');
    await snapshot.journal.registerDirectory(targetDir);
    await fs.ensureDir(targetDir);
    await snapshot.journal.registerFile(target);
    await fs.writeFile(target, 'partial generated content');
    await snapshot.journal.registerFile(target);
    await fs.writeFile(target, 'completed generated content');

    expect(await snapshot.rollback()).toEqual([]);
    expect(await fs.pathExists(target)).toBe(false);
  });

  test('removes a Cursor fallback file after its first transformed write partially fails', async () => {
    await fs.writeFile(settingsPath, '{broken');
    const originalWrite = fs.writeFile.bind(fs);
    let fallbackTarget;
    jest.spyOn(fs, 'writeFile').mockImplementation(async (file, ...args) => {
      if (!fallbackTarget && file.includes(path.join('.cursor', 'rules', 'agents'))) {
        fallbackTarget = file;
        await originalWrite(file, 'partial transformed content');
        throw new Error('injected Cursor transformer write failure');
      }
      return originalWrite(file, ...args);
    });

    const result = await generateIDEConfigs(
      ['cursor', 'claude-code'],
      { projectName: 'parity-fixture', projectType: 'greenfield' },
      { projectRoot: root, ci: true, yes: true },
    );

    expect(fallbackTarget).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.errors[0].error).toContain('invalid Claude settings');
    expect(result.rollbackIncomplete).toBe(false);
    expect(await fs.pathExists(fallbackTarget)).toBe(false);
  });

  test('reports a nonexistent project root without creating a partial project', async () => {
    const missingRoot = path.join(root, 'missing-project');
    const result = await generateIDEConfigs(
      ['cursor'],
      { projectName: 'parity-fixture', projectType: 'greenfield' },
      { projectRoot: missingRoot, ci: true, yes: true },
    );
    expect(result.success).toBe(false);
    expect(result.errors[0].error).toContain('project root does not exist');
    expect(await fs.pathExists(missingRoot)).toBe(false);
  });

  test('refuses rollback through a replaced parent junction and leaves external files untouched', async () => {
    const original = path.join(root, '.claude', 'CLAUDE.md');
    await fs.writeFile(original, 'original project rules');
    const snapshot = await captureIdeState(root, ['claude-code']);

    externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-ide-external-'));
    const sentinel = path.join(externalRoot, 'sentinel.txt');
    const redirectedOriginal = path.join(externalRoot, 'CLAUDE.md');
    const redirectedGenerated = path.join(externalRoot, 'generated.md');
    await fs.writeFile(sentinel, 'outside sentinel');
    await fs.writeFile(redirectedOriginal, 'outside project rules');
    await fs.writeFile(redirectedGenerated, 'outside generated file');

    await fs.move(path.join(root, '.claude'), path.join(root, '.claude-original'));
    await fs.symlink(externalRoot, path.join(root, '.claude'), 'junction');

    const failures = await snapshot.rollback([
      path.join(root, '.claude', 'generated.md'),
    ]);

    expect(failures.some((failure) => failure.error.includes('Unsafe IDE destination parent')))
      .toBe(true);
    expect(await fs.readFile(sentinel, 'utf8')).toBe('outside sentinel');
    expect(await fs.readFile(redirectedOriginal, 'utf8')).toBe('outside project rules');
    expect(await fs.readFile(redirectedGenerated, 'utf8')).toBe('outside generated file');
  });

  test('refuses rollback after the project root is replaced by an external junction', async () => {
    const original = path.join(root, '.claude', 'CLAUDE.md');
    await fs.writeFile(original, 'original project rules');
    const snapshot = await captureIdeState(root, ['claude-code']);

    externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-root-external-'));
    const redirectedClaude = path.join(externalRoot, '.claude');
    const sentinel = path.join(externalRoot, 'sentinel.txt');
    const redirectedOriginal = path.join(redirectedClaude, 'CLAUDE.md');
    const redirectedGenerated = path.join(redirectedClaude, 'generated.md');
    await fs.outputFile(redirectedOriginal, 'outside project rules');
    await fs.writeFile(redirectedGenerated, 'outside generated file');
    await fs.writeFile(sentinel, 'outside root sentinel');

    displacedRoot = `${root}-original`;
    await fs.move(root, displacedRoot);
    await fs.symlink(externalRoot, root, 'junction');

    const failures = await snapshot.rollback([
      path.join(root, '.claude', 'generated.md'),
    ]);

    expect(failures.some((failure) => failure.error.includes('Unsafe IDE project root')))
      .toBe(true);
    expect(await fs.readFile(sentinel, 'utf8')).toBe('outside root sentinel');
    expect(await fs.readFile(redirectedOriginal, 'utf8')).toBe('outside project rules');
    expect(await fs.readFile(redirectedGenerated, 'utf8')).toBe('outside generated file');
  });

  test('rejects a different real directory at the captured project-root path', async () => {
    const snapshot = await captureIdeState(root, ['cursor']);
    displacedRoot = `${root}-original`;
    await fs.move(root, displacedRoot);
    await fs.ensureDir(root);
    const sentinel = path.join(root, 'replacement-root-sentinel.txt');
    await fs.writeFile(sentinel, 'replacement directory content');

    await expect(snapshot.journal.registerDirectory(path.join(root, '.cursor', 'rules')))
      .rejects.toThrow('project root identity changed');
    expect(await fs.readFile(sentinel, 'utf8')).toBe('replacement directory content');
  });
});
