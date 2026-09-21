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
});
