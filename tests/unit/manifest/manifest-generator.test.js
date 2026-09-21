/**
 * Manifest Generator Tests
 *
 * Unit tests for the manifest generation functionality.
 *
 * @module tests/unit/manifest/manifest-generator.test
 * @version 1.0.0
 * @story 2.13 - Manifest System
 */

const fs = require('fs').promises;
const { createManifestProject } = require('../../helpers/isolated-manifest-project');
const {
  ManifestGenerator,
  createManifestGenerator,
  escapeCSV,
  parseYAMLFromMarkdown,
} = require('../../../.aexos-core/core/manifest/manifest-generator');
const { parseCSV } = require('../../../.aexos-core/core/manifest/manifest-validator');

describe('ManifestGenerator', () => {
  let basePath;
  beforeAll(async () => { basePath = await createManifestProject(); }, 30000);
  afterAll(async () => { if (basePath) await fs.rm(basePath, { recursive: true, force: true }); });

  describe('escapeCSV', () => {
    test('returns empty string for null/undefined', () => {
      expect(escapeCSV(null)).toBe('');
      expect(escapeCSV(undefined)).toBe('');
    });

    test('returns string as-is when no special characters', () => {
      expect(escapeCSV('hello')).toBe('hello');
      expect(escapeCSV('test value')).toBe('test value');
    });

    test('wraps and escapes values with commas', () => {
      expect(escapeCSV('hello,world')).toBe('"hello,world"');
    });

    test('wraps and escapes values with quotes', () => {
      expect(escapeCSV('say "hello"')).toBe('"say ""hello"""');
    });

    test('wraps and escapes values with newlines', () => {
      expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"');
    });

    test('handles combined special characters', () => {
      expect(escapeCSV('hello, "world"\n!')).toBe('"hello, ""world""\n!"');
    });
  });

  describe('parseYAMLFromMarkdown', () => {
    test('extracts YAML from code blocks', () => {
      const content = `# Header

\`\`\`yaml
agent:
  name: Test
  id: test-id
\`\`\`

Some content`;

      const result = parseYAMLFromMarkdown(content);
      expect(result).toBeDefined();
      expect(result.agent).toBeDefined();
      expect(result.agent.name).toBe('Test');
      expect(result.agent.id).toBe('test-id');
    });

    test('extracts YAML from front matter', () => {
      const content = `---
agent:
  name: FrontMatter
  id: fm-id
---

# Header

Content here`;

      const result = parseYAMLFromMarkdown(content);
      expect(result).toBeDefined();
      expect(result.agent.name).toBe('FrontMatter');
    });

    test('returns null for content without YAML', () => {
      const content = '# Just a header\n\nSome text';
      const result = parseYAMLFromMarkdown(content);
      expect(result).toBeNull();
    });

    test('returns null for invalid YAML', () => {
      const content = `\`\`\`yaml
this is: not: valid: yaml: [
\`\`\``;
      const result = parseYAMLFromMarkdown(content);
      expect(result).toBeNull();
    });
  });

  describe('createManifestGenerator', () => {
    test('creates generator with default options', () => {
      const generator = createManifestGenerator();
      expect(generator).toBeInstanceOf(ManifestGenerator);
    });

    test('creates generator with custom basePath', () => {
      const generator = createManifestGenerator({ basePath: '/custom/path' });
      expect(generator.basePath).toBe('/custom/path');
    });
  });

  describe('ManifestGenerator', () => {
    let generator;

    beforeEach(() => {
      generator = new ManifestGenerator({ basePath });
    });

    describe('generateAgentsManifest', () => {
      test('generates agents.csv with correct structure', async () => {
        const result = await generator.generateAgentsManifest();

        expect(result.success).toBe(true);
        expect(result.count).toBeGreaterThanOrEqual(11); // At least 11 agents
        expect(result.path).toContain('agents.csv');

        // Verify file was created
        const content = await fs.readFile(result.path, 'utf8');
        const lines = content.split('\n');

        // Check header
        expect(lines[0]).toBe('id,name,archetype,icon,version,status,file_path,when_to_use');

        // Check we have data rows
        expect(lines.length).toBeGreaterThan(1);
      });
    });

    describe('generateWorkersManifest', () => {
      test('generates workers.csv from service registry', async () => {
        const result = await generator.generateWorkersManifest();

        expect(result.success).toBe(true);
        expect(result.count).toBeGreaterThanOrEqual(200); // 200+ workers per story
        expect(result.path).toContain('workers.csv');

        // Verify file structure
        const content = await fs.readFile(result.path, 'utf8');
        const lines = content.split('\n');

        expect(lines[0]).toBe('id,name,category,subcategory,executor_types,tags,file_path,status');
        expect(lines.length).toBeGreaterThan(200);
        const parsed = parseCSV(content);
        const ids = parsed.rows.map((row) => row.id);
        expect(new Set(ids).size).toBe(ids.length);
        const qualifiedIndexWorkers = parsed.rows.filter((row) => row.file_path.endsWith('/index.js'));
        expect(qualifiedIndexWorkers.length).toBeGreaterThanOrEqual(4);
        expect(qualifiedIndexWorkers.every((row) => row.id.startsWith('index-infrastructure-')))
          .toBe(true);
        expect(qualifiedIndexWorkers.map((row) => row.file_path)).toEqual(expect.arrayContaining([
          '.aexos-core/infrastructure/scripts/documentation-integrity/index.js',
          '.aexos-core/infrastructure/scripts/grok-skills-sync/index.js',
          '.aexos-core/infrastructure/scripts/codex-skills-sync/index.js',
          '.aexos-core/infrastructure/scripts/llm-routing/usage-tracker/index.js',
        ]));
      });

      test('rejects an ambiguous custom service registry instead of inventing manifest IDs', async () => {
        const registryPath = `${basePath}/.aexos-core/core/registry/service-registry.json`;
        const original = await fs.readFile(registryPath, 'utf8');
        const duplicateRegistry = {
          workers: [
            { id: 'duplicate', name: 'First', category: 'script', path: '.aexos-core/a.js' },
            { id: 'duplicate', name: 'Second', category: 'script', path: '.aexos-core/b.js' },
          ],
        };
        try {
          await fs.writeFile(registryPath, JSON.stringify(duplicateRegistry));
          const result = await generator.generateWorkersManifest();
          expect(result.success).toBe(false);
          expect(result.errors).toEqual([
            'Service registry contains ambiguous worker IDs: duplicate',
          ]);
        } finally {
          await fs.writeFile(registryPath, original);
        }
      });
    });

    describe('generateTasksManifest', () => {
      test('generates tasks.csv with correct structure', async () => {
        const result = await generator.generateTasksManifest();

        expect(result.success).toBe(true);
        expect(result.count).toBeGreaterThanOrEqual(40); // 40+ tasks per story
        expect(result.path).toContain('tasks.csv');

        // Verify file structure
        const content = await fs.readFile(result.path, 'utf8');
        const lines = content.split('\n');

        expect(lines[0]).toBe('id,name,category,format,has_elicitation,file_path,status');
        expect(lines.length).toBeGreaterThan(40);
      });
    });

    describe('generateAll', () => {
      test('generates all manifests successfully', async () => {
        const results = await generator.generateAll();

        expect(results.agents.success).toBe(true);
        expect(results.workers.success).toBe(true);
        expect(results.tasks.success).toBe(true);
        expect(results.errors).toHaveLength(0);
        expect(results.duration).toBeDefined();
        expect(results.duration).toBeLessThan(5000); // Should complete in < 5s
      });
    });
  });
});
