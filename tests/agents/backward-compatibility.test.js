'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { parseAgentFile, parseAllAgents } = require('../../.aexos-core/infrastructure/scripts/ide-sync/agent-parser');

const agentsPath = path.resolve(__dirname, '../../.aexos-core/development/agents');
const agentFiles = fs.readdirSync(agentsPath).filter(file => file.endsWith('.md'));

describe('Agent compatibility with optional tools metadata', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-legacy-agent-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test.each(agentFiles)('loads the current %s through the production parser', file => {
    const parsed = parseAgentFile(path.join(agentsPath, file));
    expect(parsed.error).toBeNull();
    expect(parsed.agent.id).toBe(path.basename(file, '.md'));
    expect(parsed.agent.name).toBeTruthy();
    expect(parsed.agent.title).toBeTruthy();
    expect(parsed.yaml.persona || parsed.yaml.core_principles).toBeDefined();
    expect(parsed.dependencies).toBeDefined();
    // UX groups commands by mode; other agents use an ordered command array.
    expect(Object.keys(parsed.commands).length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.yaml['activation-instructions'])).toBe(true);
    if (parsed.dependencies.tools !== undefined) expect(Array.isArray(parsed.dependencies.tools)).toBe(true);
    expect(parsed.dependencies.tools).not.toBeNull();
  });

  test.each(agentFiles)('preserves commands, activation and dependencies for legacy %s without tools', file => {
    const original = parseAgentFile(path.join(agentsPath, file));
    const legacy = structuredClone(original.yaml);
    delete legacy.dependencies.tools;
    const fixture = path.join(root, file);
    fs.writeFileSync(fixture, '# Legacy compatibility fixture\n\n```yaml\n' + yaml.dump(legacy) + '```\n');
    const parsed = parseAgentFile(fixture);
    expect(parsed.error).toBeNull();
    expect(parsed.agent).toEqual(original.agent);
    expect(parsed.dependencies.tools).toBeUndefined();
    expect(parsed.dependencies).toEqual(legacy.dependencies);
    expect(parsed.commands).toEqual(original.commands);
    expect(parsed.yaml['activation-instructions']).toEqual(original.yaml['activation-instructions']);
  });

  test('discovers the entire mixed catalog without silently dropping agents', () => {
    const catalog = parseAllAgents(agentsPath);
    expect(catalog.map(agent => agent.filename).sort()).toEqual([...agentFiles].sort());
    expect(catalog.every(agent => !agent.error)).toBe(true);
  });
});
