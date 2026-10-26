'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANIFEST = '.aexos-managed.json';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const pathKey = (value) => process.platform === 'win32' ? value.toLowerCase() : value;

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':')) throw new Error('Invalid managed path');
  if (relative.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Managed path escapes canonical Grok layout');
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (!target.startsWith(base + path.sep)) throw new Error('Managed path escapes Grok root');
  let cursor = target;
  while (true) {
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Linked Grok paths are unsupported');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return target;
}

function markers(relative) {
  return relative.endsWith('.toml')
    ? ['# AEXOS MANAGED START', '# AEXOS MANAGED END']
    : ['<!-- AEXOS MANAGED START -->', '<!-- AEXOS MANAGED END -->'];
}

function splitManaged(content, relative) {
  const [start, end] = markers(relative);
  const first = content.indexOf(start);
  const last = content.indexOf(end);
  if (first < 0 && last < 0) return null;
  if (first < 0 || last < first || content.indexOf(start, first + 1) >= 0 || content.indexOf(end, last + 1) >= 0) throw new Error(`Malformed managed section: ${relative}`);
  return { before: content.slice(0, first), managed: content.slice(first + start.length, last).trim(), after: content.slice(last + end.length) };
}

function managedContent(content, entry) {
  return entry.mode === 'section' ? (splitManaged(content, entry.path)?.managed ?? content.trim()) : content;
}

function withoutLegacyConfigSection(content) {
  const start = '# AEXOS-MANAGED-START: harness';
  const end = '# AEXOS-MANAGED-END: harness';
  const first = content.indexOf(start);
  const last = content.indexOf(end);
  if (first < 0 && last < 0) return content;
  if (first < 0 || last < first || content.indexOf(start, first + 1) >= 0 ||
      content.indexOf(end, last + 1) >= 0) {
    throw new Error('Malformed legacy managed section: config.toml');
  }
  return content.slice(0, first) + content.slice(last + end.length);
}

function readManifest(root) {
  const file = safePath(root, MANIFEST);
  if (!fs.existsSync(file)) return null;
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).nlink > 1) throw new Error('Grok manifest must be an independent regular file');
  if (fs.statSync(file).size > 2 * 1024 * 1024) throw new Error('Grok manifest exceeds size limit');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.schemaVersion !== 1 || !Array.isArray(value.files) || value.files.length > 5000) throw new Error('Invalid Grok managed manifest');
  const seen = new Set();
  for (const entry of value.files) {
    safePath(root, entry.path);
    const key = process.platform === 'win32' ? entry.path.toLowerCase() : entry.path;
    if (key === MANIFEST || seen.has(key) || !['file', 'section'].includes(entry.mode) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid Grok ownership evidence');
    seen.add(key);
  }
  return value;
}

function applyProjection(root, artifacts, options = {}) {
  const previous = readManifest(root);
  const prior = new Map((previous?.files || []).map((entry) => [pathKey(entry.path), entry]));
  const planned = [];
  const preserved = [];
  const files = [];
  const seen = new Set();
  for (const artifact of artifacts) {
    const key = process.platform === 'win32' ? artifact.path.toLowerCase() : artifact.path;
    if (key === MANIFEST || seen.has(key)) throw new Error('Duplicate or reserved Grok artifact');
    seen.add(key);
    const target = safePath(root, artifact.path);
    const mode = artifact.path.startsWith('rules/') || artifact.path === 'config.toml' ? 'section' : 'file';
    const expected = mode === 'section' ? artifact.content.trim() : artifact.content;
    const entry = { path: artifact.path, mode, sha256: hash(expected) };
    const old = prior.get(pathKey(entry.path));
    const exists = fs.existsSync(target);
    if (exists && (!fs.lstatSync(target).isFile() || fs.lstatSync(target).nlink > 1)) throw new Error(`Grok target is not an independent regular file: ${entry.path}`);
    const current = exists ? fs.readFileSync(target, 'utf8') : '';
    let content = artifact.content;
    if (mode === 'section') {
      const section = splitManaged(current, entry.path);
      if (section && hash(section.managed) !== old?.sha256 && section.managed !== expected) throw new Error(`Modified managed Grok rules: ${entry.path}`);
      const [start, end] = markers(entry.path);
      const unmanaged = !section && entry.path === 'config.toml'
        ? withoutLegacyConfigSection(current) : current;
      const before = section?.before ?? (unmanaged.trim() === expected ? '' : unmanaged + (unmanaged ? '\n' : ''));
      content = `${before}${start}\n${expected}\n${end}${section?.after ?? '\n'}`;
    } else if (exists && current !== expected && (!old || hash(current) !== old.sha256)) {
      throw new Error(`User-owned or modified Grok file preserved: ${entry.path}`);
    }
    files.push(entry);
    const stat = exists ? fs.lstatSync(target) : null;
    planned.push({ target, path: entry.path, content, original: exists ? hash(current) : null,
      identity: stat ? `${stat.dev}:${stat.ino}` : null });
  }
  const wanted = new Set(files.map((entry) => pathKey(entry.path)));
  const removals = [];
  for (const entry of prior.values()) {
    if (wanted.has(pathKey(entry.path))) continue;
    const target = safePath(root, entry.path);
    if (!fs.existsSync(target)) continue;
    if (entry.mode !== 'file' || !fs.lstatSync(target).isFile() || hash(fs.readFileSync(target)) !== entry.sha256) {
      preserved.push(entry.path);
      continue;
    }
    removals.push({ target, hash: entry.sha256, path: entry.path });
  }
  if (!options.dryRun) {
    for (const item of planned) {
      safePath(root, item.path);
      fs.mkdirSync(path.dirname(item.target), { recursive: true });
      safePath(root, item.path);
      const exists = fs.existsSync(item.target);
      const stat = exists ? fs.lstatSync(item.target) : null;
      if ((stat && (!stat.isFile() || stat.nlink > 1)) ||
          (stat ? `${stat.dev}:${stat.ino}` : null) !== item.identity ||
          (exists ? hash(fs.readFileSync(item.target)) : null) !== item.original) {
        throw new Error(`Grok file changed during generation; preserved: ${item.path}`);
      }
      if (!fs.existsSync(item.target) || fs.readFileSync(item.target, 'utf8') !== item.content) fs.writeFileSync(item.target, item.content, 'utf8');
    }
    for (const item of removals) {
      safePath(root, item.path);
      if (hash(fs.readFileSync(item.target)) !== item.hash) throw new Error('Grok stale file changed during cleanup');
      fs.unlinkSync(item.target);
    }
    const manifest = safePath(root, MANIFEST);
    readManifest(root);
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, files: files.sort((a, b) => a.path.localeCompare(b.path)) }, null, 2) + '\n');
  }
  return { written: planned.map((item) => item.target), removed: removals.map((item) => item.path), preserved, manifest: path.join(root, MANIFEST) };
}

module.exports = { MANIFEST, hash, safePath, readManifest, managedContent, applyProjection };
