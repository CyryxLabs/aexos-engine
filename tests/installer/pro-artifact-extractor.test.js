'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const tar = require('tar');
const proSetup = require(path.resolve(__dirname, '..', '..', 'packages/installer/src/wizard/pro-setup'));
const { signDescriptor, createTrustStore } = require(path.resolve(__dirname, '..', 'helpers/paid-squad-artifact-fixture'));

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-archive & literal-')); });
afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

function archive(entries) {
  const buffers = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content || '');
    const header = new tar.Header({ path: entry.path, type: entry.type || 'File', size: entry.size ?? content.length, mode: 0o644, linkpath: entry.linkpath || '' });
    const buffer = Buffer.alloc(512);
    header.encode(buffer);
    buffers.push(buffer, content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...buffers, Buffer.alloc(1024)]));
}
function metadata(version = '0.4.2') {
  return { path: 'package/package.json', content: JSON.stringify({ name: '@aexos/pro', version, private: true, aexosPro: { scaffold: true, implemented: false } }) };
}
function paxMetadata(rawPath) {
  const content = Buffer.from(metadata().content);
  const header = Buffer.alloc(512);
  new tar.Header({ path: rawPath, type: 'File', size: content.length, mode: 0o644 }).encode(header);
  return zlib.gzipSync(Buffer.concat([
    new tar.Pax({ path: 'package/package.json' }).encode(), header, content,
    Buffer.alloc((512 - content.length % 512) % 512), Buffer.alloc(1024),
  ]));
}
async function extract(payload, expectedVersion) {
  const artifact = path.join(root, 'artifact & [literal].tgz');
  fs.writeFileSync(artifact, payload);
  return proSetup._testing.extractProArtifactToTemp(artifact, root, expectedVersion);
}

