'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const SQUAD = path.join(ROOT, 'squads', 'workflow-engineering');
const EXPECTED = Object.freeze({
  'workflow-chief': 'Conductor',
  'process-discovery-lead': 'Cartographer',
  'workflow-modeling-lead': 'Graph',
  'task-contract-lead': 'Atom',
  'automation-architecture-lead': 'Relay',
  'workflow-qa-lead': 'Gauge',
});

function agentDefinition(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const match = raw.match(/```yaml\n([\s\S]*?)\n```/);
  return { raw, definition: yaml.load(match[1]) };
}

describe('Workflow Engineering squad contract', () => {
  const manifest = yaml.load(fs.readFileSync(path.join(SQUAD, 'squad.yaml'), 'utf8'));

  it('is a paid-library squad with exactly the six canonical agents', () => {
    expect(manifest.squad).toMatchObject({
      name: 'workflow-engineering', entry_agent: 'workflow-chief',
    });
    expect(manifest.settings).toMatchObject({
      distribution: 'paid-library', execution_allowed: false, contract_version: 1,
    });
    expect(Object.keys(manifest.agents).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(manifest.components.agents).toHaveLength(6);
  });

  it.each(Object.entries(EXPECTED))('%s is bounded and grounded', (id, persona) => {
    const { raw, definition } = agentDefinition(path.join(SQUAD, 'agents', `${id}.md`));
    expect(definition.agent).toMatchObject({ id, name: persona });
    expect(definition.agent.based_on).toBeTruthy();
    expect(raw).toMatch(/only|never|does not|remain|outside/i);
  });

  it('sequences discovery through independent QA', () => {
    const workflow = yaml.load(fs.readFileSync(
      path.join(SQUAD, 'workflows', 'wf-engineer-process.yaml'), 'utf8',
    )).workflow;
    expect(workflow.execution_allowed).toBe(false);
    expect(workflow.sequence.map((phase) => phase.id)).toEqual([
      'discovery', 'topology', 'contracts', 'automation', 'qa',
    ]);
    expect(workflow.sequence.at(-1).owner).toBe('workflow-qa-lead');
  });

  it('declares every task-first component on disk', () => {
    for (const [folder, files] of Object.entries(manifest.components)) {
      if (!Array.isArray(files)) continue;
      for (const file of files) expect(fs.existsSync(path.join(SQUAD, folder, file))).toBe(true);
    }
  });
});
