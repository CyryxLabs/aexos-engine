#!/usr/bin/env node
'use strict';

/** Grok PreToolUse guard. Command strings are inspected as data, never executed. */
const fs = require('fs');
const path = require('path');

const GIT_GLOBAL_OPTION =
  '(?:-[Cc]\\s+\\S+' +
  '|--(?:git-dir|work-tree|namespace|super-prefix|config-env)(?:=\\S+|\\s+\\S+)' +
  '|--exec-path(?:=\\S+)?|-[pP]\\b' +
  '|--(?:no-pager|paginate|bare|literal-pathspecs|glob-pathspecs' +
  '|noglob-pathspecs|icase-pathspecs|no-optional-locks|no-replace-objects' +
  '|no-lazy-fetch|no-advice))';
const GH_OPTION = '(?:-{1,2}[\\w-]+(?:[=\\s]+\\S+)?)';
const REMOTE_OPERATION_PATTERNS = [
  { pattern: new RegExp(`\\bgit(?:\\s+${GIT_GLOBAL_OPTION})*\\s+push\\b`, 'i'), operation: 'git push' },
  ...['create', 'merge', 'close', 'reopen'].map((action) => ({
    pattern: new RegExp(`\\bgh(?:\\s+${GH_OPTION})*\\s+pr(?:\\s+${GH_OPTION})*\\s+${action}\\b`, 'i'),
    operation: `gh pr ${action}`,
  })),
  {
    pattern: new RegExp(`\\bgh(?:\\s+${GH_OPTION})*\\s+release(?:\\s+${GH_OPTION})*\\s+create\\b`, 'i'),
    operation: 'gh release create',
  },
  { pattern: new RegExp(`\\bgit(?:\\s+${GIT_GLOBAL_OPTION})*\\s+tag\\b`, 'i'), operation: 'git tag' },
  {
    pattern: /\bgh\s+api\b(?=[^\n]*\/pulls\b)[^\n]*(?:\s(?:-X|--method)[=\s]*(?:POST|PUT|PATCH)\b|\s(?:-f|-F|--field|--raw-field|--input)(?:[=\s]|$))/i,
    operation: 'gh api (pull request mutation)',
  },
  {
    pattern: new RegExp(
      `\\bgh(?:\\s+${GH_OPTION})*\\s+api(?:\\s+${GH_OPTION})*\\s+graphql\\b` +
        '(?=[\\s\\S]*\\bmutation\\b)(?=[\\s\\S]*\\b(?:createPullRequest|mergePullRequest)\\s*\\()',
      'i',
    ),
    operation: 'gh api graphql (pull request mutation)',
  },
];
const DEVOPS_IDS = new Set(['devops', 'github-devops', 'aexos-devops', 'aiox-devops', 'gage']);
const BRIDGE_TTL_MS = 8 * 60 * 60 * 1000;

