'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { applyProjection, readManifest, MANIFEST } = require(path.resolve(__dirname, '../../.aexos-core/infrastructure/scripts/grok-skills-sync/managed-projection'));
const { syncGrok } = require(path.resolve(__dirname, '../../.aexos-core/infrastructure/scripts/grok-skills-sync'));
const { generateIDEConfigs } = require(path.resolve(__dirname, '../../packages/installer/src/wizard/ide-config-generator'));
const { normalizeHook } = require(path.resolve(__dirname, '../../.aexos-core/core/virtual-office/host-hooks'));

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-managed-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

test('managed projection is deterministic and prunes only unchanged proven stale files', () => {
  applyProjection(root, [{ path: 'old.md', content: 'generated' }, { path: 'edited.md', content: 'original' }]);
  const first = fs.readFileSync(path.join(root, MANIFEST), 'utf8');
  applyProjection(root, [{ path: 'old.md', content: 'generated' }, { path: 'edited.md', content: 'original' }]);
  expect(fs.readFileSync(path.join(root, MANIFEST), 'utf8')).toBe(first);
  fs.writeFileSync(path.join(root, 'edited.md'), 'user edit');
  fs.writeFileSync(path.join(root, 'custom.md'), 'user file');
  const result = applyProjection(root, []);
  expect(result.removed).toEqual(['old.md']);
  expect(result.preserved).toEqual(['edited.md']);
  expect(fs.readFileSync(path.join(root, 'edited.md'), 'utf8')).toBe('user edit');
  expect(fs.readFileSync(path.join(root, 'custom.md'), 'utf8')).toBe('user file');
});

test('preflight preserves unknown and modified target files without partial installation', () => {
  fs.writeFileSync(path.join(root, 'custom.md'), 'untouched');
  expect(() => applyProjection(root, [{ path: 'new.md', content: 'new' }, { path: 'custom.md', content: 'replacement' }])).toThrow(/preserved/);
  expect(fs.existsSync(path.join(root, 'new.md'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'custom.md'), 'utf8')).toBe('untouched');
});

test('rules preserve user sections and reject edits inside owned sections', () => {
  fs.mkdirSync(path.join(root, 'rules'));
  fs.writeFileSync(path.join(root, 'rules/core.md'), '# My rule\n');
  applyProjection(root, [{ path: 'rules/core.md', content: 'generated v1' }]);
  applyProjection(root, [{ path: 'rules/core.md', content: 'generated v2' }]);
  const file = path.join(root, 'rules/core.md');
  expect(fs.readFileSync(file, 'utf8')).toContain('# My rule\n');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('generated v2', 'user changed section'));
  expect(() => applyProjection(root, [{ path: 'rules/core.md', content: 'generated v3' }])).toThrow(/Modified/);
});

test('corrupt ownership and traversal cannot authorize a mutation', () => {
  fs.writeFileSync(path.join(root, MANIFEST), '{');
  expect(() => applyProjection(root, [])).toThrow();
  fs.unlinkSync(path.join(root, MANIFEST));
  expect(() => applyProjection(root, [{ path: '../escape.md', content: 'bad' }])).toThrow(/escapes/);
  expect(() => applyProjection(root, [{ path: 'file.txt:stream', content: 'bad' }])).toThrow(/Invalid/);
});

