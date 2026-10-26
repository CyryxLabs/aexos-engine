'use strict';

const path = require('path');
const { CodeIntelClient } = require('../code-intel-client');
const { TypeScriptSnapshotProvider } = require('../providers/typescript-snapshot-provider');
const { CodebaseMapper } = require('../../../infrastructure/scripts/codebase-mapper');
const { validateBrownfieldContract } = require('./contract');
const { buildEvidence } = require('./evidence');
const { createBrownfieldSnapshot } = require('./snapshot');

async function reread(readBoundary, request) {
  const dispatch = typeof readBoundary === 'function' ? readBoundary : readBoundary.dispatch.bind(readBoundary);
  return dispatch(request);
}

async function verifySnapshotUnchanged(snapshot, readBoundary, maxFileBytes) {
  for (const entry of [...snapshot.entries.values()].sort((left, right) => left.path.localeCompare(right.path))) {
    const current = await reread(readBoundary, { operation: 'read', target: entry.path, maxBytes: maxFileBytes });
    if (!current?.success || current.sha256 !== entry.sha256 || current.byteLength !== entry.byteLength) {
      throw Object.assign(new Error('Captured source changed before evidence export.'), {
        code: 'BROWNFIELD_SOURCE_CHANGED',
      });
    }
  }
}

function summarizeMapper(map) {
  return {
    version: map.version || null,
    projectKind: map.projectType || null,
    totalFiles: map.stats?.totalFiles || 0,
    codeFiles: map.stats?.codeFiles || 0,
    testFiles: map.stats?.testFiles || 0,
    serviceHints: Array.isArray(map.services) ? map.services.length : 0,
    patternHints: map.patterns && typeof map.patterns === 'object' ? Object.keys(map.patterns).sort() : [],
    limitation: 'Mapper output is a structural hint corroborated by the immutable snapshot, not runtime topology.',
  };
}

async function analyzeBrownfield(request, options = {}) {
  if (!options.authorizedProjectRoot) {
    throw Object.assign(new Error('Separately authorized project root is required.'), {
      code: 'BROWNFIELD_AUTHORIZED_ROOT_REQUIRED',
    });
  }
  if (!options.readBoundary) {
    throw Object.assign(new Error('Confined source read boundary is required.'), {
      code: 'BROWNFIELD_READ_BOUNDARY_REQUIRED',
    });
  }
  const { contract, contractHash } = validateBrownfieldContract(request, {
    authorizedProjectRoot: options.authorizedProjectRoot,
    fs: options.fs,
  });
  const clock = options.monotonicClock || (() => Date.now());
  const startedAt = clock();
  const assertWithinDeadline = () => {
    if (clock() - startedAt > contract.limits.maxElapsedMs) {
      throw Object.assign(new Error('Brownfield analysis exceeded its authorized elapsed-time limit.'), {
        code: 'BROWNFIELD_ELAPSED_LIMIT',
      });
    }
  };
  const snapshot = await createBrownfieldSnapshot(contract, {
    fs: options.fs,
    readBoundary: options.readBoundary,
    ignoreFactory: options.ignoreFactory,
    monotonicClock: options.monotonicClock,
  });
  assertWithinDeadline();
  const mapper = new CodebaseMapper(contract.projectRoot, {
    snapshotFs: snapshot.fs,
    clock: () => new Date(0),
    maxDepth: contract.limits.maxDepth,
    quiet: true,
  });
  const map = await mapper.generateMap();
  assertWithinDeadline();
  const provider = new TypeScriptSnapshotProvider({
    snapshot,
    typescript: options.typescript,
  });
  const client = new CodeIntelClient({ providers: [provider], cacheEnabled: false });
  let syntax = null;
  if (client.isCodeIntelAvailable()) {
    syntax = await client.analyzeCodebase(path.resolve(contract.projectRoot));
    if (syntax) syntax.analyzerVersion = provider.version;
  }
  assertWithinDeadline();
  await verifySnapshotUnchanged(snapshot, options.readBoundary, contract.limits.maxFileBytes);
  assertWithinDeadline();
  const canonicalEvidence = buildEvidence({
    contract,
    contractHash,
    snapshot,
    syntax,
    mapperSummary: summarizeMapper(map),
  });
  return {
    canonicalEvidence,
    diagnostics: [...snapshot.diagnostics, ...(syntax?.diagnostics || [])],
    snapshot,
  };
}

module.exports = {
  analyzeBrownfield,
  summarizeMapper,
  verifySnapshotUnchanged,
};
