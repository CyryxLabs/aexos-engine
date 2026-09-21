#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HOOK_TIMEOUT_MS = 5000;

function readStdin(stream = process.stdin, timeoutMs = HOOK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let data = '';
    const cleanup = () => {
      clearTimeout(timer);
      stream.removeListener('error', onError);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
    };
    const onError = (error) => { cleanup(); reject(error); };
    const onData = (chunk) => { data += chunk; };
    const onEnd = () => {
      cleanup();
      try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
    };
    const timer = setTimeout(() => onError(new Error('Hook stdin timed out')), timeoutMs);
    timer.unref();
    stream.setEncoding('utf8');
    stream.on('error', onError);
    stream.on('data', onData);
    stream.on('end', onEnd);
  });
}

function runtimeResolution(input = {}) {
  const roots = [
    input.cwd, input.workspaceRoot, process.env.GROK_WORKSPACE_ROOT, process.cwd(),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..', '..', '..', '..'),
  ]
    .filter(Boolean).map((root) => path.resolve(root));
  for (const root of roots) {
    for (const candidate of [
      path.join(root, '.aexos-core', 'core', 'synapse', 'runtime', 'hook-runtime.js'),
      path.join(root, 'node_modules', '@aexos', 'core', '.aexos-core', 'core', 'synapse', 'runtime', 'hook-runtime.js'),
    ]) if (fs.existsSync(candidate)) return { path: candidate, root };
  }
  return null;
}

function runtimePath(input = {}) {
  return runtimeResolution(input)?.path || null;
}

async function main(input) {
  const resolution = runtimeResolution(input);
  if (!resolution) return;
  const { resolveHookRuntime, buildHookOutput } = require(resolution.path);
  const normalized = {
    ...input,
    prompt: input.prompt ?? input.userPrompt ?? input.user_prompt ?? input?.toolInput?.prompt ?? '',
    cwd: input.cwd ?? input.workspaceRoot ?? process.env.GROK_WORKSPACE_ROOT ?? resolution.root,
  };
  const runtime = resolveHookRuntime(normalized);
  if (!runtime) return;
  const result = await runtime.engine.process(normalized.prompt, runtime.session);
  if (runtime.sessionId && runtime.sessionsDir) {
    try {
      runtime.updateSession(runtime.sessionId, runtime.sessionsDir, {
        ...(runtime.session.active_agent ? { active_agent: runtime.session.active_agent } : {}),
        context: { last_bracket: result.bracket || 'FRESH' },
      });
    } catch (_) { /* observational hook must not block prompts */ }
  }
  process.stdout.write(JSON.stringify(buildHookOutput(result.xml)));
}

async function run(stream = process.stdin, timeoutMs = HOOK_TIMEOUT_MS) {
  let timeout;
  const deadline = new Promise((resolve) => {
    timeout = setTimeout(resolve, timeoutMs);
    timeout.unref();
  });
  try {
    await Promise.race([readStdin(stream, timeoutMs).then((input) => main(input)), deadline]);
  } catch (_) { /* hooks never block the caller */ }
  finally { clearTimeout(timeout); }
  process.exitCode = 0;
}

if (require.main === module) {
  const timer = setTimeout(() => process.exit(0), HOOK_TIMEOUT_MS);
  timer.unref();
  run().finally(() => clearTimeout(timer));
}

module.exports = { runtimePath, readStdin, main, run, HOOK_TIMEOUT_MS };