test('linked directories and hard-linked targets are rejected', () => {
  const external = path.join(root, 'external');
  const target = path.join(root, 'target');
  fs.mkdirSync(external); fs.mkdirSync(target);
  fs.symlinkSync(external, path.join(target, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => applyProjection(target, [{ path: 'linked/file.md', content: 'bad' }])).toThrow(/Linked/);
  fs.writeFileSync(path.join(external, 'original.md'), 'original');
  fs.linkSync(path.join(external, 'original.md'), path.join(target, 'alias.md'));
  expect(() => applyProjection(target, [{ path: 'alias.md', content: 'original' }])).toThrow(/independent/);
});

test('dry run makes no destination writes', () => {
  const target = path.join(root, 'dry');
  applyProjection(target, [{ path: 'file.md', content: 'example' }], { dryRun: true });
  expect(fs.existsSync(target)).toBe(false);
});

(process.platform === 'win32' ? test : test.skip)('case-only Windows path changes never delete desired files', () => {
  applyProjection(root, [{ path: 'Agent.md', content: 'same' }]);
  const updated = applyProjection(root, [{ path: 'agent.md', content: 'updated' }]);
  expect(updated.removed).toEqual([]);
  expect(fs.readFileSync(path.join(root, 'agent.md'), 'utf8')).toBe('updated');
});

test('concurrent user edits after preflight are preserved', () => {
  applyProjection(root, [{ path: 'agent.md', content: 'v1' }]);
  const mkdir = fs.mkdirSync;
  const spy = jest.spyOn(fs, 'mkdirSync').mockImplementation((...args) => {
    fs.writeFileSync(path.join(root, 'agent.md'), 'concurrent user edit');
    return mkdir(...args);
  });
  try {
    expect(() => applyProjection(root, [{ path: 'agent.md', content: 'v2' }])).toThrow(/changed during/);
    expect(fs.readFileSync(path.join(root, 'agent.md'), 'utf8')).toBe('concurrent user edit');
  } finally { spy.mockRestore(); }
});

test('selected Grok installation uses target canonical agents and leaves other hosts absent', async () => {
  const agents = path.join(root, '.aexos-core/development/agents');
  fs.mkdirSync(agents, { recursive: true });
  fs.copyFileSync(path.resolve('.aexos-core/development/agents/dev.md'), path.join(agents, 'dev.md'));
  const none = await generateIDEConfigs([], {}, { projectRoot: root, ci: true });
  expect(none.success).toBe(true);
  expect(fs.existsSync(path.join(root, '.grok'))).toBe(false);
  const installed = await generateIDEConfigs(['grok'], {}, { projectRoot: root, ci: true });
  expect(installed.success).toBe(true);
  const manifest = readManifest(path.join(root, '.grok'));
  expect(manifest.files.some((entry) => entry.path === 'hooks/aexos-office.json')).toBe(true);
  expect(fs.existsSync(path.join(root, '.grok/agents/aexos-dev.md'))).toBe(true);
  expect(fs.existsSync(path.join(root, '.grok/agents/aexos-master.md'))).toBe(false);
  expect(fs.existsSync(path.join(root, '.claude'))).toBe(false);
  expect(syncGrok({ projectRoot: root, quiet: true }).agents).toBe(1);
  fs.writeFileSync(path.join(root, '.grok/agents/aexos-dev.md'), 'custom');
  const failed = await generateIDEConfigs(['grok'], {}, { projectRoot: root, ci: true });
  expect(failed.success).toBe(false);
});

test('native Grok envelope is reduced to lifecycle metadata only', () => {
  const result = normalizeHook('grok', { hookEventName: 'pre_tool_use', sessionId: 'session', cwd: root,
    toolName: 'read_file', toolInput: { secret: 'PRIVATE' }, prompt: 'PRIVATE', timestamp: new Date().toISOString(), promptId: 'turn' }, root);
  expect(result).toMatchObject({ data: { host: 'grok', sessionId: 'session', runId: 'turn', toolName: 'read_file' } });
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});

test('hook generation failure leaves the target projection untouched', () => {
  const agents = path.join(root, '.aexos-core/development/agents');
  fs.mkdirSync(agents, { recursive: true });
  fs.copyFileSync(path.resolve('.aexos-core/development/agents/dev.md'), path.join(agents, 'dev.md'));
  const hooksModule = path.resolve('.aexos-core/core/virtual-office/host-hooks');
  jest.doMock(hooksModule, () => ({ hookConfiguration: () => { throw new Error('Hook generation unavailable'); } }));
  try {
    jest.isolateModules(() => {
      const isolatedSync = require(path.resolve('.aexos-core/infrastructure/scripts/grok-skills-sync')).syncGrok;
      expect(() => isolatedSync({ projectRoot: root })).toThrow('Hook generation unavailable');
    });
    expect(fs.existsSync(path.join(root, '.grok'))).toBe(false);
  } finally { jest.dontMock(hooksModule); }
});
