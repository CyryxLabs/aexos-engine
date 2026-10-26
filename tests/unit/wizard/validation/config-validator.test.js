// Fully mocked configuration validation runs in the default unit suite.
/**
 * Unit Tests: Config Validator
 * Story 1.8 - Task 1.8.2 (QA Fix - Coverage Improvement)
 */

const fs = require('fs');
const yaml = require('js-yaml');
const { validateConfigs } = require('../../../../packages/installer/src/wizard/validation/validators/config-validator');

// Mock dependencies
jest.mock('fs');
jest.mock('js-yaml');

describe('Config Validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateConfigs', () => {
    it('should validate .env file successfully', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\nAPP_NAME=CYRYX\nAPI_KEY=test123\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n.env.local\n*.key\n*.pem\n.aexos/install-log.txt\n';
        }
        if (path === '.mcp.json') {
          return '{"mcpServers":{}}';
        }
        if (path === '.aexos-core/core-config.yaml') {
          return 'markdownExploder:\n  enabled: true\nqa: {}\nprd: {}\narchitecture: {}\n';
        }
        if (path === '.mcp.json') {
          return JSON.stringify({ mcpServers: {} });
        }
        return '';
      });

      yaml.load.mockReturnValue({
        markdownExploder: {},
        qa: {},
        prd: {},
        architecture: {},
      });

      // When
      const result = await validateConfigs({
        coreConfig: '.aexos-core/core-config.yaml',
      });

      // Then
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.checks.find(c => c.component === 'MCP Config')).toMatchObject({
        status: 'success',
        message: expect.stringContaining('0 MCPs'),
      });
      const envCheck = result.checks.find(c => c.component === 'Environment Config');
      expect(envCheck).toBeDefined();
      expect(envCheck.status).toBe('success');
    });

    it('should detect missing .env file', async () => {
      // Given
      fs.existsSync.mockImplementation((path) => path !== '.env');

      // When
      const result = await validateConfigs({});

      // Then
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'ENV_FILE_MISSING',
          }),
        ]),
      );
    });

    it('should detect missing required env variables', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return '# Empty env file\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({});

      // When
      const result = await validateConfigs({});

      // Then
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'ENV_VAR_MISSING',
          }),
        ]),
      );
    });

    it('should detect potential hardcoded credentials', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'PASSWORD=hardcoded123\nAPI_KEY=abc123def456\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({});

      // When
      const result = await validateConfigs({});

      // Then
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'POTENTIAL_HARDCODED_CREDENTIAL',
          }),
        ]),
      );
    });

    it('should validate core-config.yaml YAML syntax', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.aexos-core/core-config.yaml') {
          return 'markdownExploder:\n  enabled: true\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({
        markdownExploder: { enabled: true },
        qa: {},
        prd: {},
        architecture: {},
      });

      // When
      const result = await validateConfigs({
        coreConfig: '.aexos-core/core-config.yaml',
      });

      // Then
      const coreCheck = result.checks.find(c => c.component === 'Core Config');
      expect(coreCheck).toBeDefined();
      expect(coreCheck.status).toBe('success');
      expect(coreCheck.message).toContain('Valid YAML');
    });

    it('should detect missing core-config.yaml', async () => {
      // Given
      fs.existsSync.mockImplementation((path) => {
        return path !== '.aexos-core/core-config.yaml';
      });

      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      // When
      const result = await validateConfigs({
        coreConfig: '.aexos-core/core-config.yaml',
      });

      // Then
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'CORE_CONFIG_MISSING',
          }),
        ]),
      );
    });

    it('should detect invalid YAML syntax', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.aexos-core/core-config.yaml') {
          return 'invalid: yaml: syntax::\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      yaml.load.mockImplementation(() => {
        throw new Error('Invalid YAML syntax');
      });

      // When
      const result = await validateConfigs({
        coreConfig: '.aexos-core/core-config.yaml',
      });

      // Then
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'CORE_CONFIG_PARSE_ERROR',
          }),
        ]),
      );
    });

    it('should validate required keys in core-config', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.aexos-core/core-config.yaml') {
          return 'markdownExploder:\n  enabled: true\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({
        markdownExploder: { enabled: true },
        // Missing: qa, prd, architecture
      });

      // When
      const result = await validateConfigs({
        coreConfig: '.aexos-core/core-config.yaml',
      });

      // Then
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'CORE_CONFIG_INCOMPLETE',
          }),
        ]),
      );
    });

    it('should validate .mcp.json schema', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.mcp.json') {
          return JSON.stringify({
            mcpServers: {
              browser: { command: 'npx' },
              context7: { url: 'https://mcp.context7.com/sse' },
            },
          });
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({});

      // When
      const result = await validateConfigs({});

      // Then
      const mcpCheck = result.checks.find(c => c.component === 'MCP Config');
      expect(mcpCheck).toBeDefined();
      expect(mcpCheck.status).toBe('success');
      expect(mcpCheck.message).toContain('2 MCPs');
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it.each([
      ['missing mcpServers', {}],
      ['scalar mcpServers', { mcpServers: 'invalid' }],
    ])('rejects %s without reporting configuration success', async (_label, mcpConfig) => {
      const files = {
        '.env': 'NODE_ENV=development\n',
        '.aexos-core/core-config.yaml': 'qa: {}\nprd: {}\narchitecture: {}\n',
        '.gitignore': '.env\nnode_modules\n.env.local\n*.key\n*.pem\n.aexos/install-log.txt\n',
        '.mcp.json': JSON.stringify(mcpConfig),
      };
      fs.existsSync.mockImplementation(file => Object.hasOwn(files, file));
      fs.readFileSync.mockImplementation(file => {
        if (!Object.hasOwn(files, file)) throw new Error('Unexpected fixture read');
        return files[file];
      });
      yaml.load.mockReturnValue({ markdownExploder: {}, qa: {}, prd: {}, architecture: {} });

      const result = await validateConfigs({ coreConfig: '.aexos-core/core-config.yaml' });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual([{
        severity: 'medium',
        message: '.mcp.json missing mcpServers key',
        file: '.mcp.json',
        code: 'MCP_CONFIG_INVALID_SCHEMA',
      }]);
      expect(result.warnings).toEqual([]);
      expect(result.checks).not.toContainEqual(expect.objectContaining({
        component: 'MCP Config', status: 'success',
      }));
    });

    it('should handle missing .mcp.json (optional)', async () => {
      // Given
      fs.existsSync.mockImplementation((path) => path !== '.mcp.json');
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({});

      // When
      const result = await validateConfigs({});

      // Then
      const mcpCheck = result.checks.find(c => c.component === 'MCP Config');
      expect(mcpCheck).toBeDefined();
      expect(mcpCheck.status).toBe('skipped');
      expect(mcpCheck.message).toContain('optional');
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid JSON in .mcp.json', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.mcp.json') {
          return '{invalid json}';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({});

      // When
      const result = await validateConfigs({});

      // Then
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'MCP_CONFIG_PARSE_ERROR',
          }),
        ]),
      );
    });

    it('should validate .gitignore entries', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n.env.local\n*.key\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({});

      // When
      const result = await validateConfigs({});

      // Then
      const gitCheck = result.checks.find(c => c.component === 'Git Ignore');
      expect(gitCheck).toBeDefined();
      expect(gitCheck.status).toBe('success');
    });

    it('should detect missing critical .gitignore entries (.env, node_modules)', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.gitignore') {
          return '# Empty gitignore\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({});

      // When
      const result = await validateConfigs({});

      // Then
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'GITIGNORE_CRITICAL_MISSING',
            message: expect.stringContaining('.env'),
          }),
          expect.objectContaining({
            code: 'GITIGNORE_CRITICAL_MISSING',
            message: expect.stringContaining('node_modules'),
          }),
        ]),
      );
    });

    it('should warn about missing recommended .gitignore entries', async () => {
      // Given
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path === '.env') {
          return 'NODE_ENV=development\n';
        }
        if (path === '.gitignore') {
          return '.env\nnode_modules\n';
        }
        return '';
      });

      yaml.load.mockReturnValue({});

      // When
      const result = await validateConfigs({});

      // Then
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'GITIGNORE_RECOMMENDED_MISSING',
          }),
        ]),
      );
    });
  });
});