describe('ACL.13 confined in-process TGZ extraction', () => {
  test('extracts static bytes with Unicode names without lifecycle/network or changing user sentinels', async () => {
    const sentinel = path.join(root, 'package-root', 'user.txt');
    fs.mkdirSync(path.dirname(sentinel));
    fs.writeFileSync(sentinel, 'preserve');
    const source = await extract(archive([metadata(), { path: 'package/squads/café.md', content: 'Content\n' }]), '0.4.2');
    expect(source).toContain(path.join('node_modules', '@aexos', 'pro'));
    expect(fs.readFileSync(path.join(source, 'squads', 'café.md'), 'utf8')).toBe('Content\n');
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('preserve');
    expect(JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).aexosPro.scaffold).toBe(true);
  });

  test.each(['/absolute', '../escape', 'package/../escape', 'C:/escape', '\\\\host\\share', 'package/a\\b', 'wrong/file', 'package/NUL.txt', 'package/a:stream', 'package/trailing.', 'package/a//b'])('rejects unsafe path %s', async (name) => {
    await expect(extract(archive([metadata(), { path: name, content: 'bad' }]))).rejects.toThrow();
    expect(fs.readdirSync(root).filter((file) => file.startsWith('package-root-'))).toEqual([]);
  });

  test.each(['SymbolicLink', 'Link', 'FIFO', 'CharacterDevice', 'BlockDevice'])('rejects %s entries', async (type) => {
    await expect(extract(archive([metadata(), { path: 'package/escape', type, linkpath: '../outside' }]))).rejects.toThrow();
  });

  test.each([
    [{ path: 'package/A.md' }, { path: 'package/a.md' }],
    [{ path: 'package/a' }, { path: 'package/a/b' }],
    [{ path: 'package/a/b' }, { path: 'package/a' }],
    [{ path: 'package/café' }, { path: 'package/cafe\u0301' }],
  ])('rejects duplicate/colliding effective paths %#', async (first, second) => {
    await expect(extract(archive([metadata(), first, second]))).rejects.toThrow(/duplicate|conflicting/);
  });

  test('rejects effective traversal encoded in PAX metadata', async () => {
    const value = 'path=package/../outside\n';
    let length = value.length + 2;
    while (`${length} ${value}`.length !== length) length = `${length} ${value}`.length;
    await expect(extract(archive([metadata(), { path: 'PaxHeader', type: 'ExtendedHeader', content: `${length} ${value}` }, { path: 'package/safe', content: 'bad' }]))).rejects.toThrow();
  });

  test.each(['../outside.json', '/outside.json', 'package/../outside.json', 'C:/outside.json', 'package/NUL.txt'])(
    'rejects unsafe raw path hidden by safe PAX metadata: %s', async (rawPath) => {
      const sentinel = path.join(root, 'outside.json');
      fs.writeFileSync(sentinel, 'preserved');
      await expect(extract(paxMetadata(rawPath), '0.4.2')).rejects.toThrow(/safe paths|unsafe path/);
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('preserved');
      expect(fs.readdirSync(root).filter((file) => file.startsWith('package-root-'))).toEqual([]);
    },
  );

  test('accepts safe physical and effective PAX names', async () => {
    const source = await extract(paxMetadata('package/metadata.json'), '0.4.2');
    expect(JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).version).toBe('0.4.2');
    expect(fs.existsSync(path.join(source, 'metadata.json'))).toBe(false);
  });

  test('rejects hidden trailing data and nonzero file padding', async () => {
    const valid = zlib.gunzipSync(archive([metadata()]));
    await expect(extract(zlib.gzipSync(Buffer.concat([valid, Buffer.alloc(512, 65), Buffer.alloc(1024)]))))
      .rejects.toThrow(/hidden trailing data/);
    const padded = Buffer.from(valid);
    padded[512 + Buffer.byteLength(metadata().content)] = 65;
    await expect(extract(zlib.gzipSync(padded))).rejects.toThrow(/invalid padding/);
  });

  test('rejects truncated/malformed gzip and tar data', async () => {
    const valid = archive([metadata()]);
    await expect(extract(valid.subarray(0, valid.length - 8))).rejects.toThrow();
    await expect(extract(zlib.gzipSync(Buffer.alloc(512)))).rejects.toThrow(/truncated/);
    await expect(extract(Buffer.from('not a gzip'))).rejects.toThrow();
  });

  test('bounds declared file size, metadata size, entry count and decompressed bytes', async () => {
    await expect(extract(archive([metadata(), { path: 'package/huge', size: 33 * 1024 * 1024 }]))).rejects.toThrow(/limit/);
    await expect(extract(archive([{ path: 'package/package.json', size: 65537 }]))).rejects.toThrow(/limit/);
    await expect(extract(archive([metadata(), ...Array.from({ length: 10000 }, (_, i) => ({ path: `package/file-${i}` }))]))).rejects.toThrow(/limit/);
    await expect(extract(zlib.gzipSync(Buffer.alloc(128 * 1024 * 1024 + 1)))).rejects.toThrow();
  }, 15000);

  test('requires package identity and exact requested signed version', async () => {
    await expect(extract(archive([{ path: 'package/package.json', content: '{}' }]))).rejects.toThrow(/identity/);
    await expect(extract(archive([metadata('0.4.1')]), '0.4.2')).rejects.toThrow(/version/);
    await expect(extract(archive([{ path: 'package/README.md' }]))).rejects.toThrow(/package.json/);
  });

  test('rejects a validly signed malicious archive before invoking target npm installation', async () => {
    const payload = archive([metadata(), { path: 'package/../../outside', content: 'bad' }]);
    jest.spyOn(proSetup._testing.InlineLicenseClient.prototype, 'getProArtifactUrl').mockResolvedValue(signDescriptor({
      payload, package: '@aexos/pro', squadId: 'pro-library', version: '0.4.2', machineId: 'a'.repeat(64), now: new Date(),
    }));
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) });
    const original = proSetup._testing.installProArtifactIntoTarget;
    const installer = jest.fn();
    proSetup._testing.installProArtifactIntoTarget = installer;
    try {
      const result = await proSetup._testing.acquireProArtifactSourceDir(root, { accessToken: 'fixture-access-token', machineId: 'a'.repeat(64) }, { artifactTrustStore: createTrustStore(), proArtifactVersion: '0.4.2' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/archive/);
      expect(installer).not.toHaveBeenCalled();
    } finally { proSetup._testing.installProArtifactIntoTarget = original; }
  });
});
