'use strict';

const fs = require('fs');
const path = require('path');
const {
  EMBEDDED_NODE,
  MODE,
  POLICY_ROWS,
  RELEASE_LANES,
  SCHEMA_VERSION,
  canonicalJson,
  repositoryRoot,
  sha256,
  validateApprovedPolicies,
} = require('./provision-trust-root-launcher-inputs-host');

const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'mode',
  'sourceRevision',
  'packageVersion',
  'launcherTupleId',
  'approvedInputs',
  'generatedOutputs',
  'closureSha256',
  'result',
]);
const APPROVED_KEYS = Object.freeze(['embeddedNode', 'lane', 'toolchain', 'policies']);
const GENERATED_KEYS = Object.freeze([
  'buildRecipe',
  'toolchainFiles',
  'expandedFlags',
  'archives',
  'objects',
  'runtimeImports',
  'systemLibraries',
  'elevatedLane',
]);

function requireExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (canonicalJson(Object.keys(value)) !== canonicalJson(keys)) {
    throw new Error(`${label} key order/schema mismatch`);
  }
}

function requireNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be non-empty`);
}

function requireSha256(value, label) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be lowercase SHA-256`);
}

function requireOrderedRecords(records, keys, label) {
  requireNonEmptyArray(records, label);
  let previousPath = '';
  const paths = new Set();
  for (const record of records) {
    requireExactKeys(record, keys, label);
    if (!record.path || record.path <= previousPath || paths.has(record.path)) {
      throw new Error(`${label} must be uniquely path ordered`);
    }
    if (record.bytes <= 0) throw new Error(`${label} bytes must be positive`);
    requireSha256(record.sha256, `${label}.sha256`);
    previousPath = record.path;
    paths.add(record.path);
  }
}

function validateClosure(closure) {
  validateApprovedPolicies();
  requireExactKeys(closure, TOP_LEVEL_KEYS, 'closure');
  if (closure.schemaVersion !== SCHEMA_VERSION || closure.mode !== MODE) {
    throw new Error('Closure schema/mode mismatch');
  }
  const lane = RELEASE_LANES.find((row) => row.launcherTupleId === closure.launcherTupleId);
  if (!lane) throw new Error('Unapproved launcher tuple');
  if (closure.packageVersion !== '5.3.0' || !closure.sourceRevision) {
    throw new Error('Closure source/package mismatch');
  }
  requireExactKeys(closure.approvedInputs, APPROVED_KEYS, 'approvedInputs');
  if (canonicalJson(closure.approvedInputs.embeddedNode) !== canonicalJson(EMBEDDED_NODE)) {
    throw new Error('Embedded Node approved input mismatch');
  }
  if (
    canonicalJson(closure.approvedInputs.lane) !== canonicalJson(lane.lane) ||
    canonicalJson(closure.approvedInputs.toolchain) !== canonicalJson(lane.toolchain)
  ) {
    throw new Error('Lane/toolchain approved input mismatch');
  }
  const policies = Object.fromEntries(POLICY_ROWS.map((row) => [row.name, {
    bytes: row.bytes,
    sha256: row.sha256,
  }]));
  if (canonicalJson(closure.approvedInputs.policies) !== canonicalJson(policies)) {
    throw new Error('Policy approved input mismatch');
  }
  requireExactKeys(closure.generatedOutputs, GENERATED_KEYS, 'generatedOutputs');
  const generated = closure.generatedOutputs;
  requireExactKeys(generated.buildRecipe, ['path', 'bytes', 'sha256'], 'buildRecipe');
  if (!generated.buildRecipe.path || generated.buildRecipe.bytes <= 0 || !generated.buildRecipe.sha256) {
    throw new Error('Incomplete buildRecipe');
  }
  requireOrderedRecords(
    generated.toolchainFiles,
    ['role', 'path', 'bytes', 'sha256', 'versionOutput'],
    'toolchainFiles',
  );
  requireOrderedRecords(
    generated.archives,
    ['path', 'bytes', 'sha256', 'memberInventorySha256', 'symbolInventorySha256'],
    'archives',
  );
  requireOrderedRecords(
    generated.objects,
    ['path', 'bytes', 'sha256', 'symbolInventorySha256'],
    'objects',
  );
  requireNonEmptyArray(generated.systemLibraries, 'systemLibraries');
  requireExactKeys(
    generated.expandedFlags,
    ['compile', 'compileSha256', 'link', 'linkSha256', 'defines', 'definesSha256'],
    'expandedFlags',
  );
  requireNonEmptyArray(generated.expandedFlags.compile, 'expandedFlags.compile');
  requireNonEmptyArray(generated.expandedFlags.link, 'expandedFlags.link');
  requireNonEmptyArray(generated.expandedFlags.defines, 'expandedFlags.defines');
  if (
    sha256(Buffer.from(canonicalJson(generated.expandedFlags.compile))) !==
      generated.expandedFlags.compileSha256 ||
    sha256(Buffer.from(canonicalJson(generated.expandedFlags.link))) !==
      generated.expandedFlags.linkSha256 ||
    sha256(Buffer.from(canonicalJson(generated.expandedFlags.defines))) !==
      generated.expandedFlags.definesSha256
  ) {
    throw new Error('Expanded flags SHA-256 mismatch');
  }
  requireExactKeys(
    generated.runtimeImports,
    ['inventorySha256', 'allowlistSha256', 'forbiddenCount'],
    'runtimeImports',
  );
  requireSha256(generated.runtimeImports.inventorySha256, 'runtimeImports.inventorySha256');
  requireSha256(generated.runtimeImports.allowlistSha256, 'runtimeImports.allowlistSha256');
  if (generated.runtimeImports.forbiddenCount !== 0) throw new Error('Forbidden runtime import');
  requireExactKeys(
    generated.elevatedLane,
    [
      'laneId',
      'runnerImageVersion',
      'controllerSourceSha256',
      'controllerBinarySha256',
      'installerPrincipalId',
      'runtimePrincipalId',
      'installerPrincipalPolicySha256',
      'runtimeTokenPolicySha256',
      'provisioningOracleSha256',
      'ready',
    ],
    'elevatedLane',
  );
  if (generated.elevatedLane.ready !== true) throw new Error('Elevated lane not ready');
  if (
    generated.elevatedLane.runnerImageVersion !== lane.lane.runnerImageVersion ||
    generated.elevatedLane.installerPrincipalId === generated.elevatedLane.runtimePrincipalId
  ) {
    throw new Error('Elevated/restricted lane identity mismatch');
  }
  const prefix = {};
  for (const key of TOP_LEVEL_KEYS.slice(0, 7)) prefix[key] = closure[key];
  if (sha256(Buffer.from(canonicalJson(prefix))) !== closure.closureSha256) {
    throw new Error('Closure SHA-256 mismatch');
  }
  if (closure.result !== 'PASS') throw new Error('Closure result is not PASS');
  return true;
}

