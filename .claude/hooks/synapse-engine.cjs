#!/usr/bin/env node
'use strict';

/**
 * SYNAPSE UserPromptSubmit hook. Reads stdin, delegates to the runtime, and
 * writes provider-compatible context. All errors are silent and bounded by a
 * five-second timeout so the hook cannot block the user's prompt.
 */

const fs = require('fs');
const path = require('path');

const RUNTIME_PATH = path.join('.aexos-core', 'core', 'synapse', 'runtime', 'hook-runtime.js');

/** Locate the runtime in a canonical checkout or an installed package. */
function resolveHookRuntimeModulePath() {
  const roots = [process.cwd(), path.resolve(__dirname, '..', '..')];
  const prefixes = ['', path.join('node_modules', '@aexos', 'core')];
  for (const root of roots) {
    for (const prefix of prefixes) {
      const candidate = path.join(root, prefix, RUNTIME_PATH);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

let resolveHookRuntime = null;
let buildHookOutput = null;
try {
  const runtimePath = resolveHookRuntimeModulePath();
  if (runtimePath) {
    ({ resolveHookRuntime, buildHookOutput } = require(runtimePath));
  }
} catch {
  // Silent — missing/invalid runtime must never crash the hook process.
}

const HOOK_TIMEOUT_MS = 5000;

/** Read stdin as JSON. */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('error', (e) => reject(e));
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
  });
}

async function main() {
  const input = await readStdin();
  if (!resolveHookRuntime || !buildHookOutput) return;
  const runtime = resolveHookRuntime(input);
  if (!runtime) return;

  const result = await runtime.engine.process(input.prompt, runtime.session);

  if (runtime.sessionId && runtime.sessionsDir) {
    try {
      runtime.updateSession(runtime.sessionId, runtime.sessionsDir, {
        ...(runtime.session.active_agent ? { active_agent: runtime.session.active_agent } : {}),
        context: { last_bracket: result.bracket || 'FRESH' },
      });
    } catch (_err) {
      // Session persistence must never block the prompt.
    }
  }

  const output = JSON.stringify(buildHookOutput(result.xml));

  // Write output robustly across real process.stdout and mocked Jest streams.
  // Some mocks return boolean but never invoke callback; handle both patterns.
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    try {
      const flushed = process.stdout.write(output, (err) => finish(err));
      if (flushed) {
        setImmediate(() => finish());
      } else if (typeof process.stdout.once === 'function') {
        process.stdout.once('drain', () => finish());
      }
    } catch (err) {
      finish(err);
    }
  });
}

function run() {
  const timer = setTimeout(() => {
    process.exit(0);
  }, HOOK_TIMEOUT_MS);
  timer.unref();
  const finish = () => {
    clearTimeout(timer);
    process.exitCode = 0;
  };
  main().then(finish, finish);
}

if (require.main === module) run();

module.exports = { readStdin, main, run, resolveHookRuntimeModulePath, HOOK_TIMEOUT_MS };
