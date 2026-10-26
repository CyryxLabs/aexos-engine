'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ConfinedFilesystem } = require('../../../.aexos-core/core/permissions/confined-filesystem');
const {
  DEFAULT_LIMITS,
  analyzeBrownfield,
  computeRelationshipId,
  validateBrownfieldEvidence,
} = require('../../../.aexos-core/core/code-intel/brownfield');

const roots = [];

function setup(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-brownfield-hardening-'));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

function request(root, overrides = {}) {
  return {
    protocol: 'aexos.brownfield-analysis/v1', analysisId: 'hardening-probe', projectRoot: root,
    allowedPaths: ['.'], exclusions: [],
    requestedViews: ['architecture', 'domain', 'api', 'data', 'dependencies', 'tests', 'risks'],
    limits: { ...DEFAULT_LIMITS }, output: { mode: 'return', path: 'evidence/result.json' },
    verification: { mode: 'static-only', requireSourceHashes: true, requireNoMutation: true },
    ...overrides,
  };
}

async function analyze(root, overrides = {}, options = {}) {
  return analyzeBrownfield(request(root, overrides), {
    authorizedProjectRoot: root,
    readBoundary: new ConfinedFilesystem({ projectRoot: root }),
    ...options,
  });
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

describe('brownfield review hardening', () => {
  test.each([
    ['ancestor rule', { '.gitignore': 'private/\n', 'private/a.ts': 'export function marker(){}\n' }, { allowedPaths: ['private'] }, false],
    ['nested basename rule', { 'pkg/.gitignore': 'hidden.ts\n', 'pkg/deep/hidden.ts': 'export function marker(){}\n', 'pkg/deep/safe.ts': 'export function safeMarker(){}\n' }, {}, true],
    ['operator rule cannot be negated', { 'private/.gitignore': '!a.ts\n', 'private/a.ts': 'export function marker(){}\n', 'safe.ts': 'export function safeMarker(){}\n' }, { exclusions: ['private/**'] }, true],
    ['explicit hard-excluded root', { 'node_modules/a.ts': 'export function marker(){}\n' }, { allowedPaths: ['node_modules'] }, false],
    ['explicit ignored file', { '.gitignore': 'hidden.ts\n', 'hidden.ts': 'export function marker(){}\n' }, { allowedPaths: ['hidden.ts'] }, false],
    ['explicit operator-excluded file', { 'private/a.ts': 'export function marker(){}\n' }, { allowedPaths: ['private/a.ts'], exclusions: ['private/**'] }, false],
  ])('does not analyze %s', async (_label, files, overrides, hasPositive) => {
    const result = await analyze(setup(files), overrides);
    const names = result.canonicalEvidence.findings.map((finding) => finding.name);
    expect(names).not.toContain('marker');
    if (hasPositive) expect(names).toContain('safeMarker');
  });

  test('suppresses credential-bearing manifest values and preserves real EOF coordinates', async () => {
    const text = JSON.stringify({ name: 'safe', dependencies: {
      private: 'https://fixture-user:synthetic-marker@example.test/pkg.tgz', public: '1.0.0',
    } });
    const result = await analyze(setup({ 'package.json': text }));
    expect(JSON.stringify(result.canonicalEvidence)).not.toContain('synthetic-marker');
    const manifest = result.canonicalEvidence.findings.find((finding) => finding.kind === 'architecture.package-manifest');
    expect(manifest.sourceRefs[0].endColumn).toBe(text.length + 1);
    expect(result.canonicalEvidence.findings.filter((finding) => finding.kind === 'dependency.manifest-declaration')
      .map((finding) => finding.name)).toEqual(['public']);
  });

  test('rejects forged identity, assertion, verification, coordinates, and unknown authority fields', async () => {
    const result = await analyze(setup({ 'a.ts': 'export function safe(){}\n' }), { allowedPaths: ['a.ts'] });
    const mutations = [
      (copy) => { copy.findings[0].id = 'arbitrary-id'; },
      (copy) => { copy.findings[0].assertionLevel = 'verified-runtime'; },
      (copy) => { copy.findings[0].sourceRefs[0].startLine = 999; },
      (copy) => { copy.verification.noMutation = 'not-checked'; },
      (copy) => { copy.acceptance = 'certified'; },
    ];
    for (const mutate of mutations) {
      const copy = structuredClone(result.canonicalEvidence);
      mutate(copy);
      expect(() => validateBrownfieldEvidence(copy, result.snapshot)).toThrow();
    }
  });

  test('enforces actual aggregate bytes after growth and reports omissions as partial', async () => {
    const root = setup({ 'a.ts': 'export function a(){}\n', 'b.ts': 'export function b(){}\n' });
    const boundary = new ConfinedFilesystem({ projectRoot: root });
    let first = true;
    const result = await analyze(root, { limits: { ...DEFAULT_LIMITS, maxFileBytes: 80, maxTotalBytes: 80 } }, {
      readBoundary: { dispatch: async (input) => {
        if (input.target === 'b.ts' && first) {
          first = false;
          fs.writeFileSync(path.join(root, 'b.ts'), `export function b(){}${' '.repeat(50)}`);
        }
        return boundary.dispatch(input);
      } },
    });
    expect(result.canonicalEvidence.coverage.capturedBytes).toBeLessThanOrEqual(80);
    expect(result.canonicalEvidence.coverage.status).toBe('partial');

    const oversized = await analyze(setup({ 'large.ts': 'export function large(){}\n' }), {
      limits: { ...DEFAULT_LIMITS, maxFileBytes: 4 },
    });
    expect(oversized.canonicalEvidence.coverage).toMatchObject({ status: 'partial', inventoryComplete: false });
  });

  test('reports parser absence as partial and syntax views unavailable', async () => {
    const result = await analyze(setup({ 'a.ts': 'export function safe(){}\n' }), {}, { typescript: null });
    expect(result.canonicalEvidence.coverage.status).toBe('partial');
    expect(result.canonicalEvidence.views.api.status).toBe('unavailable');
  });

  test('bounds a directly allowed file by the shared elapsed-time limit', async () => {
    const root = setup({ 'a.ts': 'export function safe(){}\n' });
    let tick = 0;
    await expect(analyze(root, {
      allowedPaths: ['a.ts'], limits: { ...DEFAULT_LIMITS, maxElapsedMs: 1 },
    }, { monotonicClock: () => (tick++ < 2 ? 0 : 10) }))
      .rejects.toMatchObject({ code: 'BROWNFIELD_ELAPSED_LIMIT' });
  });

  test('suppresses lexically shadowed routes and binds supported receiver evidence', async () => {
    const result = await analyze(setup({
      'a.ts': "import express from 'express'; const app=express(); app.get('/yes',()=>{}); function f(app:any){app.get('/no',()=>{});}\n",
    }));
    const routes = result.canonicalEvidence.findings.filter((finding) => finding.kind === 'api.http-route');
    expect(routes.map((finding) => finding.name)).toEqual(['GET /yes']);
    expect(routes[0].sourceRefs).toHaveLength(3);
  });

  test('keeps dependency declarations distinct by group and stable identity', async () => {
    const result = await analyze(setup({
      'package.json': JSON.stringify({ dependencies: { pkg: '1' }, devDependencies: { pkg: '2' }, peerDependencies: { pkg: '3' } }),
    }));
    const declarations = result.canonicalEvidence.findings.filter((finding) => finding.kind === 'dependency.manifest-declaration');
    expect(declarations.map((finding) => finding.attributes.group).sort())
      .toEqual(['dependencies', 'devDependencies', 'peerDependencies']);
    expect(new Set(declarations.map((finding) => finding.id))).toHaveProperty('size', 3);
  });

  test('performs zero reads below an operator-excluded allowed ancestor', async () => {
    const root = setup({
      'private/.gitignore': 'synthetic-private-rule\n',
      'private/a.ts': 'export function marker(){}\n',
      'public/a.ts': 'export function publicMarker(){}\n',
    });
    const boundary = new ConfinedFilesystem({ projectRoot: root });
    const calls = [];
    const result = await analyze(root, { allowedPaths: ['private/a.ts'], exclusions: ['private/**'] }, {
      readBoundary: { dispatch: async (input) => {
        calls.push(input.target);
        return boundary.dispatch(input);
      } },
    });
    expect(calls).toEqual([]);
    expect(result.canonicalEvidence.sources).toEqual([]);

    const allowed = await analyze(root, { allowedPaths: ['public'] });
    expect(allowed.canonicalEvidence.findings.map((finding) => finding.name)).toContain('publicMarker');
  });

  test('preserves directory anchoring and basename recursion for ignore rules', async () => {
    const result = await analyze(setup({
      'pkg/.gitignore': '/hidden.ts\nrecursive.ts\n!deep/keep/recursive.ts\n',
      'pkg/hidden.ts': 'export function excludedAtRoot(){}\n',
      'pkg/deep/hidden.ts': 'export function retainedBelowRoot(){}\n',
      'pkg/deep/recursive.ts': 'export function excludedRecursively(){}\n',
      'pkg/deep/keep/recursive.ts': 'export function retainedByNegation(){}\n',
    }));
    const names = result.canonicalEvidence.findings.map((finding) => finding.name);
    expect(names).toEqual(expect.arrayContaining(['retainedBelowRoot', 'retainedByNegation']));
    expect(names).not.toEqual(expect.arrayContaining(['excludedAtRoot', 'excludedRecursively']));
  });

  test('requires relationship references and captured local targets', async () => {
    const result = await analyze(setup({
      'a.ts': "import value from './b'; export function a(){return value;}\n",
      'b.ts': 'export default 1;\n',
    }));
    const edge = result.canonicalEvidence.relationships.find((relationship) => relationship.resolution === 'resolved-local');
    expect(edge).toMatchObject({ to: 'b.ts', resolution: 'resolved-local' });
    expect(() => validateBrownfieldEvidence(result.canonicalEvidence, result.snapshot)).not.toThrow();

    for (const mutate of [
      (relationship) => { relationship.sourceRefs = []; },
      (relationship) => { relationship.to = 'missing.ts'; },
      (relationship) => { relationship.resolution = 'ambiguous'; relationship.to = null; relationship.candidates = ['missing.ts']; },
    ]) {
      const copy = structuredClone(result.canonicalEvidence);
      const relationship = copy.relationships.find((item) => item.resolution === 'resolved-local');
      mutate(relationship);
      relationship.id = computeRelationshipId(relationship);
      expect(() => validateBrownfieldEvidence(copy, result.snapshot)).toThrow();
    }
  });

  test('requires lexical identity for imported server factories and receivers', async () => {
    const result = await analyze(setup({
      'a.ts': "import express from 'express'; const app=express(); app.get('/yes',()=>{}); function f(express:any){const local=express();local.get('/no',()=>{});}\n",
    }));
    const routes = result.canonicalEvidence.findings.filter((finding) => finding.kind === 'api.http-route');
    expect(routes.map((finding) => finding.name)).toEqual(['GET /yes']);
    expect(routes[0].sourceRefs).toHaveLength(3);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AMBIGUOUS_SERVER_FACTORY' }),
    ]));

    const nested = await analyze(setup({
      'a.ts': "import express from 'express'; const app=express(); function f(){const app=express();app.get('/inner',()=>{});} app.get('/outer',()=>{});\n",
    }));
    expect(nested.canonicalEvidence.findings.filter((finding) => finding.kind === 'api.http-route')
      .map((finding) => finding.name).sort()).toEqual(['GET /inner', 'GET /outer']);
  });

  test.each([
    ['excluded policy', { '.gitignore': 'private/', 'a.ts': 'export function marker(){}' }, { exclusions: ['.gitignore'] }, ['.gitignore', 'a.ts']],
    ['repository ancestor', { '.gitignore': 'private/', 'private/.gitignore': '!a.ts', 'private/a.ts': 'export function marker(){}' }, { allowedPaths: ['private/a.ts'] }, ['private/.gitignore', 'private/a.ts']],
    ['nested directory basename', { 'pkg/.gitignore': 'private/', 'pkg/deep/private/.gitignore': '!a.ts', 'pkg/deep/private/a.ts': 'export function marker(){}' }, {}, ['pkg/deep/private/.gitignore', 'pkg/deep/private/a.ts']],
    ['excluded nested policy', { 'pkg/.gitignore': 'a.ts', 'pkg/a.ts': 'export function marker(){}' }, { exclusions: ['pkg/.gitignore'] }, ['pkg/.gitignore', 'pkg/a.ts']],
  ])('performs zero excluded content reads: %s', async (_label, files, overrides, forbidden) => {
    const root = setup(files);
    const boundary = new ConfinedFilesystem({ projectRoot: root });
    const calls = [];
    const result = await analyze(root, overrides, { readBoundary: { dispatch: async (input) => {
      calls.push(input.target);
      return boundary.dispatch(input);
    } } });
    for (const target of forbidden) expect(calls).not.toContain(target);
    expect(result.canonicalEvidence.findings.map((finding) => finding.name)).not.toContain('marker');
    if (overrides.exclusions) {
      expect(result.canonicalEvidence.coverage.status).toBe('partial');
      expect(result.canonicalEvidence.coverage.inventoryComplete).toBe(false);
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'IGNORE_POLICY_EXCLUDED' }),
      ]));
    }
  });

  test('preserves exact Git policy scope, escaping and ordered negation across explicit file roots', async () => {
    const root = setup({
      '.gitignore': '/hidden.ts\n*.tmp.ts\n\\#literal.ts\n\\!literal.ts\n',
      'hidden.ts': 'export function hiddenRoot(){}',
      '#literal.ts': 'export function hiddenHash(){}',
      '!literal.ts': 'export function hiddenBang(){}',
      'pkg/.gitignore': 'private/\n!keep.tmp.ts\n/only-here.ts\nflip.ts\n!flip.ts\nflip.ts\n',
      'pkg/hidden.ts': 'export function visibleRootAnchor(){}',
      'pkg/keep.tmp.ts': 'export function visibleNestedNegation(){}',
      'pkg/deep/only-here.ts': 'export function visibleNestedAnchor(){}',
      'pkg/only-here.ts': 'export function hiddenNestedAnchor(){}',
      'pkg/flip.ts': 'export function hiddenLastRule(){}',
      'pkg/deep/private/a.ts': 'export function hiddenDirectory(){}',
      'pkg/deep/private/.gitignore': '!a.ts\n',
    });
    const files = ['hidden.ts', '#literal.ts', '!literal.ts', 'pkg/hidden.ts', 'pkg/keep.tmp.ts',
      'pkg/deep/only-here.ts', 'pkg/only-here.ts', 'pkg/flip.ts', 'pkg/deep/private/a.ts'];
    const boundary = new ConfinedFilesystem({ projectRoot: root });
    const calls = [];
    const result = await analyze(root, { allowedPaths: files }, { readBoundary: { dispatch: async (input) => {
      calls.push(input.target);
      return boundary.dispatch(input);
    } } });
    expect(result.canonicalEvidence.findings.filter((finding) => finding.kind === 'api.exported-function')
      .map((finding) => finding.name).sort()).toEqual([
      'visibleNestedAnchor', 'visibleNestedNegation', 'visibleRootAnchor',
    ]);
    for (const target of files.filter((file) => !['pkg/hidden.ts', 'pkg/keep.tmp.ts', 'pkg/deep/only-here.ts'].includes(file))) {
      expect(calls).not.toContain(target);
    }
    expect(calls).not.toContain('pkg/deep/private/.gitignore');
    // One capture and one no-mutation verification, independent of root count.
    expect(calls.filter((target) => target === '.gitignore')).toHaveLength(2);
    expect(calls.filter((target) => target === 'pkg/.gitignore')).toHaveLength(2);
  });

  test('captures explicit policy roots once and bounds ancestor policy reads by file and directory limits', async () => {
    const root = setup({ '.gitignore': '# root\n', 'pkg/.gitignore': '# nested\n', 'pkg/a.ts': 'export function a(){}' });
    const boundary = new ConfinedFilesystem({ projectRoot: root });
    const calls = [];
    const options = { readBoundary: { dispatch: async (input) => {
      calls.push(input.target);
      return boundary.dispatch(input);
    } } };
    const result = await analyze(root, { allowedPaths: ['.gitignore', 'pkg/a.ts'] }, options);
    expect(result.canonicalEvidence.sources.filter((source) => source.path === '.gitignore')).toHaveLength(1);
    expect(calls.filter((target) => target === '.gitignore')).toHaveLength(2);
    for (const limits of [{ maxFiles: 1 }, { maxDirectories: 1 }]) {
      calls.length = 0;
      await expect(analyze(root, { allowedPaths: ['pkg/a.ts'], limits: { ...DEFAULT_LIMITS, ...limits } }, options))
        .rejects.toMatchObject({ code: 'BROWNFIELD_IGNORE_LIMIT' });
      expect(calls).toEqual(['.gitignore']);
    }
  });

  test.each([
    'function f({express}:any){const app=express();app.get("/no",()=>{});}',
    'function f([express]:any){const app=express();app.get("/no",()=>{});}',
    'function f(){const {factory:express}=other;const app=express();app.get("/no",()=>{});}',
    'try {} catch({express}){const app=express();app.get("/no",()=>{});}',
    'express=other;const app=express();app.get("/no",()=>{});',
    '({express}=other);const app=express();app.get("/no",()=>{});',
    '[express]=other;const app=express();app.get("/no",()=>{});',
    'for(express of others){}const app=express();app.get("/no",()=>{});',
    'const app=express();function replace(){express=other;}app.get("/no",()=>{});',
    'let app=express();({app}=other);app.get("/no",()=>{});',
    'let app=express();[app]=other;app.get("/no",()=>{});',
    'let app=express();app++;app.get("/no",()=>{});',
    'const app=express();function f({app}:any){app.get("/no",()=>{});}',
  ])('rejects shadowed or written symbol identity: %s', async (source) => {
    const result = await analyze(setup({ 'a.ts': `import express from 'express';${source}` }));
    expect(result.canonicalEvidence.findings.filter((finding) => finding.kind === 'api.http-route')).toEqual([]);
    expect(result.diagnostics.some((item) => /^AMBIGUOUS_SERVER_/.test(item.code))).toBe(true);
  });

  test('preserves distinct nested bindings and ignores writes to unrelated same-name symbols', async () => {
    const result = await analyze(setup({ 'a.ts': `import express from 'express';
      const app=express();
      function unrelated(express:any, app:any){express=other;app=other;}
      function nested(){const app=express();app.get('/inner',()=>{});}
      app.get('/outer',()=>{});` }));
    expect(result.canonicalEvidence.findings.filter((finding) => finding.kind === 'api.http-route')
      .map((finding) => finding.name).sort()).toEqual(['GET /inner', 'GET /outer']);
  });

  test.each([
    ["import {Router as factory} from 'express'; const app=factory(); app.get('/yes',()=>{});", ['GET /yes']],
    ["const app=express(); app.get('/yes',()=>{}); import express from 'express';", ['GET /yes']],
    ["import type express from 'express'; const app=express(); app.get('/no',()=>{});", []],
    ["import {type Router} from 'express'; const app=Router(); app.get('/no',()=>{});", []],
    ["import express from 'express'; const app=express(); var app=other; app.get('/no',()=>{});", []],
  ])('requires an unambiguous value binding: %s', async (source, expected) => {
    const result = await analyze(setup({ 'a.ts': source }));
    expect(result.canonicalEvidence.findings.filter((finding) => finding.kind === 'api.http-route')
      .map((finding) => finding.name)).toEqual(expected);
  });

  test('symbol checking uses only a confined in-memory host despite hostile resolution directives', async () => {
    const { loadTypeScript } = require('../../../.aexos-core/core/code-intel/providers/typescript-snapshot-provider');
    const ts = loadTypeScript();
    const createProgram = jest.fn((roots, options, host) => {
      expect(options).toMatchObject({ noLib: true, noResolve: true, noEmit: true, types: [] });
      expect(host.getSourceFile('../outside.ts')).toBeUndefined();
      expect(host.readFile('../outside.ts')).toBeUndefined();
      expect(host.fileExists('../outside.ts')).toBe(false);
      expect(host.resolveModuleNames(['../outside', 'express'])).toEqual([undefined, undefined]);
      expect(host.resolveTypeReferenceDirectives(['node'])).toEqual([undefined]);
      expect(() => host.writeFile('outside.js', '')).toThrow();
      return ts.createProgram(roots, options, host);
    });
    const result = await analyze(setup({ 'a.ts': `/// <reference path="../outside.ts" />
      /// <reference types="node" />
      import express from 'express';const app=express();app.get('/yes',()=>{});` }), {}, {
      typescript: { ...ts, createProgram },
    });
    expect(createProgram).toHaveBeenCalledTimes(1);
    expect(result.canonicalEvidence.findings.filter((finding) => finding.kind === 'api.http-route')
      .map((finding) => finding.name)).toEqual(['GET /yes']);
  });
});
