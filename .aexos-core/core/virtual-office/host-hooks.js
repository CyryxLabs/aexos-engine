'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeEvent } = require('./event-normalizer');
const { submitEvent } = require('./host-bridge');

const HOOK_EVENTS = {
  grok: { SessionStart: 'SessionStart', SessionEnd: 'SessionEnd', UserPromptSubmit: 'CommandStart',
    PreToolUse: 'PreToolUse', PostToolUse: 'PostToolUse', PostToolUseFailure: 'CommandError',
    Stop: 'AgentWaiting', StopFailure: 'CommandError', StopCancelled: 'AgentWaiting' },
  'claude-code': { SessionStart: 'SessionStart', SessionEnd: 'SessionEnd',
    UserPromptSubmit: 'CommandStart', PreToolUse: 'PreToolUse', PostToolUse: 'PostToolUse',
    PostToolUseFailure: 'CommandError', Stop: 'AgentWaiting' },
  gemini: { SessionStart: 'SessionStart', SessionEnd: 'SessionEnd', BeforeAgent: 'CommandStart',
    BeforeTool: 'PreToolUse', AfterTool: 'PostToolUse', AfterAgent: 'AgentWaiting' },
};

function normalizeHook(host, payload, root) {
  if (!HOOK_EVENTS[host]) throw new Error('Native hooks are supported only for claude-code, gemini and grok');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid hook payload');
  if (host === 'grok') {
    const names = Object.keys(HOOK_EVENTS.grok);
    const event = payload.hook_event_name || names.find((name) => name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() === payload.hookEventName);
    payload = { hook_event_name: event, session_id: payload.sessionId, cwd: payload.cwd,
      timestamp: payload.timestamp, tool_name: payload.toolName, promptId: payload.promptId };
  }
  const type = HOOK_EVENTS[host][payload.hook_event_name];
  if (!type) throw new Error('Unsupported native hook event');
  if (typeof payload.session_id !== 'string' || !payload.session_id.trim()) throw new Error('Hook session identity required');
  const resolvedRoot = fs.realpathSync(root);
  if (typeof payload.cwd !== 'string') throw new Error('Hook working directory required');
  const cwd = fs.realpathSync(payload.cwd);
  if (cwd !== resolvedRoot && !cwd.startsWith(resolvedRoot + path.sep)) throw new Error('Hook belongs to another project');
  return normalizeEvent({
    type: host === 'gemini' && payload.hook_event_name === 'AfterTool' && payload.tool_response?.error
      ? 'CommandError' : type,
    host, evidence: 'runtime', sessionId: payload.session_id,
    timestamp: typeof payload.timestamp === 'string' ? Date.parse(payload.timestamp) : payload.timestamp,
    // Explicit AEXOS environment binding only; native agent UUIDs are not catalog identities.
    agentId: process.env.AEXOS_AGENT_ID, runId: process.env.AEXOS_RUN_ID || (host === 'grok' ? payload.promptId : undefined),
    storyId: process.env.AEXOS_STORY_ID, toolName: payload.tool_name,
  });
}

function readHookInput(stream, maximum = 1048576) {
  return new Promise((resolve, reject) => {
    let input = '';
    let size = 0;
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maximum) { reject(new Error('Hook input exceeds limit')); stream.resume(); return; }
      input += chunk;
    });
    stream.on('end', () => {
      try { resolve(JSON.parse(input)); } catch (_error) { reject(new Error('Invalid hook JSON')); }
    });
    stream.on('error', reject);
  });
}

async function observeHook(root, host, options = {}) {
  try {
    const payload = await readHookInput(options.input || process.stdin);
    return await submitEvent(root, normalizeHook(host, payload, root), { queue: true, timeoutMs: 500, url: options.url });
  } catch (_error) {
    // Observation never changes provider decisions or exposes raw inputs in diagnostics.
    return { observed: false };
  }
}

function hookConfiguration(root, host) {
  if (!HOOK_EVENTS[host]) throw new Error('Native hooks are supported only for claude-code, gemini and grok');
  fs.realpathSync(root);
  // Host commands run from the project directory, matching existing governance hooks.
  // No absolute path or shell-specific environment expansion is embedded in settings.
  const command = `node .aexos-core/core/virtual-office/cli.js hook --project-root . --producer-host ${host}`;
  const hooks = Object.fromEntries(Object.keys(HOOK_EVENTS[host]).map((event) => [event, [{
    hooks: [{ type: 'command', command, timeout: host === 'gemini' ? 2000 : 2 }],
  }]]));
  return { hooks };
}

function installHooks(root, host) {
  const generated = hookConfiguration(root, host);
  const directory = path.join(fs.realpathSync(root), host === 'grok' ? '.grok/hooks' : host === 'claude-code' ? '.claude' : '.gemini');
  const file = path.join(directory, host === 'grok' ? 'aexos-office.json' : 'settings.json');
  let candidate = file;
  while (candidate !== path.dirname(candidate)) {
    try {
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || (candidate === file && (!stat.isFile() || stat.nlink > 1))) throw new Error('Linked hook configuration is not supported');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    candidate = path.dirname(candidate);
  }
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const config = original ? JSON.parse(original) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid host settings');
  if (config.hooks && (typeof config.hooks !== 'object' || Array.isArray(config.hooks))) throw new Error('Invalid hooks configuration');
  config.hooks ||= {};
  for (const [event, entries] of Object.entries(generated.hooks)) {
    if (config.hooks[event] && !Array.isArray(config.hooks[event])) throw new Error('Invalid hook event configuration');
    const existing = (config.hooks[event] || []).map((group) => ({
      ...group,
      hooks: group.hooks?.map((hook) => {
        const oldCommand = String(hook.command || '').replace(/\\/g, '/');
        const owned = oldCommand.includes('/virtual-office/cli.js') &&
          oldCommand.includes(' hook --project-root ') && oldCommand.endsWith(`--producer-host ${host}`);
        return owned ? { ...hook, command: entries[0].hooks[0].command } : hook;
      }),
    }));
    const command = entries[0].hooks[0].command;
    if (!existing.some((group) => group.hooks?.some((hook) => hook.command === command))) existing.push(...entries);
    config.hooks[event] = existing;
  }
  const content = JSON.stringify(config, null, 2) + '\n';
  if (original === content) return { installed: true, changed: false, file, nativeVerified: false };
  fs.mkdirSync(directory, { recursive: true });
  const backup = original === null ? null : `${file}.office-backup-${Date.now()}`;
  if (backup) fs.writeFileSync(backup, original, { flag: 'wx' });
  fs.writeFileSync(file, content);
  return { installed: true, changed: true, file, backup, nativeVerified: false };
}

module.exports = { HOOK_EVENTS, hookConfiguration, installHooks, normalizeHook, observeHook, readHookInput };
