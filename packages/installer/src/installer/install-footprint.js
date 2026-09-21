/** Project-local install ownership and safe uninstall helpers. */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getCyryxCorePackageRoot, requireCyryxCoreModule } = require('../utils/package-paths');

const PACKAGE_ROOT = getCyryxCorePackageRoot();
const { atomicWriteSync } = requireCyryxCoreModule(
  '.aexos-core', 'core', 'synapse', 'utils', 'atomic-write',
);
const GROK_GENERATOR = 'aexos-grok-skills-sync';
const GROK_MANIFEST = 'aexos-managed.json';
const CLAUDE_TEMPLATE_FILES = Object.freeze([
  'agent-template.yaml', 'architecture-tmpl.yaml', 'brainstorming-output-tmpl.yaml',
  'brownfield-architecture-tmpl.yaml', 'brownfield-prd-tmpl.yaml',
  'competitor-analysis-tmpl.yaml', 'database-schema-request-full.md',
  'database-schema-request-lite.md', 'front-end-architecture-tmpl.yaml',
  'front-end-spec-tmpl.yaml', 'fullstack-architecture-tmpl.yaml',
  'market-research-tmpl.yaml', 'prd-tmpl.yaml', 'project-brief-tmpl.yaml',
  'qa-gate-tmpl.yaml', 'story-tmpl.yaml', 'task-template.md', 'workflow-template.yaml',
]);

const AEXOS_FOOTPRINT = [
  { path: '.grok', label: 'Grok managed projection', strategy: 'grok-manifest' },
  {
    path: '.claude/templates', label: 'Claude managed templates', strategy: 'package-files',
    packagePath: '.claude/templates', files: CLAUDE_TEMPLATE_FILES,
  },
  { path: '.aexos-core', label: 'Framework core' },
  { path: 'squads', label: 'Squad definitions' },
  { path: '.aexos', label: 'Project data and settings' },
  { path: '.claude/commands/AEXOS', label: 'Claude Code commands', strategy: 'claude-commands' },
  { path: '.claude/skills/AEXOS', label: 'Claude Code skills' },
  { path: '.gemini/rules/AEXOS', label: 'Gemini rules' },
  { path: '.kimi/skills', label: 'Kimi skills' },
  { path: '.antigravity', label: 'Antigravity rules' },
];

const LEGACY_FOOTPRINT = [
  { path: '.aiox-core', label: 'AIOX framework core', brand: 'AIOX' },
  { path: '.claude/commands/AIOX', label: 'AIOX Claude commands', brand: 'AIOX' },
  { path: '.claude/skills/AIOX', label: 'AIOX Claude skills', brand: 'AIOX' },
  { path: '.gemini/rules/AIOX', label: 'AIOX Gemini rules', brand: 'AIOX' },
  { path: '.cyryx-core', label: 'CYRYX framework core', brand: 'CYRYX' },
  { path: '.claude/commands/CYRYX', label: 'CYRYX Claude commands', brand: 'CYRYX' },
  { path: '.claude/skills/CYRYX', label: 'CYRYX Claude skills', brand: 'CYRYX' },
  { path: '.gemini/rules/CYRYX', label: 'CYRYX Gemini rules', brand: 'CYRYX' },
];
const LEGACY_SKILL_PREFIXES = [
  { dir: '.codex/skills', prefixes: ['aiox-', 'cyryx-'], label: 'Codex skills' },
  { dir: '.grok/skills', prefixes: ['aiox-', 'cyryx-'], label: 'Grok skills' },
  { dir: '.claude/skills', prefixes: ['aiox-', 'cyryx-'], label: 'Claude skills' },
];

