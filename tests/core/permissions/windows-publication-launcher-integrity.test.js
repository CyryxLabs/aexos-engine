'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectNativeCandidateIdentity } = require(path.resolve(__dirname,
  '../../../.aexos-core/core/permissions/native-publication-support.js'));

const sourceRoot = path.resolve(__dirname, '../../../.aexos-core/core/permissions');
const graphs = [
  {
    launcher: 'windows-publication-session.ps1',
    dependencies: ['windows-publication-finite-transport.cs', 'windows-publication-finite-relay.cs'],
  },
  {
    launcher: 'windows-publication-protected-session.ps1',
    dependencies: [
      'windows-publication-protected-transport.cs',
      'windows-publication-protected-relay-base.cs',
      'windows-publication-protected-native.cs',
      'windows-publication-protected-relay.cs',
    ],
  },
];
const supportedTuple = Object.freeze({
  platform: 'win32', architecture: 'x64', release: '10.0.26300', filesystem: 'NTFS', powershellVersion: '7.6.5',
});

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function consume(body, token, code) {
  const values = [];
  let offset = 0;
  while (offset < body.length) {
    token.lastIndex = offset;
    const match = token.exec(body);
    if (!match || match.index !== offset || token.lastIndex <= offset) throw new Error(code);
    values.push(match.slice(1));
    offset = token.lastIndex;
  }
  if (offset !== body.length) throw new Error(code);
  return values;
}

function parseGraphSource(source) {
  const lines = source.split(/\r?\n/);
  const bindingLines = lines.filter((line) => line.includes('$bindings='));
  if (bindingLines.length !== 1) throw new Error('BINDINGS_DECLARATION_COUNT');
  const binding = bindingLines[0].match(/^\$bindings=@\{(?<body>.*)\}$/);
  if (!binding) throw new Error('BINDINGS_GRAMMAR');
  const bindings = consume(binding.groups.body, /'([^']+)'='([A-F0-9]{64})'(?:;|$)/y,
    'BINDINGS_GRAMMAR').map(([name, hash]) => ({ name, sha256: hash.toLowerCase() }));

  const enumerationLines = lines.filter((line) => line.includes('foreach($name in @'));
  if (enumerationLines.length !== 1) throw new Error('ENUMERATION_DECLARATION_COUNT');
  const enumeration = enumerationLines[0].match(/^\s*foreach\(\$name in @\((?<body>[^)]*)\)\)\s*\{.*$/);
  if (!enumeration) throw new Error('ENUMERATION_GRAMMAR');
  const sources = consume(enumeration.groups.body, /'([^']+)'(?:,|$)/y, 'ENUMERATION_GRAMMAR')
    .map(([name]) => name);
  return { bindings, sources };
}

function exactList(actual, expected, code) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length
    || actual.some((name, index) => name !== expected[index])) throw new Error(code);
}

function validateGraphSource(source, expected, hashFor) {
  const parsed = parseGraphSource(source);
  exactList(parsed.bindings.map((item) => item.name), expected, 'BINDINGS_EXACT_LIST');
  exactList(parsed.sources, expected, 'ENUMERATION_EXACT_LIST');
  for (const binding of parsed.bindings) {
    if (binding.sha256 !== hashFor(binding.name)) throw new Error(`SOURCE_HASH:${binding.name}`);
  }
  return parsed;
}

function declaredSource(bindings, sources) {
  const map = bindings.map(({ name, hash }) => `'${name}'='${hash}'`).join(';');
  const list = sources.map((name) => `'${name}'`).join(',');
  return `$bindings=@{${map}}\nforeach($name in @(${list})) { }\n`;
}

function runtimePrerequisite() {
  if (process.platform !== 'win32') return { status: 'NOT_APPLICABLE', reason: 'WINDOWS_REQUIRED' };
  let identity;
  try { identity = inspectNativeCandidateIdentity(); } catch (error) {
    return { status: 'NOT_APPLICABLE', reason: error.code || error.message };
  }
  if (JSON.stringify(identity.tuple) !== JSON.stringify(supportedTuple)) {
    return { status: 'NOT_APPLICABLE', reason: 'EXACT_RUNTIME_TUPLE_REQUIRED', observed: identity.tuple };
  }
  return { status: 'APPLICABLE', executable: identity.executable, identity };
}

function copyGraph(graph) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-launcher-integrity-'));
  for (const name of [graph.launcher, ...graph.dependencies]) {
    fs.copyFileSync(path.join(sourceRoot, name), path.join(directory, name));
  }
  return directory;
}

function removeOwned(directory) {
  const parent = fs.realpathSync.native(os.tmpdir());
  const relative = path.relative(parent, fs.realpathSync.native(directory));
  if (!relative.startsWith('aexos-launcher-integrity-') || relative.includes(path.sep)) {
    throw new Error('TEMP_SCOPE_CHANGED');
  }
  fs.rmSync(directory, { recursive: true });
}

const runtime = runtimePrerequisite();
const runtimeDescribe = runtime.status === 'APPLICABLE' ? describe : describe.skip;

