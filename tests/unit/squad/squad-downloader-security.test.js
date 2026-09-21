const os = require('os');
const path = require('path');
const fs = require('fs').promises;

jest.mock('https', () => ({ get: jest.fn() }));

const https = require('https');
const {
  SquadDownloader,
  DownloaderErrorCodes,
} = require('../../../.aexos-core/development/scripts/squad/squad-downloader');
const {
  SquadValidator,
} = require('../../../.aexos-core/development/scripts/squad/squad-validator');

const REGISTRY_URL = 'https://fixtures.invalid/registry.json';
const CONTENT_API_BASE = 'https://fixtures.invalid/contents/packages';
const MANIFEST_URL = 'https://files.invalid/squad.yaml';

function catalog(name = 'secure-squad', version = '1.0.0') {
  return {
    version: '1.0.0',
    squads: { official: [{ name, version }], community: [] },
  };
}

function createDownloader(squadsPath, options = {}) {
  const downloader = new SquadDownloader({
    squadsPath,
    registryUrl: REGISTRY_URL,
    contentApiBase: CONTENT_API_BASE,
    contentDownloadOrigins: ['https://files.invalid'],
    ...options,
  });
  let registry = catalog();
  let entries = [
    { type: 'file', name: 'squad.yaml', download_url: MANIFEST_URL },
  ];
  let manifest = 'name: secure-squad\nversion: 1.0.0\n';
  const requests = [];
  downloader._fetch = jest.fn(async (url) => {
    requests.push(url);
    if (url === REGISTRY_URL) return Buffer.from(JSON.stringify(registry));
    if (url === `${CONTENT_API_BASE}/secure-squad`) {
      return Buffer.from(JSON.stringify(entries));
    }
    if (url === MANIFEST_URL) return Buffer.from(manifest);
    if (url.startsWith('https://files.invalid/')) return Buffer.from('content');
    throw new Error(`Unexpected fixture URL: ${url}`);
  });
  return {
    downloader,
    requests,
    setRegistry(value) {
      registry = value;
    },
    setEntries(value) {
      entries = value;
    },
    setManifest(value) {
      manifest = value;
    },
  };
}