function verifyHost() {
  if (process.argv.length !== 2) throw new Error('Arguments are not accepted');
  const root = path.join(repositoryRoot(), 'artifacts', 'b2p-launcher-inputs-host-local');
  if (!fs.existsSync(root)) throw new Error('B0P evidence root is absent');
  const directories = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name));
  if (directories.length !== RELEASE_LANES.length) {
    throw new Error(`Expected ${RELEASE_LANES.length} exact closure directories, found ${directories.length}`);
  }
  const seen = new Set();
  for (const directory of directories) {
    const closurePath = path.join(root, directory.name, 'launcher-build-input-closure.json');
    const sidecarPath = `${closurePath}.sha256`;
    const bytes = fs.readFileSync(closurePath);
    const closure = JSON.parse(bytes.toString('utf8'));
    if (canonicalJson(closure) !== bytes.toString('utf8')) throw new Error('Non-canonical closure bytes');
    validateClosure(closure);
    if (directory.name !== closure.closureSha256) throw new Error('Closure directory/hash mismatch');
    if (fs.readFileSync(sidecarPath, 'utf8') !== `${closure.closureSha256}\n`) {
      throw new Error('Closure sidecar mismatch');
    }
    if (seen.has(closure.launcherTupleId)) throw new Error('Duplicate launcher tuple closure');
    seen.add(closure.launcherTupleId);
  }
  if (seen.size !== RELEASE_LANES.length) throw new Error('Incomplete launcher tuple closure set');
  return true;
}

if (require.main === module) {
  try {
    verifyHost();
    process.stdout.write('B0P launcher input closures verified.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  APPROVED_KEYS,
  GENERATED_KEYS,
  TOP_LEVEL_KEYS,
  requireExactKeys,
  validateClosure,
  verifyHost,
});
