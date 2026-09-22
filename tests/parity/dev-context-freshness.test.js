'use strict';

const fs = require('fs').promises;
const path = require('path');
const DevContextLoader = require('../../.aexos-core/development/scripts/dev-context-loader');
const { createGreetingProject } = require('../helpers/isolated-greeting-project');

describe('Context cache freshness and path isolation', () => {
  let project;
  let loader;
  beforeEach(() => { project = createGreetingProject({ contextFixture: true }); loader = new DevContextLoader(); });
  afterEach(() => project.cleanup());
  test('returns edited source rather than stale memory or persisted context', async () => {
    const file = 'docs/fixture-context.md';
    await loader.load({ fullLoad: true });
    expect((await loader.load({ fullLoad: true })).cacheHits).toBe(1);
    await fs.writeFile(path.join(project.root, file), '# Changed requirement\nNew current content');
    for (const reader of [loader, new DevContextLoader()]) {
      const result = await reader.load({ fullLoad: true });
      expect(result.files[0].content).toBe('# Changed requirement\nNew current content');
    }
  });
  test('separates paths that previously normalized to one cache key', async () => {
    const names = ['docs/a-b.md', 'docs/a_b.md'];
    for (const name of names) await fs.writeFile(path.join(project.root, name), name);
    expect(loader.getCacheKey(names[0], true)).not.toBe(loader.getCacheKey(names[1], true));
    const result = await loader.loadFiles(names, { fullLoad: true });
    expect(result.map(file => file.content)).toEqual(names);
    const cached = await loader.loadFiles(names, { fullLoad: true });
    expect(cached.map(file => file.content)).toEqual(names);
    expect(cached.every(file => file.cached)).toBe(true);
  });

  test('reads changed configuration bytes even with the same size and timestamp', async () => {
    const config = path.join(project.root, '.aexos-core/core-config.yaml');
    const original = 'devLoadAlwaysFiles: [docs/first.md]\n';
    const changed = 'devLoadAlwaysFiles: [docs/other.md]\n';
    await fs.writeFile(path.join(project.root, 'docs/first.md'), 'first');
    await fs.writeFile(path.join(project.root, 'docs/other.md'), 'other');
    await fs.writeFile(config, original);
    const before = await fs.stat(config);
    expect((await loader.load({ fullLoad: true })).files[0].content).toBe('first');
    expect(Buffer.byteLength(changed)).toBe(Buffer.byteLength(original));
    await fs.writeFile(config, changed);
    await fs.utimes(config, before.atime, before.mtime);
    const current = await loader.load({ fullLoad: true });
    expect(current.files.map(file => file.path)).toEqual(['docs/other.md']);
    expect(current.files[0].content).toBe('other');
  });

  test('does not let mutation of a returned configuration poison later loads', async () => {
    const initial = await loader.loadCoreConfig();
    const expected = structuredClone(initial);
    initial.devLoadAlwaysFiles.push('docs/injected.md');
    initial.agentIdentity.greeting.preference = 'mutated';
    const second = await loader.loadCoreConfig();
    expect(second).toEqual(expected);
    second.devLoadAlwaysFiles.length = 0;
    expect(await loader.loadCoreConfig()).toEqual(expected);
    expect((await loader.load({ fullLoad: true })).filesCount).toBe(1);
  });

  test.each(['removed', 'invalid YAML'])('does not return cached configuration when config is %s', async failure => {
    const config = path.join(project.root, '.aexos-core/core-config.yaml');
    expect((await loader.load({ fullLoad: true })).filesCount).toBe(1);
    const bytes = await fs.readFile(config, 'utf8');
    if (failure === 'removed') await fs.unlink(config);
    else await fs.writeFile(config, 'devLoadAlwaysFiles: [unterminated');
    expect(await loader.loadCoreConfig()).toEqual({});
    expect(await loader.load({ fullLoad: true })).toMatchObject({ status: 'no_files', files: [] });
    await fs.writeFile(config, bytes);
    expect((await loader.load({ fullLoad: true })).filesCount).toBe(1);
  });

  test('does not reuse warm cached source after its file is deleted', async () => {
    const file = 'docs/fixture-context.md';
    await loader.load({ fullLoad: true });
    expect((await loader.load({ fullLoad: true })).cacheHits).toBe(1);
    await fs.unlink(path.join(project.root, file));
    for (const reader of [loader, new DevContextLoader()]) {
      const result = await reader.load({ fullLoad: true });
      expect(result.cacheHits).toBe(0);
      expect(result.files[0]).toMatchObject({ path: file, cached: false });
      expect(result.files[0].error).toMatch(/ENOENT/);
      expect(result.files[0]).not.toHaveProperty('content');
      expect(result.files[0]).not.toHaveProperty('summary');
    }
  });
});
