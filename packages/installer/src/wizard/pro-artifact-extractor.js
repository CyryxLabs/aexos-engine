'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const tar = require('tar');
const semver = require('semver');

const MAX_COMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
const MAX_CONTENT_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_ENTRIES = 10000;
// eslint-disable-next-line no-control-regex -- Archive paths must not contain control bytes.
const UNSAFE_PATH = /[\\\x00-\x1f\x7f:<>"|?*]/;

function validateArchivePath(name, directory, payloadRoot = true) {
  if (typeof name !== 'string' || name.length > 1024 || UNSAFE_PATH.test(name)) {
    throw new Error('Pro archive contains an unsafe path');
  }
  const parts = (directory ? name.replace(/\/$/, '') : name).split('/');
  if ((payloadRoot && parts[0] !== 'package') || parts.some((part) => !part || part === '.' || part === '..' ||
    /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('Pro archive must contain safe paths under package/');
  }
  return parts;
}

function validatePhysicalHeaders(buffer) {
  let offset = 0;
  let count = 0;
  while (offset + 512 <= buffer.length) {
    const block = buffer.subarray(offset, offset + 512);
    if (block.every((byte) => byte === 0)) {
      if (offset + 1024 > buffer.length || buffer.subarray(offset).some((byte) => byte !== 0)) {
        throw new Error('Pro archive has invalid termination or hidden trailing data');
      }
      return;
    }
    // Read physical headers before PAX can replace names on tar read entries.
    // The maintained tar library remains the header decoder and extractor.
    const header = new tar.Header(buffer, offset);
    if (!header.cksumValid || !Number.isSafeInteger(header.size) || header.size < 0 || header.size > MAX_FILE_BYTES) {
      throw new Error('Pro archive has an invalid physical header or exceeds entry limits');
    }
    const metadata = header.type === 'ExtendedHeader';
    const directory = header.type === 'Directory';
    if (!metadata && !directory && header.type !== 'File' && header.type !== 'OldFile') {
      throw new Error('Pro archive contains a link or unsupported physical entry type');
    }
    validateArchivePath(header.path, directory, !metadata);
    if ((directory && header.size !== 0) ||
      ((metadata || header.path === 'package/package.json') && header.size > MAX_METADATA_BYTES) ||
      ++count > MAX_ENTRIES * 2) {
      throw new Error('Pro archive exceeds physical entry limits');
    }
    const dataEnd = offset + 512 + header.size;
    const next = offset + 512 + Math.ceil(header.size / 512) * 512;
    if (next > buffer.length || buffer.subarray(dataEnd, next).some((byte) => byte !== 0)) {
      throw new Error('Pro archive has truncated entries or invalid padding');
    }
    offset = next;
  }
  throw new Error('Pro archive is missing its end marker');
}

function inspectArchive(buffer, expectedVersion) {
  const entries = new Map();
  const parentPaths = new Set();
  const metadata = [];
  let contentBytes = 0;
  let count = 0;
  const parser = tar.t({
    sync: true,
    strict: true,
    onReadEntry(entry) {
      const name = entry.path;
      const directory = entry.type === 'Directory';
      if (!directory && entry.type !== 'File' && entry.type !== 'OldFile') {
        throw new Error('Pro archive contains a link or unsupported entry type');
      }
      const parts = validateArchivePath(name, directory);
      const key = parts.join('/').normalize('NFC').toLowerCase();
      if (entries.has(key) || (!directory && parentPaths.has(key))) {
        throw new Error('Pro archive contains duplicate or conflicting paths');
      }
      for (let index = 1; index < parts.length; index++) {
        const parent = parts.slice(0, index).join('/').normalize('NFC').toLowerCase();
        if (entries.get(parent) === 'file') throw new Error('Pro archive contains conflicting path types');
        parentPaths.add(parent);
      }
      entries.set(key, directory ? 'directory' : 'file');
      count++;
      if (count > MAX_ENTRIES || !Number.isSafeInteger(entry.size) || entry.size < 0 ||
        entry.size > MAX_FILE_BYTES || (directory && entry.size !== 0)) {
        throw new Error('Pro archive exceeds entry limits');
      }
      contentBytes += entry.size;
      if (contentBytes > MAX_CONTENT_BYTES) throw new Error('Pro archive exceeds expanded content limit');
      if (name === 'package/package.json' && !directory) {
        if (entry.size > MAX_METADATA_BYTES) throw new Error('Pro package metadata exceeds size limit');
        entry.on('data', (chunk) => metadata.push(chunk));
      }
    },
  });
  parser.on('ignoredEntry', () => { throw new Error('Pro archive contains an unsupported entry'); });
  parser.end(buffer);
  let pkg;
  try {
    pkg = JSON.parse(Buffer.concat(metadata).toString('utf8'));
  } catch {
    throw new Error('Pro archive must contain valid package/package.json');
  }
  if (pkg?.name !== '@aexos/pro' || typeof pkg.version !== 'string' || !semver.valid(pkg.version) ||
    (expectedVersion && pkg.version !== expectedVersion)) {
    throw new Error('Pro archive package identity/version does not match the requested artifact');
  }
}

async function extractProArtifactToTemp(artifactPath, tempRoot, expectedVersion) {
  let ownedRoot;
  try {
    if ((await fs.stat(artifactPath)).size > MAX_COMPRESSED_BYTES) throw new Error('Pro archive compressed size exceeds limit');
    const compressed = await fs.readFile(artifactPath);
    if (compressed.length > MAX_COMPRESSED_BYTES || compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
      throw new Error('Pro artifact must be a bounded gzip archive');
    }
    // Both passes consume the same bounded bytes, so no archive re-read can
    // substitute content after preflight. This is deliberately memory-bounded,
    // synchronous decompression/parsing rather than a streaming claim.
    const expanded = gunzipSync(compressed, { maxOutputLength: MAX_EXPANDED_BYTES });
    if (expanded.length < 1024 || expanded.length % 512 !== 0 ||
      expanded.subarray(-1024).some((value) => value !== 0)) {
      throw new Error('Pro archive is truncated or missing its end marker');
    }
    validatePhysicalHeaders(expanded);
    inspectArchive(expanded, expectedVersion);
    ownedRoot = await fs.mkdtemp(path.join(tempRoot, 'package-root-'));
    await fs.chmod(ownedRoot, 0o700);
    const sourceDir = path.join(ownedRoot, 'node_modules', '@aexos', 'pro');
    await fs.mkdir(sourceDir, { recursive: true });
    tar.x({ cwd: sourceDir, strip: 1, sync: true, strict: true, preserveOwner: false, chmod: false, noMtime: true }).end(expanded);
    return sourceDir;
  } catch (error) {
    if (ownedRoot) await fs.rm(ownedRoot, { recursive: true, force: true });
    throw new Error(`Failed to extract Pro artifact package: ${error.message}`);
  }
}

module.exports = { extractProArtifactToTemp };
