'use strict';

jest.mock('child_process', () => ({ execSync: jest.fn(), spawnSync: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { SquadPublisher, isValidName } = require('../../.aexos-core/development/scripts/squad/squad-publisher');

describe('squad publisher transaction and result integrity', () => {
  let root, source, publisher, temporaryRoots;
  const manifest = { name: 'test-squad', version: '1.0.0', author: 'Fixture author' };
  const registry = () => ({ version: '1.0.0', squads: { official: [], community: [] } });
  const success = stdout => ({ status: 0, stdout: stdout || '', stderr: '' });
  const invoke = () => publisher._createPR(source, manifest, 'squad/test-squad', 'Add squad: test-squad', 'First line\n\nSecond line', 'official');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-publisher-regression-'));
    source = path.join(root, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'squad.yaml'), 'name: test-squad\nversion: 1.0.0\n');
    publisher = new SquadPublisher({ repo: 'CyryxLabs/aexos-squads' });
    temporaryRoots = [];
    jest.spyOn(os, 'tmpdir').mockReturnValue(root);
    jest.spyOn(process, 'cwd').mockReturnValue(root);
    spawnSync.mockReset();
    spawnSync.mockImplementation((command, args) => {
      if (command === 'gh' && args[0] === 'api') {
        return success(args[1] === 'user' ? 'fixture-owner\n' : 'CyryxLabs/aexos-squads\n');
      }
      if (command === 'gh' && args[0] === 'repo' && args[1] === 'clone') {
        temporaryRoots.push(args[3]);
        fs.writeFileSync(path.join(args[3], 'registry.json'), JSON.stringify(registry()));
      }
      if (command === 'gh' && args[0] === 'pr') {
        const bodyPath = args[args.indexOf('--body-file') + 1];
        expect(fs.readFileSync(bodyPath, 'utf8')).toBe('First line\n\nSecond line');
        return success(`https://${process.env.GH_HOST || 'github.com'}/CyryxLabs/aexos-squads/pull/42\n`);
      }
      return success();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (root && path.basename(root).startsWith('aexos-publisher-regression-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('uses the authenticated fork, an exclusive temporary directory and explicit PR head', async () => {
    const ownerDirectory = path.join(root, '.tmp-squad-publish');
    fs.mkdirSync(ownerDirectory);
    fs.writeFileSync(path.join(ownerDirectory, 'owner.txt'), 'Preserve existing work');
    const update = jest.spyOn(publisher, '_updateRegistry');
    expect(await invoke()).toMatch(/\/pull\/42$/);
    expect(spawnSync).toHaveBeenCalledWith('gh', ['repo', 'clone', 'fixture-owner/aexos-squads', expect.any(String), '--', '--depth', '1'], expect.any(Object));
    expect(spawnSync).toHaveBeenCalledWith('git', ['add', '--', 'packages/test-squad', 'registry.json'], expect.any(Object));
    expect(spawnSync.mock.calls.find(([command, args]) => command === 'gh' && args[0] === 'pr')[1])
      .toEqual(expect.arrayContaining(['--head', 'fixture-owner:squad/test-squad']));
    expect(update).toHaveBeenCalledWith(expect.any(String), manifest, 'official');
    expect(fs.readFileSync(path.join(ownerDirectory, 'owner.txt'), 'utf8')).toBe('Preserve existing work');
    expect(temporaryRoots).toHaveLength(1);
    expect(fs.existsSync(temporaryRoots[0])).toBe(false);
  });

  test.each(['fork', 'clone', 'checkout', 'add', 'commit', 'push', 'pr'])('stops after %s fails', async stage => {
    const normal = spawnSync.getMockImplementation();
    let failureCall;
    spawnSync.mockImplementation((command, args, options) => {
      const current = command === 'git' ? args[0] : args[0] === 'pr' ? 'pr' : args[1];
      if (current === stage) {
        failureCall = spawnSync.mock.calls.length;
        return { status: 1, stdout: '', stderr: `${stage} rejected` };
      }
      return normal(command, args, options);
    });
    await expect(invoke()).rejects.toMatchObject({ code: 'PR_ERROR' });
    expect(failureCall).toBeGreaterThan(0);
    expect(spawnSync.mock.calls).toHaveLength(failureCall);
    for (const directory of temporaryRoots) expect(fs.existsSync(directory)).toBe(false);
  });

  test('rejects an unrelated repository masquerading as the user fork', async () => {
    const normal = spawnSync.getMockImplementation();
    spawnSync.mockImplementation((command, args, options) => args[1] === 'repos/fixture-owner/aexos-squads'
      ? success('unrelated/repository') : normal(command, args, options));
    await expect(invoke()).rejects.toThrow('fork does not belong');
    expect(temporaryRoots).toHaveLength(0);
  });

  test('writes PR body outside the cloned tree and preserves a linked external file', async () => {
    const sentinel = path.join(root, 'external-owner-file.txt');
    fs.writeFileSync(sentinel, 'Do not overwrite this file');
    const normal = spawnSync.getMockImplementation();
    let bodyDirectory;
    spawnSync.mockImplementation((command, args, options) => {
      const result = normal(command, args, options);
      if (command === 'gh' && args[0] === 'repo' && args[1] === 'clone') {
        const link = path.join(args[3], 'pr-body.md');
        try { fs.symlinkSync(sentinel, link, 'file'); } catch (error) {
          // Windows hosts without symbolic-link privilege can still exercise
          // the same shared-file overwrite with an actual NTFS hard link.
          if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
          fs.linkSync(sentinel, link);
        }
      }
      if (command === 'gh' && args[0] === 'pr') {
        const body = args[args.indexOf('--body-file') + 1];
        bodyDirectory = path.dirname(body);
        expect(body.startsWith(temporaryRoots[0] + path.sep)).toBe(false);
        expect(fs.readFileSync(sentinel, 'utf8')).toBe('Do not overwrite this file');
      }
      return result;
    });
    await invoke();
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('Do not overwrite this file');
    expect(fs.existsSync(bodyDirectory)).toBe(false);
  });

  test.each(['', 'success', 'https://github.com/other/repository/pull/42',
    'https://untrusted.invalid/CyryxLabs/aexos-squads/pull/42'])('rejects nonbinding PR output %s', async output => {
    const normal = spawnSync.getMockImplementation();
    spawnSync.mockImplementation((command, args, options) => command === 'gh' && args[0] === 'pr'
      ? success(output) : normal(command, args, options));
    await expect(invoke()).rejects.toMatchObject({ code: 'PR_ERROR' });
  });

  test.each(['{ malformed', '{}', '{"squads":{"official":[],"community":{}}}'])('does not overwrite a corrupt registry: %s', async original => {
    const destination = path.join(root, 'registry.json');
    fs.writeFileSync(destination, original);
    await expect(publisher._updateRegistry(destination, manifest)).rejects.toBeDefined();
    expect(fs.readFileSync(destination, 'utf8')).toBe(original);
  });

  test('updates the requested category and preserves unrelated entry fields and groups', async () => {
    const destination = path.join(root, 'registry.json');
    const before = registry();
    before.custom = { retained: true };
    before.squads.official.push({ name: manifest.name, version: '0.9.0', provenance: 'keep' });
    before.squads.community.push({ name: 'another-squad', version: '2.0.0' });
    fs.writeFileSync(destination, JSON.stringify(before));
    await publisher._updateRegistry(destination, manifest, 'official');
    const actual = JSON.parse(fs.readFileSync(destination, 'utf8'));
    expect(actual.custom).toEqual(before.custom);
    expect(actual.squads.community).toEqual(before.squads.community);
    expect(actual.squads.official[0]).toMatchObject({ name: manifest.name, version: '1.0.0', provenance: 'keep' });
  });

  test('does not truncate a registry when atomic replacement fails', async () => {
    const destination = path.join(root, 'registry.json');
    const original = JSON.stringify(registry());
    fs.writeFileSync(destination, original);
    jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('injected rename failure'); });
    await expect(publisher._updateRegistry(destination, manifest)).rejects.toThrow('injected rename');
    expect(fs.readFileSync(destination, 'utf8')).toBe(original);
  });

  test('rejects linked source content without copying the linked data', async () => {
    const outside = path.join(root, 'private');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'not for publication');
    fs.symlinkSync(outside, path.join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const destination = path.join(root, 'copy');
    await expect(publisher._copyDir(source, destination)).rejects.toThrow('symbolic link');
    expect(fs.existsSync(path.join(destination, 'linked/secret.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('not for publication');
  });

  test('rejects traversal identities and unknown categories', async () => {
    expect(isValidName('.')).toBe(false);
    expect(isValidName('..')).toBe(false);
    await expect(publisher.publish(source, { category: 'other' })).rejects.toMatchObject({ code: 'MANIFEST_ERROR' });
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
