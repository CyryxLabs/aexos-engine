/**
 * Guards the proprietary AEXOS squad library, its ownership metadata, and its
 * routing projections across the framework surfaces that activate squads.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const SQUADS_ROOT = path.join(ROOT, 'squads');
const REGISTRY = path.join(ROOT, '.aexos-core', 'data', 'squad-registry.yaml');

const LIBRARY = {
  apex: 'apex-lead',
  brand: 'brand-chief',
  curator: 'curator-chief',
  'deep-research': 'dr-orchestrator',
  dispatch: 'dispatch-chief',
  education: 'education-chief',
  kaizen: 'kaizen-chief',
  'kaizen-v2': 'kaizen-v2-chief',
  'legal-analyst': 'legal-chief',
  seo: 'seo-chief',
  'squad-creator': 'squad-chief',
};

const EXTERNAL_OWNERSHIP_METADATA =
  /^\s*(?:source_repository|origin_repository|origin_commit|contributors?|previous_owners?)\s*:/im;

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

describe('proprietary AEXOS squad library', () => {
  test.each(Object.entries(LIBRARY))('%s is a native Cyryx-owned AEXOS squad', (squad, chief) => {
    const dir = path.join(SQUADS_ROOT, squad);
    const manifestPath = path.join(dir, 'squad.yaml');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.name).toBe(squad);
    expect(manifest.author).toBe('Cyryx Labs LLC');
    expect(manifest.license).toBe('UNLICENSED');
    expect(manifest.entry_agent).toBe(chief);
    expect(fs.existsSync(path.join(dir, 'agents', `${chief}.md`))).toBe(true);
  });

  test('all library squads are registered for AEXOS orchestration', () => {
    const registry = yaml.load(fs.readFileSync(REGISTRY, 'utf8'));
    const registered = new Map(registry.squads.map((squad) => [squad.name, squad.entry_agent]));
    for (const [squad, chief] of Object.entries(LIBRARY)) {
      expect(registered.get(squad)).toBe(chief);
    }
  });

  test('every entry chief is projected to Claude and Codex', () => {
    const codexSkillsRoot = path.join(ROOT, '.codex', 'skills');
    const codexSkillFiles = fs
      .readdirSync(codexSkillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(codexSkillsRoot, entry.name, 'SKILL.md'))
      .filter(fs.existsSync)
      .map((file) => fs.readFileSync(file, 'utf8'));

    for (const [squad, chief] of Object.entries(LIBRARY)) {
      const claudeSkill = path.join(
        ROOT,
        '.claude',
        'skills',
        'AEXOS',
        'squads',
        squad,
        chief,
        'SKILL.md',
      );
      expect(fs.existsSync(claudeSkill)).toBe(true);
      expect(codexSkillFiles.some((content) => content.includes(`squads/${squad}/agents/${chief}.md`))).toBe(
        true,
      );
    }
  });

  test('contains no prior license, ownership, repository, or infrastructure identity', () => {
    const offenders = [];
    for (const squad of Object.keys(LIBRARY)) {
      for (const file of walk(path.join(SQUADS_ROOT, squad))) {
        const name = path.basename(file);
        if (/^(?:LICEN[SC]E|NOTICE|AUTHORS|CONTRIBUTORS|COPYING)(?:\.|$)/i.test(name)) {
          offenders.push(path.relative(ROOT, file));
          continue;
        }
        const buffer = fs.readFileSync(file);
        if (!buffer.includes(0) && EXTERNAL_OWNERSHIP_METADATA.test(buffer.toString('utf8'))) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, 'scripts', 'import-community-squads.js'))).toBe(false);
  });

  test('root license makes the complete squad library proprietary to Cyryx Labs LLC', () => {
    const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
    expect(license).toContain('AEXOS PROPRIETARY LICENSE');
    expect(license).toContain('Cyryx Labs LLC');
    expect(license).toMatch(/All AEXOS squads[\s\S]*integral parts\s+of the\s+Software/i);
  });

  test('Kaizen V2 agent identifiers are collision-safe', () => {
    const agents = fs
      .readdirSync(path.join(SQUADS_ROOT, 'kaizen-v2', 'agents'))
      .filter((file) => file.endsWith('.md'));
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((file) => file.startsWith('kaizen-v2-'))).toBe(true);
  });

  test('does not expose a non-executable placeholder as a squad', () => {
    expect(fs.existsSync(path.join(SQUADS_ROOT, 'squad-creator-pro'))).toBe(false);
  });
});
