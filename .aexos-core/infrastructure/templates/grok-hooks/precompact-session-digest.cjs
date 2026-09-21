#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HOOK_TIMEOUT_MS = 9000;

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

function runnerResolution(input = {}) {
  const roots = [
    input.cwd, input.workspaceRoot, process.env.GROK_WORKSPACE_ROOT, process.cwd(),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..', '..', '..', '..'),
  ]
    .filter(Boolean).map((root) => path.resolve(root));
  for (const root of roots) {
    for (const candidate of [
      path.join(root, '.aexos-core', 'hooks', 'unified', 'runners', 'precompact-runner.js'),
      path.join(root, 'node_modules', '@aexos', 'core', '.aexos-core', 'hooks', 'unified', 'runners', 'precompact-runner.js'),
    ]) if (fs.existsSync(candidate)) return { path: candidate, root };
  }
  return null;
}


function runnerPath(input = {}) {
  return runnerResolution(input)?.path || null;
}

function providerFrom(input = {}) {
  if (input.provider === 'grok' || input.provider === 'claude') return input.provider;
  const isGrok = Boolean(process.env.GROK_WORKSPACE_ROOT)
    || Boolean(input.workspaceRoot)
    || Boolean(input.sessionId && !input.session_id)
    || String(input.hookEventName || '').toLowerCase().includes('compact');
  return isGrok ? 'grok' : 'claude';
}

function buildContext(input, projectRoot) {
  return {
    sessionId: input.session_id ?? input.sessionId,
    projectDir: input.cwd ?? input.workspaceRoot ?? process.env.GROK_WORKSPACE_ROOT ?? projectRoot,
    transcriptPath: input.transcript_path ?? input.transcriptPath,
    trigger: input.trigger || 'auto',
    hookEventName: input.hook_event_name ?? input.hookEventName ?? 'PreCompact',
    permissionMode: input.permission_mode ?? input.permissionMode,
    conversation: input,
    provider: providerFrom(input),
  };
}

function main(input) {
  const resolution = runnerResolution(input);
  if (!resolution) return;
  const context = buildContext(input, resolution.root);
  try {
    const { spawn } = require('child_process');
    const script = `const {onPreCompact}=require(${JSON.stringify(resolution.path)});onPreCompact(JSON.parse(process.env.AEXOS_HOOK_CONTEXT||'{}')).catch(()=>{});`;
    const child = spawn(process.execPath, ['-e', script], {
      detached: true, stdio: 'ignore',
      env: { ...process.env, AEXOS_HOOK_CONTEXT: JSON.stringify(context) },
    });
    child.on('error', () => {});
    child.unref();
  } catch (_) { /* never block compaction */ }
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

module.exports = { runnerPath, providerFrom, buildContext, readStdin, main, run, HOOK_TIMEOUT_MS };