function pathExistsWithoutFollowingLinks(target) {
  try { fs.lstatSync(target); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
function exists(root, rel) { return pathExistsWithoutFollowingLinks(path.join(root, rel)); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function captureSafeRoot(projectRoot) {
  const root = path.resolve(projectRoot);
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Project root must be a real directory');
  return { root, real: fs.realpathSync.native(root) };
}
function assertSafePath(rootState, target) {
  const resolved = path.resolve(target);
  if (resolved === rootState.root || !isInside(rootState.root, resolved)) throw new Error(`Path escapes project root: ${target}`);
  const rootStat = fs.lstatSync(rootState.root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
      || fs.realpathSync.native(rootState.root) !== rootState.real) {
    throw new Error('Project root identity changed during uninstall');
  }
  let cursor = rootState.root;
  for (const part of path.relative(rootState.root, resolved).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (!pathExistsWithoutFollowingLinks(cursor)) throw new Error(`Managed path disappeared: ${path.relative(rootState.root, cursor)}`);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`Refusing linked managed path: ${path.relative(rootState.root, cursor)}`);
  }
  if (!isInside(rootState.real, fs.realpathSync.native(resolved))) throw new Error(`Managed path resolves outside project: ${target}`);
  return resolved;
}
function pruneEmptyParents(rootState, start, stop) {
  let cursor = path.resolve(start);
  const boundary = path.resolve(stop);
  while (cursor !== boundary && isInside(boundary, cursor) && fs.existsSync(cursor)) {
    assertSafePath(rootState, cursor);
    if (fs.readdirSync(cursor).length) break;
    fs.rmdirSync(cursor);
    cursor = path.dirname(cursor);
  }
}
function getManagedRuleSections(content) {
  const sections = new Map();
  const pattern = /<!-- AEXOS-MANAGED-START:\s*([a-z0-9-]+)\s*-->[\s\S]*?<!-- AEXOS-MANAGED-END:\s*\1\s*-->/gi;
  for (const match of String(content || '').matchAll(pattern)) sections.set(match[1], match[0]);
  return sections;
}
function serializeManagedRuleSections(content) {
  return [...getManagedRuleSections(content).entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, block]) => `${name}\0${block}`).join('\0');
}
function serializeManagedConfig(content) {
  const text = String(content || '');
  const starts = [...text.matchAll(/^# AEXOS-MANAGED-START: harness\r?$/gm)];
  const ends = [...text.matchAll(/^# AEXOS-MANAGED-END: harness\r?$/gm)];
  if (!starts.length && !ends.length) return '';
  if (starts.length !== 1 || ends.length !== 1 || ends[0].index < starts[0].index) throw new Error('Malformed managed harness section in Grok config.toml');
  return text.slice(starts[0].index, ends[0].index + ends[0][0].length);
}
function readManifest(manifestPath) {
  const stat = fs.lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Grok ownership manifest is not a regular file');
  const value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (value?.schemaVersion !== 1 || value?.generatedBy !== GROK_GENERATOR || !Array.isArray(value.files)) throw new Error('Grok ownership manifest has an unsupported schema');
  return value;
}
function stripManaged(content, mode) {
  if (mode === 'managed-sections') {
    let result = content;
    for (const block of getManagedRuleSections(content).values()) result = result.replace(block, '');
    return result;
  }
  if (mode === 'managed-config') return content.replace(serializeManagedConfig(content), '');
  throw new Error(`Unsupported managed mode: ${mode}`);
}
function removeGrok(rootState, item, options, result) {
  const grokRoot = path.join(rootState.root, item.path);
  assertSafePath(rootState, grokRoot);
  const manifestPath = path.join(grokRoot, GROK_MANIFEST);
  if (!fs.existsSync(manifestPath)) throw new Error('Grok ownership manifest is missing; preserving .grok');
  assertSafePath(rootState, manifestPath);
  const manifest = readManifest(manifestPath);
  const retained = [];
  for (const entry of manifest.files) {
    const relative = typeof entry?.path === 'string' ? entry.path.replace(/\//g, path.sep) : '';
    const target = path.resolve(grokRoot, relative);
    try {
      if (!relative || target === grokRoot || !isInside(grokRoot, target)
          || !['full', 'managed-sections', 'managed-config'].includes(entry.mode)
          || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) throw new Error('Invalid managed manifest entry');
      if (!pathExistsWithoutFollowingLinks(target)) continue;
      assertSafePath(rootState, target);
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Managed target is not a regular file');
      const bytes = fs.readFileSync(target);
      const owned = entry.mode === 'full' ? bytes : entry.mode === 'managed-sections'
        ? serializeManagedRuleSections(bytes.toString('utf8')) : serializeManagedConfig(bytes.toString('utf8'));
      if (sha256(owned) !== entry.sha256) {
        retained.push(entry); result.preserved.push(`${item.path}/${entry.path}`); continue;
      }
      if (!options.dryRun) {
        if (entry.mode === 'full') fs.unlinkSync(target);
        else {
          const remainder = stripManaged(bytes.toString('utf8'), entry.mode);
          if (remainder.trim()) atomicWriteSync(target, remainder, 'utf8'); else fs.unlinkSync(target);
        }
        pruneEmptyParents(rootState, path.dirname(target), grokRoot);
      }
      result.removed.push(`${item.path}/${entry.path}`);
    } catch (error) {
      retained.push(entry);
      result.failed.push({ path: `${item.path}/${entry?.path || '<invalid>'}`, message: error.message });
    }
  }
  if (!options.dryRun) {
    assertSafePath(rootState, manifestPath);
    if (retained.length) atomicWriteSync(manifestPath, `${JSON.stringify({ ...manifest, files: retained }, null, 2)}\n`, 'utf8');
    else { fs.unlinkSync(manifestPath); pruneEmptyParents(rootState, grokRoot, rootState.root); }
  }
  if (!retained.length) result.removed.push(item.path);
}
function removePackageFiles(rootState, item, options, result) {
  const targetRoot = path.join(rootState.root, item.path);
  assertSafePath(rootState, targetRoot);
  const sourceRoot = path.join(PACKAGE_ROOT, item.packagePath);
  for (const relative of item.files) {
    const target = path.join(targetRoot, relative);
    if (!pathExistsWithoutFollowingLinks(target)) continue;
    try {
      assertSafePath(rootState, target);
      const source = path.join(sourceRoot, relative);
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Managed target is not a regular file');
      if (!fs.existsSync(source) || !fs.lstatSync(source).isFile()) throw new Error(`Packaged ownership source is missing: ${relative}`);
      if (sha256(fs.readFileSync(target)) !== sha256(fs.readFileSync(source))) {
        result.preserved.push(`${item.path}/${relative}`); continue;
      }
      if (!options.dryRun) fs.unlinkSync(target);
      result.removed.push(`${item.path}/${relative}`);
    } catch (error) { result.failed.push({ path: `${item.path}/${relative}`, message: error.message }); }
  }
  if (!options.dryRun && fs.existsSync(targetRoot)) pruneEmptyParents(rootState, targetRoot, rootState.root);
}

function walkFiles(root, relative = '') {
  const files = [];
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...walkFiles(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function claudeCommandOwnershipMap() {
  const sourceRoot = path.join(PACKAGE_ROOT, '.claude', 'commands', 'AEXOS');
  const helpers = new Set([
    'scripts/agent-config-loader.js', 'scripts/generate-greeting.js',
    'scripts/greeting-builder.js', 'scripts/session-context-loader.js',
  ]);
  const mappings = walkFiles(sourceRoot)
    .filter((relative) => {
      const portable = relative.split(path.sep).join('/');
      return !portable.startsWith('agents/') && !portable.startsWith('stories/')
        && (portable.endsWith('.md') || helpers.has(portable));
    })
    .map((relative) => ({ relative, source: path.join(sourceRoot, relative) }));
  const agentRoot = path.join(PACKAGE_ROOT, '.aexos-core', 'development', 'agents');
  for (const relative of walkFiles(agentRoot).filter((file) => file.endsWith('.md')
    && !file.includes('.backup') && !path.basename(file).startsWith('test-'))) {
    mappings.push({ relative: path.join('agents', relative), source: path.join(agentRoot, relative) });
  }
  return mappings;
}

function removeMappedFiles(rootState, item, mappings, options, result) {
  const targetRoot = path.join(rootState.root, item.path);
  assertSafePath(rootState, targetRoot);
  for (const mapping of mappings) {
    const target = path.join(targetRoot, mapping.relative);
    if (!pathExistsWithoutFollowingLinks(target)) continue;
    const portable = mapping.relative.split(path.sep).join('/');
    try {
      assertSafePath(rootState, target);
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Managed target is not a regular file');
      if (!fs.existsSync(mapping.source) || !fs.lstatSync(mapping.source).isFile()) throw new Error(`Packaged ownership source is missing: ${portable}`);
      if (sha256(fs.readFileSync(target)) !== sha256(fs.readFileSync(mapping.source))) {
        result.preserved.push(`${item.path}/${portable}`);
        continue;
      }
      if (!options.dryRun) fs.unlinkSync(target);
      result.removed.push(`${item.path}/${portable}`);
      if (!options.dryRun) pruneEmptyParents(rootState, path.dirname(target), targetRoot);
    } catch (error) {
      result.failed.push({ path: `${item.path}/${portable}`, message: error.message });
    }
  }
  if (!options.dryRun && fs.existsSync(targetRoot)) pruneEmptyParents(rootState, targetRoot, rootState.root);
}

function findAexosFootprint(projectRoot) { return AEXOS_FOOTPRINT.filter((item) => exists(projectRoot, item.path)); }
function findLegacyInstalls(projectRoot) {
  const items = LEGACY_FOOTPRINT.filter((item) => exists(projectRoot, item.path)).map((item) => ({ ...item }));
  for (const { dir, prefixes, label } of LEGACY_SKILL_PREFIXES) {
    const full = path.join(projectRoot, dir);
    if (!pathExistsWithoutFollowingLinks(full)) continue;
    let entries; try { entries = fs.readdirSync(full); } catch { continue; }
    for (const entry of entries) {
      const prefix = prefixes.find((candidate) => entry.startsWith(candidate));
      if (prefix) items.push({ path: `${dir}/${entry}`, label: `${label} (${entry})`, brand: prefix.replace('-', '').toUpperCase() });
    }
  }
  return { items, brands: [...new Set(items.map((item) => item.brand))].sort() };
}
function removeFootprint(projectRoot, items, options = {}) {
  const result = { removed: [], preserved: [], failed: [] };
  let rootState;
  try { rootState = captureSafeRoot(projectRoot); } catch (error) { result.failed.push({ path: '.', message: error.message }); return result; }
  for (const item of items) {
    const full = path.join(rootState.root, item.path);
    if (!pathExistsWithoutFollowingLinks(full)) continue;
    try {
      if (item.strategy === 'grok-manifest') removeGrok(rootState, item, options, result);
      else if (item.strategy === 'package-files') removePackageFiles(rootState, item, options, result);
      else if (item.strategy === 'claude-commands') removeMappedFiles(rootState, item, claudeCommandOwnershipMap(), options, result);
      else {
        assertSafePath(rootState, full);
        if (!options.dryRun) fs.rmSync(full, { recursive: true, force: true });
        result.removed.push(item.path);
      }
    } catch (error) { result.failed.push({ path: item.path, message: error.message }); }
  }
  return result;
}

module.exports = {
  AEXOS_FOOTPRINT, CLAUDE_TEMPLATE_FILES, LEGACY_FOOTPRINT, LEGACY_SKILL_PREFIXES,
  findAexosFootprint, findLegacyInstalls, removeFootprint,
  pathExistsWithoutFollowingLinks,
  serializeManagedConfig, serializeManagedRuleSections,
};