describe('portable Windows publication launcher dependency grammar', () => {
  test.each(graphs)('$launcher has an exact, complete and current source graph', (graph) => {
    const source = fs.readFileSync(path.join(sourceRoot, graph.launcher), 'utf8');
    validateGraphSource(source, graph.dependencies, (name) => sha256(path.join(sourceRoot, name)));
  });

  test(`runtime applicability is explicit: ${runtime.status}`, () => {
    expect(runtime.status === 'APPLICABLE' || (runtime.status === 'NOT_APPLICABLE'
      && typeof runtime.reason === 'string' && runtime.reason.length > 0)).toBe(true);
  });

  const expected = ['first.cs', 'second.cs'];
  const hashes = new Map(expected.map((name, index) => [name, String(index + 1).repeat(64)]));
  const validBindings = expected.map((name) => ({ name, hash: hashes.get(name) }));
  const controls = [
    ['map missing', validBindings.slice(1), expected, 'BINDINGS_EXACT_LIST'],
    ['map duplicate', [validBindings[0], validBindings[0], validBindings[1]], expected, 'BINDINGS_EXACT_LIST'],
    ['map extra cs', [...validBindings, { name: 'extra.cs', hash: '3'.repeat(64) }], expected, 'BINDINGS_EXACT_LIST'],
    ['map extra non-cs', [...validBindings, { name: 'extra.txt', hash: '3'.repeat(64) }], expected,
      'BINDINGS_EXACT_LIST'],
    ['map reordered', [...validBindings].reverse(), expected, 'BINDINGS_EXACT_LIST'],
    ['enumeration missing', validBindings, expected.slice(1), 'ENUMERATION_EXACT_LIST'],
    ['enumeration duplicate', validBindings, [expected[0], expected[0], expected[1]], 'ENUMERATION_EXACT_LIST'],
    ['enumeration extra cs', validBindings, [...expected, 'extra.cs'], 'ENUMERATION_EXACT_LIST'],
    ['enumeration extra non-cs', validBindings, [...expected, 'extra.txt'], 'ENUMERATION_EXACT_LIST'],
    ['enumeration reordered', validBindings, [...expected].reverse(), 'ENUMERATION_EXACT_LIST'],
  ];
  test.each(controls)('rejects %s', (_name, bindings, sources, code) => {
    expect(() => validateGraphSource(declaredSource(bindings, sources), expected,
      (name) => hashes.get(name))).toThrow(code);
  });

  test('rejects a malformed hash without dropping the map entry', () => {
    const malformed = declaredSource(validBindings, expected).replace(hashes.get('first.cs'), 'A'.repeat(63));
    expect(() => validateGraphSource(malformed, expected, (name) => hashes.get(name))).toThrow('BINDINGS_GRAMMAR');
  });

  test.each([
    ['map syntax', declaredSource(validBindings, expected).replace(';', ';UNPARSED')],
    ['enumeration syntax', declaredSource(validBindings, expected).replace("'first.cs','second.cs'",
      "'first.cs',UNPARSED,'second.cs'")],
  ])('rejects unparsed %s', (_name, source) => {
    expect(() => validateGraphSource(source, expected, (name) => hashes.get(name)))
      .toThrow(/BINDINGS_GRAMMAR|ENUMERATION_GRAMMAR/);
  });
});

runtimeDescribe('host-scoped launcher process boundaries', () => {
  beforeAll(() => {
    expect(sha256(runtime.executable)).toBe(runtime.identity.hashes.executableSha256);
    const version = spawnSync(runtime.executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    expect(version.error).toBeUndefined();
    expect(version).toMatchObject({ signal: null, status: 0 });
    expect(version.stdout.trim()).toBe(supportedTuple.powershellVersion);
    const elevated = spawnSync(runtime.executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      '[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],
    { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    expect(elevated.error).toBeUndefined();
    expect(elevated).toMatchObject({ signal: null, status: 0 });
    expect(elevated.stdout.trim()).toBe('False');
  });

  function runLauncher(file) {
    return spawnSync(runtime.executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', file], {
      input: '', encoding: 'utf8', timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024,
    });
  }

  test.each(graphs)('$launcher rejects a changed owned dependency before compilation', (graph) => {
    const directory = copyGraph(graph);
    try {
      fs.appendFileSync(path.join(directory, graph.dependencies[0]), '\n// owned tamper negative\n');
      const result = runLauncher(path.join(directory, graph.launcher));
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('SOURCE_HASH');
      expect(result.stderr).not.toMatch(/Add-Type.*error|COMPILER/i);
    } finally {
      removeOwned(directory);
    }
  });

  test('corrected protected launcher compiles and reaches only the closed-input boundary', () => {
    const result = runLauncher(path.join(sourceRoot, 'windows-publication-protected-session.ps1'));
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('INPUT_EOF');
    expect(result.stderr).not.toMatch(/SOURCE_HASH|Add-Type.*error|COMPILER|AEXOS_FINITE_ENROLL/i);
  });
});
