'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { CodebaseMapper } = require('../../../.aexos-core/infrastructure/scripts/codebase-mapper');
const { RegistryProvider } = require('../../../.aexos-core/core/code-intel/providers/registry-provider');
const { CodeIntelClient } = require('../../../.aexos-core/core/code-intel/code-intel-client');

function snapshot(root) {
  const files = new Map([
    [path.join(root, 'package.json'), JSON.stringify({ name: 'snapshot-fixture', dependencies: { ajv: '^8' } })],
    [path.join(root, 'index.js'), 'export function sample() { return 1; }\n'],
  ]);
  return {
    existsSync: name => name === root || files.has(name),
    promises: {
      async readdir(directory) {
        if (directory !== root) throw new Error('Absent snapshot directory');
        return [...files.keys()].sort().map(file => ({ name: path.basename(file), isDirectory: () => false, isFile: () => true }));
      },
      async stat(file) {
        if (!files.has(file)) throw new Error('Absent snapshot file');
        return { size: Buffer.byteLength(files.get(file)), mtime: new Date(0) };
      },
      async readFile(file) {
        if (!files.has(file)) throw new Error('Absent snapshot file');
        return files.get(file);
      },
    },
  };
}

afterEach(() => jest.restoreAllMocks());

test('mapper uses only the explicit immutable snapshot and refuses publication', async () => {
  const root = path.join(os.tmpdir(), 'aexos-virtual-snapshot');
  const mapper = new CodebaseMapper(root, { snapshotFs: snapshot(root), clock: () => new Date(0), quiet: true });
  const exists = jest.spyOn(fs, 'existsSync').mockImplementation(() => { throw new Error('Live fs not allowed'); });
  const read = jest.spyOn(fs.promises, 'readFile').mockImplementation(() => { throw new Error('Live fs not allowed'); });
  const scan = jest.spyOn(fs.promises, 'readdir').mockImplementation(() => { throw new Error('Live fs not allowed'); });
  const result = await mapper.generateMap();
  expect(result).toMatchObject({ project: 'snapshot-fixture', mappedAt: '1970-01-01T00:00:00.000Z',
    stats: { totalFiles: 2, codeFiles: 1 } });
  expect(result.dependencies.runtime).toContain('ajv');
  expect(exists).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(scan).not.toHaveBeenCalled();
  await expect(mapper.saveMap()).rejects.toMatchObject({ code: 'SNAPSHOT_READ_ONLY' });
});

test('legacy mapper still reads and generates a real project map', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-mapper-legacy-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"legacy-fixture"}');
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = 1;');
    const result = await new CodebaseMapper(root, { quiet: true }).generateMap();
    expect(result).toMatchObject({ project: 'legacy-fixture', stats: { totalFiles: 2, codeFiles: 1 } });
  } finally {
    if (path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('aexos-mapper-legacy-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('registry snapshot is detached from caller edits and never resolves a filesystem registry', async () => {
  const data = { entities: { functions: { sample: { path: 'index.js', type: 'function', layer: 'L4', keywords: [] } } } };
  const provider = new RegistryProvider({ registryData: data, registryPath: 'never-read.yaml' });
  delete data.entities.functions.sample;
  const resolve = jest.spyOn(provider, '_resolveRegistryPath');
  expect(provider.isAvailable()).toBe(true);
  expect(await provider.findDefinition('sample')).toBeTruthy();
  expect(resolve).not.toHaveBeenCalled();
  expect(() => new RegistryProvider({ registryData: null })).toThrow();
});

test('explicit providers cannot auto-register fallbacks and disabled cache observes each call', async () => {
  const provider = { name: 'snapshot', isAvailable: () => true, findDefinition: jest.fn().mockResolvedValue({ path: 'index.js' }) };
  const client = new CodeIntelClient({ providers: [provider], cacheEnabled: false });
  await client.findDefinition('sample'); await client.findDefinition('sample');
  expect(provider.findDefinition).toHaveBeenCalledTimes(2);
  expect(client.getMetrics().cacheHits).toBe(0);
  expect(new CodeIntelClient({ providers: [] }).isCodeIntelAvailable()).toBe(false);
  expect(() => new CodeIntelClient({ providers: null })).toThrow();
});
