'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..', '..');
const squadRoot = path.join(root, 'squads', 'security');

describe('Core Security squad contract', () => {
  const expected = {
    'security-chief': 'Aegis',
    'threat-model-lead': 'Stride',
    'appsec-lead': 'Bastion',
    'offensive-lead': 'Rook',
    'platform-lead': 'Provenance',
    'ai-security-lead': 'Harness',
  };

  it('ships exactly the six approved canonical agents in its manifest', () => {
    const manifest = yaml.load(fs.readFileSync(path.join(squadRoot, 'squad.yaml'), 'utf8'));
    expect(manifest.components.agents.sort()).toEqual(
      Object.keys(expected).map((id) => `${id}.md`).sort(),
    );
    expect(manifest.settings.implementation_allowed).toBe(false);
    expect(manifest.cyryx.minVersion).toBe('6.0.0');
  });

  it.each(Object.entries(expected))('%s uses persona %s and preserves assessment-only boundary', (id, name) => {
    const content = fs.readFileSync(path.join(squadRoot, 'agents', `${id}.md`), 'utf8');
    const block = content.match(/```yaml\n([\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    const definition = yaml.load(block[1]);
    expect(definition.agent).toMatchObject({ id, name });
    expect(definition.persona.boundary.toLowerCase()).toMatch(/assessment|no unauthorized/);
    expect(content.toLowerCase()).toMatch(/never|no implementation|assessment only/);
  });

  it('ships every declared task-first component on disk', () => {
    const manifest = yaml.load(fs.readFileSync(path.join(squadRoot, 'squad.yaml'), 'utf8'));
    for (const [kind, files] of Object.entries(manifest.components)) {
      if (!Array.isArray(files)) continue;
      const dir = kind === 'tools' ? 'tools' : kind;
      for (const file of files) {
        expect(fs.existsSync(path.join(squadRoot, dir, file))).toBe(true);
      }
    }
  });
});
