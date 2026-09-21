#!/usr/bin/env node
'use strict';

/**
 * Claude transport for the canonical AEXOS remote-operation guard.
 *
 * Policy, command patterns, bridge freshness, root validation, and identity
 * precedence live in one canonical hook shared with Grok. This entrypoint only
 * adapts its established public helper names and Claude's JSON-deny exit
 * contract.
 */

const fs = require('fs');
const path = require('path');

const CANONICAL_RELATIVE_PATH = path.join(
  '.aexos-core', 'infrastructure', 'templates', 'grok-hooks',
  'enforce-git-push-authority.cjs',
);
let loadedCanonical;

function loadCanonical() {
  if (loadedCanonical) return loadedCanonical;
  const projectRoot = path.resolve(__dirname, '..', '..');
  const candidates = [
    path.join(projectRoot, CANONICAL_RELATIVE_PATH),
    path.join(projectRoot, 'node_modules', '@aexos', 'core', CANONICAL_RELATIVE_PATH),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    // An existing but corrupt canonical module is a policy failure. Do not
    // skip it for another copy whose policy may differ.
    loadedCanonical = require(candidate);
    return loadedCanonical;
  }
  throw new Error(`Canonical push-authority policy not found (${candidates.join(', ')})`);
}

function extractCommand(input) {
  return loadCanonical().commandFrom(input);
}

function extractProjectRoot(input) {
  return loadCanonical().rootsFrom(input)[0];
}

function readBridgeAgent(projectRoot) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) {
    throw new TypeError('Bridge project root must be a non-empty string');
  }
  return loadCanonical().bridgeAgent({ workspaceRoot: projectRoot });
}

function getActiveAgent(command, input = {}) {
  return loadCanonical().getActiveAgent(input, command);
}

function denyMalformed(reason, exitCode) {
  process.stdout.write(JSON.stringify({
    decision: 'deny',
    reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  if (exitCode !== undefined) process.exitCode = exitCode;
}

function main() {
  let input;
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) {
      denyMalformed('Remote operation denied because the push-authority hook received no input.');
      return;
    }
    input = JSON.parse(raw);
  } catch {
    denyMalformed('Remote operation denied because the push-authority hook received malformed input.');
    return;
  }

  let canonical;
  try {
    canonical = loadCanonical();
    canonical.main(input);
  } catch {
    denyMalformed(
      'Remote operation denied because the canonical push-authority policy is unavailable or invalid.',
      2,
    );
    return;
  }
  // Claude Code consumes hookSpecificOutput.permissionDecision. Keep its
  // long-standing JSON-only transport contract while the canonical Grok
  // entrypoint also uses exit 2 for hosts that need it.
  if (process.exitCode === 2 && input?.tool_input && !input?.toolInput) process.exitCode = 0;
}

if (require.main === module) main();

const publicApi = {
  extractCommand,
  extractProjectRoot,
  readBridgeAgent,
  findRemoteOperation: (...args) => loadCanonical().findRemoteOperation(...args),
  getActiveAgent,
  isDevOpsAgent: (...args) => loadCanonical().isDevOpsAgent(...args),
  normalizeCommand: (...args) => loadCanonical().normalizeCommand(...args),
};

Object.defineProperties(publicApi, {
  DEVOPS_AGENT_ALIASES: { enumerable: true, get: () => loadCanonical().DEVOPS_IDS },
  REMOTE_OPERATION_PATTERNS: { enumerable: true, get: () => loadCanonical().REMOTE_OPERATION_PATTERNS },
});

module.exports = publicApi;
