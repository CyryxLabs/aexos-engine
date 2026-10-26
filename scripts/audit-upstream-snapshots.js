#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const normalize = (value) => value.replace(/aiox|aios|cyryx/gi, 'aexos').replace(/\r\n/g, '\n');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function category(file) {
  if (/(^|\/)LICENSE/i.test(file)) return 'license';
  if (/\.(png|jpg|jpeg|gif|webp|ico|pdf|woff2?|mp4|tgz)$/i.test(file)) return 'asset';
  if (/(^|\/)(legacy|test-results|outputs|audits)\//.test(file)) return 'historical-or-generated';
  if (/(^|\/)(tests?|e2e|__tests__)\//.test(file)) return 'test';
  if (/(^|\/)tasks\//.test(file)) return 'task';
  if (/(^|\/)workflows\//.test(file)) return 'workflow';
  if (/(^|\/)agents\//.test(file)) return 'agent';
  if (/(^|\/)(checklists|templates|data)\//.test(file)) return 'method-support';
  if (/^\.(claude|codex|gemini|grok|cursor|kimi|antigravity)\//.test(file)) return 'host-projection';
  if (/\.(js|cjs|mjs|ts|tsx|py|sh)$/.test(file)) return 'implementation';
  return 'documentation-or-configuration';
}

function inspectSnapshot(sourceRoot, projectRoot) {
  const git = (args) => execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const entries = git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean);
  const files = entries.map((entry) => {
    const [, mode, blob, file] = entry.match(/^(\d+) ([a-f0-9]+) \d+\t([\s\S]+)$/);
    const localPath = normalize(file);
    const local = path.resolve(projectRoot, localPath);
    const base = { path: file, mode, blob, category: category(file), candidatePath: localPath };
    if (mode === '160000') return { ...base, comparison: 'submodule-not-inspected' };
    if (mode === '120000') return { ...base, comparison: 'source-symlink-not-followed' };
    const source = fs.readFileSync(path.join(sourceRoot, file));
    if (!fs.existsSync(local) || !fs.lstatSync(local).isFile()) {
      return { ...base, bytes: source.length, sha256: hash(source), comparison: 'no-path-equivalent' };
    }
    const current = fs.readFileSync(local);
    const comparison = source.equals(current) ? 'byte-identical'
      : !source.includes(0) && !current.includes(0)
        && normalize(source.toString('utf8')) === normalize(current.toString('utf8'))
        ? 'normalized-identical' : 'different-review-required';
    return { ...base, bytes: source.length, sha256: hash(source), localSha256: hash(current), comparison };
  });
  const counts = {};
  for (const file of files) counts[file.comparison] = (counts[file.comparison] || 0) + 1;
  return {
    source: git(['remote', 'get-url', 'origin']).trim(),
    commit: git(['rev-parse', 'HEAD']).trim(),
    rootLicenseFiles: files.filter((file) => /^LICENSE[^/]*$/i.test(file.path)).map((file) => file.path),
    counts, trackedPaths: files.length, files,
  };
}

function main(argv = process.argv.slice(2)) {
  const value = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  const sourceRoot = value('source-root');
  if (!sourceRoot) throw new Error('Provide --source-root=<directory containing the four snapshots>.');
  const projectRoot = path.resolve(value('project-root', process.cwd()));
  const snapshots = ['aiox-core', 'aiox-squads', 'aiox-dashboard', 'aiox-research']
    .map((repo) => inspectSnapshot(path.resolve(sourceRoot, repo), projectRoot));
  const report = {
    schemaVersion: 1,
    method: 'Tracked-path inventory and byte/brand-normalized comparison, not semantic or runtime certification.',
    normalization: 'Case-insensitive aiox/aios/cyryx to aexos and CRLF to LF. Comparison only; never rewrites sources.',
    projectCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim(),
    snapshots,
  };
  const output = value('output');
  if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(snapshots.map(({ source, commit, counts, trackedPaths, rootLicenseFiles }) => ({
    source, commit, counts, trackedPaths, rootLicenseFiles,
  })), null, 2));
  return report;
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`Upstream snapshot audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { normalize, category, inspectSnapshot, main };