describe('SquadDownloader secure staged downloads', () => {
  let workRoot;
  let squadsPath;

  beforeEach(async () => {
    workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-squad-download-'));
    squadsPath = path.join(workRoot, 'squads');
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(workRoot, { recursive: true, force: true });
  });

  it('uses the configured content endpoint and accepts legitimate Git file names', async () => {
    const fixture = createDownloader(squadsPath);
    fixture.setEntries([
      { type: 'file', name: 'squad.yaml', download_url: MANIFEST_URL },
      { type: 'file', name: '.gitignore', download_url: 'https://files.invalid/gitignore' },
      { type: 'file', name: 'Guia do José.md', download_url: 'https://files.invalid/guide' },
    ]);

    const result = await fixture.downloader.download('secure-squad@1.0.0', {
      validate: false,
    });

    expect(fixture.requests).toContain(`${CONTENT_API_BASE}/secure-squad`);
    expect(await fs.readFile(path.join(result.path, '.gitignore'), 'utf8')).toBe('content');
    expect(await fs.readFile(path.join(result.path, 'Guia do José.md'), 'utf8')).toBe(
      'content',
    );
    expect(result.manifest).toMatchObject({ name: 'secure-squad', version: '1.0.0' });
  });

  it('rejects malformed catalogs without caching them', async () => {
    const fixture = createDownloader(squadsPath);
    fixture.setRegistry({});

    await expect(fixture.downloader.listAvailable()).rejects.toMatchObject({
      code: DownloaderErrorCodes.REGISTRY_FETCH_ERROR,
    });
    expect(fixture.downloader._registryCache).toBeNull();
  });

  it('rejects unsupported explicit versions before requesting content', async () => {
    const fixture = createDownloader(squadsPath);

    await expect(fixture.downloader.download('secure-squad@2.0.0')).rejects.toMatchObject({
      code: DownloaderErrorCodes.VERSION_NOT_FOUND,
    });
    expect(fixture.requests).toEqual([REGISTRY_URL]);
  });

  it('rejects mismatched manifest identity and removes staging', async () => {
    const fixture = createDownloader(squadsPath);
    fixture.setManifest('name: another-squad\nversion: 1.0.0\n');

    await expect(
      fixture.downloader.download('secure-squad', { validate: false }),
    ).rejects.toMatchObject({ code: DownloaderErrorCodes.VALIDATION_ERROR });
    await expect(fs.access(path.join(squadsPath, 'secure-squad'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await fs.readdir(squadsPath)).filter((name) => name.startsWith('.aexos-'))).toEqual(
      [],
    );
  });

  it('treats a missing manifest as failure and does not create a destination', async () => {
    const fixture = createDownloader(squadsPath);
    fixture.setEntries([
      { type: 'file', name: '.gitignore', download_url: 'https://files.invalid/gitignore' },
    ]);

    await expect(
      fixture.downloader.download('secure-squad', { validate: false }),
    ).rejects.toMatchObject({ code: DownloaderErrorCodes.VALIDATION_ERROR });
    await expect(fs.access(path.join(squadsPath, 'secure-squad'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it.each([
    ['validator exception', () => Promise.reject(new Error('validator crashed'))],
    [
      'contradictory validator result',
      () => Promise.resolve({ valid: true, errors: [{ message: 'still broken' }], warnings: [] }),
    ],
  ])('preserves an existing squad after a %s', async (_label, validationResult) => {
    const targetPath = path.join(squadsPath, 'secure-squad');
    await fs.mkdir(targetPath, { recursive: true });
    await fs.writeFile(path.join(targetPath, 'owner-note.txt'), 'preserve me');
    await fs.writeFile(
      path.join(targetPath, 'squad.yaml'),
      'name: secure-squad\nversion: 0.9.0\n',
    );
    const fixture = createDownloader(squadsPath, { overwrite: true });
    jest.spyOn(SquadValidator.prototype, 'validate').mockImplementation(validationResult);

    await expect(fixture.downloader.download('secure-squad')).rejects.toMatchObject({
      code: DownloaderErrorCodes.VALIDATION_ERROR,
    });
    expect(await fs.readFile(path.join(targetPath, 'owner-note.txt'), 'utf8')).toBe(
      'preserve me',
    );
    expect(await fs.readFile(path.join(targetPath, 'squad.yaml'), 'utf8')).toContain('0.9.0');
  });

  it('rejects traversal and Windows unsafe names without writing outside staging', async () => {
    const fixture = createDownloader(squadsPath);
    fixture.setEntries([
      { type: 'file', name: '../escape.txt', download_url: MANIFEST_URL },
    ]);

    await expect(
      fixture.downloader.download('secure-squad', { validate: false }),
    ).rejects.toMatchObject({ code: DownloaderErrorCodes.DOWNLOAD_ERROR });
    await expect(fs.access(path.join(squadsPath, 'escape.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    for (const unsafeName of ['CON', 'stream:ads', 'trailing.']) {
      expect(() => fixture.downloader._assertSafeSegment(unsafeName, 'Content name')).toThrow();
    }
  });

  it('does not overwrite a target that appears during download', async () => {
    const fixture = createDownloader(squadsPath);
    fixture.downloader._downloadSquadFiles = jest.fn(async (_info, stagingPath) => {
      await fs.writeFile(
        path.join(stagingPath, 'squad.yaml'),
        'name: secure-squad\nversion: 1.0.0\n',
      );
      const targetPath = path.join(squadsPath, 'secure-squad');
      await fs.mkdir(targetPath);
      await fs.writeFile(path.join(targetPath, 'owner-note.txt'), 'created concurrently');
    });

    await expect(
      fixture.downloader.download('secure-squad', { validate: false }),
    ).rejects.toMatchObject({ code: DownloaderErrorCodes.SQUAD_EXISTS });
    expect(
      await fs.readFile(path.join(squadsPath, 'secure-squad', 'owner-note.txt'), 'utf8'),
    ).toBe('created concurrently');
  });

  it('blocks a deferred file write when the squads root is replaced by a junction', async () => {
    const fixture = createDownloader(squadsPath);
    const originalFetch = fixture.downloader._fetch;
    let releaseFile;
    let signalFileRequest;
    const fileRequested = new Promise((resolve) => {
      signalFileRequest = resolve;
    });
    fixture.downloader._fetch = jest.fn(async (url, ...args) => {
      if (url !== MANIFEST_URL) return originalFetch(url, ...args);
      signalFileRequest();
      return new Promise((resolve) => {
        releaseFile = resolve;
      });
    });

    const pendingDownload = fixture.downloader.download('secure-squad', {
      validate: false,
    });
    await fileRequested;
    const stagingName = (await fs.readdir(squadsPath)).find((name) =>
      name.startsWith('.aexos-download-'),
    );
    expect(stagingName).toBeDefined();

    const displacedRoot = path.join(workRoot, 'displaced-squads');
    const outsideRoot = path.join(workRoot, 'outside-root');
    await fs.rename(squadsPath, displacedRoot);
    await fs.mkdir(path.join(outsideRoot, stagingName), { recursive: true });
    await fs.symlink(
      outsideRoot,
      squadsPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    releaseFile(Buffer.from('name: secure-squad\nversion: 1.0.0\n'));

    await expect(pendingDownload).rejects.toMatchObject({
      code: DownloaderErrorCodes.DOWNLOAD_ERROR,
    });
    await expect(
      fs.access(path.join(outsideRoot, stagingName, 'squad.yaml')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.access(path.join(displacedRoot, stagingName, 'squad.yaml')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('restores existing content when staged promotion fails', async () => {
    const targetPath = path.join(squadsPath, 'secure-squad');
    await fs.mkdir(targetPath, { recursive: true });
    await fs.writeFile(path.join(targetPath, 'owner-note.txt'), 'original');
    await fs.writeFile(
      path.join(targetPath, 'squad.yaml'),
      'name: secure-squad\nversion: 0.9.0\n',
    );
    const fixture = createDownloader(squadsPath, { overwrite: true });
    fixture.downloader._downloadSquadFiles = jest.fn(async (_info, stagingPath) => {
      await fs.writeFile(
        path.join(stagingPath, 'squad.yaml'),
        'name: secure-squad\nversion: 1.0.0\n',
      );
    });
    const actualRename = fs.rename.bind(fs);
    let renameCount = 0;
    jest.spyOn(fs, 'rename').mockImplementation(async (...args) => {
      renameCount += 1;
      if (renameCount === 2) {
        const error = new Error('injected promotion failure');
        error.code = 'EIO';
        throw error;
      }
      return actualRename(...args);
    });

    await expect(
      fixture.downloader.download('secure-squad', { validate: false }),
    ).rejects.toThrow('injected promotion failure');
    expect(await fs.readFile(path.join(targetPath, 'owner-note.txt'), 'utf8')).toBe('original');
    expect(await fs.readFile(path.join(targetPath, 'squad.yaml'), 'utf8')).toContain('0.9.0');
  });

  it('rejects symlink targets without changing their referent', async () => {
    const referent = path.join(workRoot, 'referent');
    const targetPath = path.join(squadsPath, 'secure-squad');
    await fs.mkdir(referent, { recursive: true });
    await fs.writeFile(path.join(referent, 'owner-note.txt'), 'outside');
    await fs.mkdir(squadsPath, { recursive: true });
    await fs.symlink(referent, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
    const fixture = createDownloader(squadsPath, { overwrite: true });

    await expect(fixture.downloader.download('secure-squad')).rejects.toMatchObject({
      code: DownloaderErrorCodes.DOWNLOAD_ERROR,
    });
    expect(await fs.readFile(path.join(referent, 'owner-note.txt'), 'utf8')).toBe('outside');
  });

  it('drops API authorization on an explicitly allowed cross-origin redirect', async () => {
    const downloader = new SquadDownloader({
      contentApiBase: 'https://api.fixture.test/contents',
      contentDownloadOrigins: ['https://files.fixture.test'],
      githubToken: 'secret-token',
    });
    const seenHeaders = [];
    https.get.mockImplementation((url, options, callback) => {
      seenHeaders.push({ url, headers: options.headers });
      const response = {
        statusCode: url.startsWith('https://api.fixture.test') ? 302 : 200,
        headers: url.startsWith('https://api.fixture.test')
          ? { location: 'https://files.fixture.test/body' }
          : {},
        resume: jest.fn(),
        on(event, handler) {
          if (event === 'data' && this.statusCode === 200) handler(Buffer.from('ok'));
          if (event === 'end' && this.statusCode === 200) handler();
          return this;
        },
      };
      callback(response);
      return { on: jest.fn().mockReturnThis() };
    });

    await expect(
      downloader._fetch(
        'https://api.fixture.test/contents/item',
        true,
        0,
        ['https://api.fixture.test', 'https://files.fixture.test'],
      ),
    ).resolves.toEqual(Buffer.from('ok'));
    expect(seenHeaders[0].headers.Authorization).toBe('token secret-token');
    expect(seenHeaders[1].headers.Authorization).toBeUndefined();
  });

  it.each([undefined, 'not-a-date', '999999999999999999999999', '1e309'])('handles invalid rate-limit reset %s without an uncaught callback error', async reset => {
    const downloader = new SquadDownloader();
    https.get.mockImplementation((_url, _options, callback) => {
      queueMicrotask(() => callback({
        statusCode: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset },
        resume: jest.fn(),
      }));
      return { on: jest.fn().mockReturnThis() };
    });
    await expect(downloader._fetch('https://api.github.com/limited', true))
      .rejects.toMatchObject({ code: DownloaderErrorCodes.RATE_LIMIT });
  });

  it('rejects credentialed URLs and bounds redirects', async () => {
    const downloader = new SquadDownloader();
    await expect(
      downloader._fetch('https://user:password@example.test/file'),
    ).rejects.toMatchObject({ code: DownloaderErrorCodes.NETWORK_ERROR });

    https.get.mockImplementation((_url, _options, callback) => {
      callback({
        statusCode: 302,
        headers: { location: '/again' },
        resume: jest.fn(),
        on: jest.fn(),
      });
      return { on: jest.fn().mockReturnThis() };
    });
    await expect(
      downloader._fetch('https://example.test/start', false, 0, ['https://example.test']),
    ).rejects.toThrow('Too many redirects');
    expect(https.get).toHaveBeenCalledTimes(6);
  });
});
