'use strict';

// These are source correspondences, never behavioral acceptance. Exact aliases
// preserve the original upstream obligation and every incoming graph edge.
const RELOCATIONS = Object.freeze({
  '.aiox-core/development/tasks/squad-creator-sync-synkra.md': '.aexos-core/development/tasks/squad-creator-sync-aexos.md',
  '.claude/agent-memory/aiox-architect/MEMORY.md': '.aexos-core/development/agents/architect/MEMORY.md',
  '.claude/agent-memory/aiox-dev/MEMORY.md': '.aexos-core/development/agents/dev/MEMORY.md',
  '.claude/agent-memory/aiox-po/MEMORY.md': '.aexos-core/development/agents/po/MEMORY.md',
  '.claude/agent-memory/aiox-qa/MEMORY.md': '.aexos-core/development/agents/qa/MEMORY.md',
  'README.en.md': 'README.md',
  'docs/guides/agents/traces/00-shared-activation-pipeline.v1-act8.md': 'docs/guides/agents/traces/00-shared-activation-pipeline.md',
  'squads/claude-code-mastery/config.yaml': 'squads/claude-code-mastery/squad.yaml',
});

const GENERATED = Object.freeze({
  '.claude/settings.local.json': {
    producer: 'packages/installer/src/wizard/ide-config-generator.js',
    entrypoint: 'createClaudeSettingsLocal',
    output: '.claude/settings.local.json',
    contract: 'Generate missing local permissions and merge without replacing existing consumer choices.',
  },
  '.synapse/sessions/.gitkeep': {
    producer: '.aexos-core/core/synapse/session/session-manager.js',
    entrypoint: 'createSession',
    output: '.synapse/sessions/',
    contract: 'Create a writable session directory on first use; never distribute session contents.',
  },
  '.synapse/cache/.gitkeep': {
    producer: '.aexos-core/core/synapse/layers/l5-squad.js',
    entrypoint: '_writeCache',
    output: '.synapse/cache/',
    contract: 'Create the cache directory when squad manifests are first cached; never distribute user cache data.',
  },
});

function namespace(value) {
  return value.replace(/aiox/g, 'aexos').replace(/AIOX/g, 'AEXOS');
}

function mapPath(value) {
  const hash = value.indexOf('#');
  const file = hash < 0 ? value : value.slice(0, hash);
  const fragment = hash < 0 ? '' : value.slice(hash);
  return (RELOCATIONS[file] || namespace(file)) + namespace(fragment);
}

function pathContract(file) {
  if (GENERATED[file]) {
    const generated = GENERATED[file];
    return { kind: 'generated', paths: [generated.producer],
      entrypoints: [`${generated.producer}#${generated.entrypoint}`],
      outputs: [generated.output], contract: generated.contract };
  }
  return { kind: RELOCATIONS[file] ? 'relocated' : 'namespace', paths: [mapPath(file)],
    entrypoints: [mapPath(file)], outputs: [] };
}

module.exports = { RELOCATIONS, GENERATED, namespace, mapPath, pathContract };
