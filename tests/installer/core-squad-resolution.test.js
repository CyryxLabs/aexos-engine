'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const resolver = '../../packages/installer/src/utils/package-paths';
const scaffolder = '../../packages/installer/src/installer/squad-scaffolder';

describe('standalone installer Core squad authority', () => {
  let fixture;

  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-core-resolution-'));
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock(resolver);
    jest.resetModules();
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  test('loads without Core and refuses scaffolding before writing a target', async () => {
    jest.doMock(resolver, () => ({ resolveCyryxCorePath: () => {
      throw new Error('AEXOS core package root not found. Install @aexos/core.');
    } }));
    const module = require(scaffolder);
    const target = path.join(fixture, 'target');
    const result = await module.scaffoldCoreSquads(target);
    expect(result).toMatchObject({ success: false, copied: [], skipped: [] });
    expect(result.errors[0].message).toContain('Install @aexos/core');
    expect(fs.existsSync(target)).toBe(false);
  });

  test('uses the selected Core allowlist rather than the surrounding checkout', async () => {
    jest.doMock(resolver, () => ({ resolveCyryxCorePath: (...segments) => path.join(fixture, ...segments) }));
    const manifestDir = path.join(fixture, '.aexos-core', 'data');
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(path.join(manifestDir, 'core-package-boundary.json'), JSON.stringify({ bundledSquads: ['fixture-core'] }));
    for (const name of ['fixture-core', 'security', 'private-content']) {
      const dir = path.join(fixture, 'squads', name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'squad.yaml'), `name: ${name}\n`);
    }
    const module = require(scaffolder);
    const target = path.join(fixture, 'target');
    expect(module.CORE_SQUADS).toEqual(['fixture-core']);
    const result = await module.scaffoldCoreSquads(target);
    expect(result).toEqual({ success: true, copied: ['fixture-core'], skipped: [], errors: [] });
    expect(fs.readdirSync(path.join(target, 'squads'))).toEqual(['fixture-core']);
  });

  test('rejects an invalid selected manifest before copying squad content', async () => {
    jest.doMock(resolver, () => ({ resolveCyryxCorePath: (...segments) => path.join(fixture, ...segments) }));
    const dir = path.join(fixture, '.aexos-core', 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'core-package-boundary.json'), JSON.stringify({ bundledSquads: ['../outside'] }));
    const target = path.join(fixture, 'target');
    const result = await require(scaffolder).scaffoldCoreSquads(target);
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain('invalid squad allowlist');
    expect(fs.existsSync(target)).toBe(false);
  });
});