function commandFrom(input) {
  if (!input || typeof input !== 'object') return '';
  return String(
    input?.tool_input?.command || input?.toolInput?.command ||
    input?.tool_input?.cmd || input?.toolInput?.cmd ||
    input?.input?.command || input?.parameters?.command ||
    input?.tool_input?.input?.command || input?.toolInput?.input?.command ||
    input?.command || '',
  );
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCommand(command) {
  return String(command || '').replace(/\\\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function rootsFrom(input) {
  const candidates = [
    input?.workspaceRoot, input?.workspace_root, input?.cwd, input?.cwd_path,
    process.env.GROK_WORKSPACE_ROOT, process.env.CLAUDE_PROJECT_DIR, process.cwd(),
  ];
  const candidate = candidates.find((value) => value != null && value !== '');
  if (typeof candidate !== 'string') throw new TypeError('Hook workspace root must be a string');
  return [path.resolve(candidate)];
}

function isBridgeFresh(filePath) {
  try {
    // Date.now() is integer-millisecond precision while Windows can report a
    // fractional mtime. Compare at the same precision so a bridge written in
    // the current millisecond is not mistaken for a future-dated file.
    const ageMs = Date.now() - Math.floor(fs.statSync(filePath).mtimeMs);
    return ageMs >= 0 && ageMs <= BRIDGE_TTL_MS;
  } catch {
    return false;
  }
}

function bridgeAgent(input) {
  const bridges = [
    ['.synapse/sessions/_active-agent.json', true],
    ['.aexos/active-agent.json', true], ['.aexos/active-agent', false],
    ['.aiox/active-agent.json', true], ['.aiox/active-agent', false],
  ];
  for (const root of rootsFrom(input)) {
    for (const [relative, json] of bridges) {
      const filePath = path.join(root, relative);
      if (!isBridgeFresh(filePath)) continue;
      try {
        const text = fs.readFileSync(filePath, 'utf8').trim();
        if (!text) continue;
        if (json) {
          const data = JSON.parse(text);
          const id = data?.id || data?.agentId || data?.agent_id || data?.name;
          if (id) return normalize(id);
        } else {
          const id = text.split(/\s/)[0];
          if (id) return normalize(id).replace(/^@/, '');
        }
      } catch (_) { /* Ignore an invalid bridge and try the next one. */ }
    }
  }
  return '';
}

function commandScopedAgent(command) {
  const match = String(command || '').match(
    /(?:^|\s)(?:export\s+)?(?:AEXOS_ACTIVE_AGENT|AEXOS_AGENT|AIOX_ACTIVE_AGENT|AIOX_AGENT|ACTIVE_AGENT|CLAUDE_AGENT_NAME|GROK_ACTIVE_AGENT)=["']?(@?[a-z0-9-]+)["']?/i,
  );
  return match?.[1] || '';
}

function getActiveAgent(input, command) {
  const candidates = [
    process.env.AEXOS_ACTIVE_AGENT, process.env.AEXOS_AGENT,
    process.env.AIOX_ACTIVE_AGENT, process.env.AIOX_AGENT,
    process.env.ACTIVE_AGENT, process.env.CLAUDE_AGENT_NAME,
    process.env.CLAUDE_CODE_AGENT, process.env.AEXOS_CURRENT_AGENT,
    process.env.AIOX_CURRENT_AGENT, process.env.GROK_ACTIVE_AGENT,
    commandScopedAgent(command), bridgeAgent(input),
  ];
  return normalize(candidates.find(Boolean));
}

function isDevOpsAgent(agent) {
  return DEVOPS_IDS.has(normalize(agent).replace(/^@/, ''));
}

function findRemoteOperation(command) {
  const normalized = normalizeCommand(command);
  return REMOTE_OPERATION_PATTERNS.find(({ pattern }) => pattern.test(normalized)) || null;
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    decision: 'deny', reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason,
    },
  }));
  process.exitCode = 2;
}

function evaluate(input) {
  const command = commandFrom(input);
  const operation = findRemoteOperation(command);
  if (!operation) return;
  const activeAgent = getActiveAgent(input, command);
  if (isDevOpsAgent(activeAgent)) return;
  deny(`${operation.operation} is exclusive to @devops (Constitution Article II). Current agent: ${activeAgent || '@unknown'}. Activate /aexos-devops or set AEXOS_ACTIVE_AGENT=devops.`);
}

function main(input) {
  try {
    return evaluate(input);
  } catch (_) {
    return deny('Remote operation denied because push-authority evaluation failed. Re-run with a valid hook payload and explicit @devops identity.');
  }
}

if (require.main === module) {
  try {
    const rawInput = fs.readFileSync(0, 'utf8');
    if (!rawInput.trim()) deny('Remote operation denied because the push-authority hook received no input.');
    else main(JSON.parse(rawInput));
  } catch (_) {
    deny('Remote operation denied because the push-authority hook received malformed input.');
  }
}

module.exports = {
  DEVOPS_IDS, REMOTE_OPERATION_PATTERNS, bridgeAgent, commandFrom,
  findRemoteOperation, getActiveAgent, isDevOpsAgent, main, normalizeCommand, rootsFrom,
};
