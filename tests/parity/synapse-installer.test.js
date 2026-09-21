'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const packageJson = require('../../package.json');
const {
  SYNAPSE_FILES,
  installSynapseDomains,
} = require('../../packages/installer/src/installer/synapse-installer');
const {
  rollbackInstallationArtifacts,
} = require('../../packages/installer/src/wizard')._testing;

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, '.synapse');

describe('SYNAPSE operational-domain installer', () => {
  let temp;

  beforeEach(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-synapse-install-')); });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.removeSync(temp);
  });

  test('copies every allowlisted operational domain from the installed source', async () => {
    const consumer = path.join(temp, 'consumer');
    const transaction = { newFiles: [], overwrittenFiles: [] };
    const result = await installSynapseDomains({
      targetDir: consumer,
      sourceDir: SOURCE,
      transaction,
    });

    expect(result.count).toBe(SYNAPSE_FILES.length);
    expect(transaction.newFiles).toEqual(result.copied);
    for (const name of SYNAPSE_FILES) {
      expect(await fs.readFile(path.join(consumer, '.synapse', name))).toEqual(
        await fs.readFile(path.join(SOURCE, name)),
      );
    }
    expect(await fs.pathExists(path.join(consumer, '.synapse', 'sessions'))).toBe(false);
    expect(await fs.pathExists(path.join(consumer, '.synapse', 'cache'))).toBe(false);
    expect(await fs.pathExists(path.join(consumer, '.synapse', 'metrics'))).toBe(false);
  });

  test('restores the consumer gitignore from the npm extraction filename', async () => {
    const source = path.join(temp, 'npm-extracted');
    for (const name of SYNAPSE_FILES) {
      await fs.outputFile(path.join(source, name === '.gitignore' ? '.npmignore' : name),
        await fs.readFile(path.join(SOURCE, name)));
    }
    const consumer = path.join(temp, 'consumer');
    await installSynapseDomains({ targetDir: consumer, sourceDir: source });
    expect(await fs.readFile(path.join(consumer, '.synapse/.gitignore')))
      .toEqual(await fs.readFile(path.join(SOURCE, '.gitignore')));
    expect(await fs.pathExists(path.join(consumer, '.synapse/.npmignore'))).toBe(false);
  });

  test('reinstall preserves existing domain bytes and unrelated runtime data', async () => {
    const consumer = path.join(temp, 'consumer');
    const manifest = path.join(consumer, '.synapse', 'manifest');
    const session = path.join(consumer, '.synapse', 'sessions', 'user-session.json');
    await fs.outputFile(manifest, Buffer.from([0, 1, 2, 255]));
    await fs.outputFile(session, '{"ownedBy":"user"}');

    const result = await installSynapseDomains({ targetDir: consumer, sourceDir: SOURCE });

    expect(await fs.readFile(manifest)).toEqual(Buffer.from([0, 1, 2, 255]));
    expect(await fs.readFile(session, 'utf8')).toBe('{"ownedBy":"user"}');
    expect(result.preserved).toContain(manifest);
    expect(result.count).toBe(SYNAPSE_FILES.length - 1);
  });

  test('validates every required source before writing to the consumer', async () => {
    const source = path.join(temp, 'incomplete-source');
    const consumer = path.join(temp, 'consumer');
    await fs.ensureDir(source);
    for (const name of SYNAPSE_FILES.slice(0, -1)) {
      await fs.outputFile(path.join(source, name), name);
    }

    await expect(installSynapseDomains({ targetDir: consumer, sourceDir: source }))
      .rejects.toThrow('Required packaged SYNAPSE file is missing or invalid');
    expect(await fs.pathExists(path.join(consumer, '.synapse'))).toBe(false);
  });

  test('journals partial writes so the existing rollback removes them', async () => {
    const consumer = path.join(temp, 'consumer');
    const transaction = { newFiles: [], overwrittenFiles: [] };
    let writes = 0;
    const fsImpl = {
      lstat: fs.lstat.bind(fs),
      readFile: fs.readFile.bind(fs),
      ensureDir: fs.ensureDir.bind(fs),
      async writeFile(destination, content, options) {
        writes += 1;
        await fs.writeFile(destination, content, options);
        if (writes === 3) {
          const error = new Error('injected write failure');
          error.code = 'EIO';
          throw error;
        }
      },
    };

    let installError;
    try {
      await installSynapseDomains({ targetDir: consumer, sourceDir: SOURCE, transaction, fsImpl });
    } catch (error) {
      installError = error;
    }
    expect(installError).toBeDefined();
    expect(transaction.newFiles).toHaveLength(3);

    await rollbackInstallationArtifacts(transaction, installError);
    for (const destination of transaction.newFiles) {
      expect(await fs.pathExists(destination)).toBe(false);
    }
  });

  test.each(['directory', 'link'])('rejects a required destination %s before copying any file', async kind => {
    const consumer = path.join(temp, 'consumer');
    const target = path.join(consumer, '.synapse/manifest');
    await fs.ensureDir(path.dirname(target));
    if (kind === 'directory') await fs.ensureDir(target);
    else {
      const unrelated = path.join(temp, 'unrelated');
      await fs.ensureDir(unrelated);
      await fs.symlink(unrelated, target, process.platform === 'win32' ? 'junction' : 'dir');
    }
    const transaction = { newFiles: [], overwrittenFiles: [] };
    await expect(installSynapseDomains({ targetDir: consumer, sourceDir: SOURCE, transaction }))
      .rejects.toThrow('invalid required SYNAPSE destination');
    expect(transaction.newFiles).toEqual([]);
    expect(await fs.readdir(path.dirname(target))).toEqual(['manifest']);
  });

  test('surfaces rollback cleanup failures instead of hiding incomplete recovery', async () => {
    const destination = path.join(temp, 'cannot-remove');
    await fs.outputFile(destination, 'partial');
    jest.spyOn(fs, 'remove').mockRejectedValueOnce(new Error('injected cleanup failure'));

    await expect(rollbackInstallationArtifacts(
      { newFiles: [destination], overwrittenFiles: [] },
      new Error('install failed'),
    )).rejects.toMatchObject({ rollbackIncomplete: true });
  });

  test('package allowlist includes only root operational files and excludes runtime state', () => {
    const packagedSynapse = packageJson.files
      .filter((entry) => entry.startsWith('.synapse/'))
      .map((entry) => entry.slice('.synapse/'.length));

    expect(packagedSynapse.sort()).toEqual([...SYNAPSE_FILES].sort());
    expect(packagedSynapse.some((entry) => /^(sessions|cache|metrics)(\/|$)/.test(entry))).toBe(false);
  });
});
