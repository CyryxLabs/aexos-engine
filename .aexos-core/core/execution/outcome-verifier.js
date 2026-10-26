'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeTaskContract, assertProducedPaths, TaskContractError } = require('./task-contract');

function fail(code, message) {
  throw new TaskContractError(code, message);
}

function resolveArtifact(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /[{}]/.test(relative)) {
    fail('OUTCOME_PATH_INVALID', 'Outcome verification requires a concrete project-relative path.');
  }
  const resolved = path.resolve(root, relative);
  const inside = path.relative(root, resolved);
  if (!inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
    fail('OUTCOME_PATH_OUTSIDE', 'Outcome artifact must remain inside the project.');
  }
  // Reject every reparse/symlink component; checking only the leaf is insufficient.
  let cursor = root;
  for (const part of inside.split(path.sep)) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      fail('OUTCOME_PATH_SYMLINK', 'Outcome paths may not traverse symbolic links or junctions.');
    }
  }
  const real = fs.realpathSync(resolved);
  const realRelative = path.relative(root, real);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    fail('OUTCOME_PATH_OUTSIDE', 'Resolved outcome artifact escapes the project.');
  }
  return { absolute: real, relative: inside.split(path.sep).join('/'), stat: fs.statSync(real) };
}

function matches(declared, actual) {
  const expression = declared.replace(/\\/g, '/').split(/(\{[^{}]+\})/g)
    .map((part) => /^\{[^{}]+\}$/.test(part) ? '[^/]+'
      : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  return new RegExp(`^${expression}$`).test(actual);
}

function captureArtifact(artifact) {
  const stat = fs.statSync(artifact.absolute);
  const identity = { dev: String(stat.dev), ino: String(stat.ino) };
  return { bytes: stat.size, identity,
    sha256: stat.isFile() ? crypto.createHash('sha256').update(fs.readFileSync(artifact.absolute)).digest('hex') : null };
}

function assertArtifactsUnchanged(root, artifacts) {
  for (const expected of artifacts) {
    const current = resolveArtifact(root, expected.path);
    const captured = captureArtifact(current);
    if (captured.bytes !== expected.bytes || captured.sha256 !== expected.sha256
      || captured.identity.dev !== expected.identity.dev || captured.identity.ino !== expected.identity.ino) {
      fail('OUTCOME_ARTIFACT_CHANGED', 'Outcome artifact changed across a trusted verification boundary.');
    }
  }
}

async function verifyTaskOutcome(request, options = {}) {
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const contract = normalizeTaskContract(request.contract, root);
  if (request.success !== true) fail('OUTCOME_EXECUTION_FAILED', 'Only successful execution can be evaluated for acceptance.');
  if (!Array.isArray(request.produced) || request.produced.some((item) => typeof item !== 'string')) {
    fail('OUTCOME_PRODUCED_INVALID', 'Outcome produced must be an array of paths.');
  }
  const produced = assertProducedPaths(contract, request.produced, root);
  const artifacts = [];
  for (const output of contract.produces) {
    if (!output.path) continue;
    const paths = produced.filter((item) => matches(output.path, item));
    if (paths.length === 0) fail('OUTCOME_OUTPUT_MISSING', `Required output was not produced: ${output.name}.`);
    for (const item of paths) {
      const artifact = resolveArtifact(root, item);
      const validKind = output.kind === 'directory' ? artifact.stat.isDirectory() : artifact.stat.isFile();
      if (!validKind) fail('OUTCOME_OUTPUT_KIND', `Wrong artifact kind for ${output.name}.`);
      artifacts.push({ name: output.name, path: artifact.relative, kind: output.kind, ...captureArtifact(artifact) });
    }
  }
  const checks = [];
  for (const [index, check] of contract.verify.entries()) {
    let passed = false;
    if (check.type === 'file-exists' || check.type === 'directory-exists') {
      const artifact = resolveArtifact(root, check.target);
      passed = check.type === 'file-exists' ? artifact.stat.isFile() : artifact.stat.isDirectory();
    } else if (check.type === 'result-status') {
      passed = check.expected === 'success' || check.expected === true;
    } else {
      const verifier = Object.hasOwn(options.verifiers || {}, check.type) ? options.verifiers[check.type] : null;
      if (typeof verifier !== 'function') {
        fail('OUTCOME_VERIFIER_REQUIRED', `A trusted ${check.type} verifier is required; task text is never executed automatically.`);
      }
      // Snapshot passed to a trusted verifier; it cannot mutate the caller's contract.
      const result = await verifier(JSON.parse(JSON.stringify(check)), { projectRoot: root, artifacts: structuredClone(artifacts) });
      passed = result === true;
    }
    assertArtifactsUnchanged(root, artifacts);
    if (!passed) fail('OUTCOME_CHECK_FAILED', `Outcome verification ${index + 1} (${check.type}) did not pass.`);
    checks.push({ index, type: check.type, passed: true });
  }
  return {
    verdict: 'ACCEPTED',
    evidenceLevel: 'declared-checks-passed',
    contractHash: crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex'),
    artifacts, checks,
  };
}

module.exports = { resolveArtifact, verifyTaskOutcome };
