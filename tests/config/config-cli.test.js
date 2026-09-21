/**
 * CLI tests for `aexos config` subcommands
 * Story PRO-4 — Config Hierarchy (Task 5.3)
 *
 * Tests the Commander.js config command in-process using Jest mocks
 * for process.cwd, console.log/error, and process.exit.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');
const { Command } = require('commander');
const { createConfigCommand } = require('../../.aexos-core/cli/commands/config');
const { globalConfigCache } = require('../../.aexos-core/core/config/config-cache');
const configResolver = require('../../.aexos-core/core/config/config-resolver');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

/**
 * Create a temp project with config fixtures.
 */
function createTempProject(files = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-cli-test-'));
  const cyryxCoreDir = path.join(tmpDir, '.aexos-core');
  fs.mkdirSync(cyryxCoreDir, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    if (typeof content === 'string') {
      fs.writeFileSync(fullPath, content, 'utf8');
    } else {
      const fixturePath = path.join(FIXTURES_DIR, content.fixture);
      fs.copyFileSync(fixturePath, fullPath);
    }
  }

  return tmpDir;
}

function cleanupTempDir(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

/**
 * Sentinel error thrown by mocked process.exit to halt execution
 * without actually exiting the test runner.
 */
class ProcessExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.exitCode = code;
  }
}

describe('config CLI commands', () => {
  let logOutput, errorOutput;
  let logSpy, errorSpy, exitSpy, cwdSpy;

  beforeEach(() => {
    globalConfigCache.clear();
    logOutput = [];
    errorOutput = [];

    logSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      logOutput.push(args.join(' '));
    });
    errorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      errorOutput.push(args.join(' '));
    });
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ProcessExitError(code);
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    if (cwdSpy) {
      cwdSpy.mockRestore();
      cwdSpy = null;
    }
  });

  /**
   * Run `aexos config <subArgs>` in-process via Commander.
   * Returns captured stdout/stderr as strings and whether process.exit was called.
   */
  async function runConfigCmd(subArgs) {
    const program = new Command();
    program.exitOverride(); // Prevent Commander itself from calling process.exit
    program.addCommand(createConfigCommand());

    let exitCode = 0;
    try {
      await program.parseAsync(['node', 'cyryx', ...subArgs]);
    } catch (err) {
      if (err instanceof ProcessExitError) {
        exitCode = err.exitCode;
      } else if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
        // Commander exit override throws for --help / --version
        exitCode = 0;
      } else {
        exitCode = 1;
      }
    }

    return {
      exitCode,
      stdout: logOutput.join('\n'),
      stderr: errorOutput.join('\n'),
    };
  }

  function setCwd(dir) {
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(dir);
  }

  // -----------------------------------------------------------------------
  // aexos config show
  // -----------------------------------------------------------------------

  describe('aexos config show', () => {
    test('shows resolved config as YAML', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/framework-config.yaml': { fixture: 'framework-config.yaml' },
        '.aexos-core/project-config.yaml': { fixture: 'project-config.yaml' },
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stdout } = await runConfigCmd(['config', 'show']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('metadata');
        expect(stdout).toContain('AEXOS');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('shows specific level with --level', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/framework-config.yaml': { fixture: 'framework-config.yaml' },
        '.aexos-core/project-config.yaml': { fixture: 'project-config.yaml' },
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stdout } = await runConfigCmd(['config', 'show', '--level', 'L1']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('framework_name');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('shows debug annotations with --debug', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/framework-config.yaml': { fixture: 'framework-config.yaml' },
        '.aexos-core/project-config.yaml': { fixture: 'project-config.yaml' },
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stdout } = await runConfigCmd(['config', 'show', '--debug']);
        expect(exitCode).toBe(0);
        expect(stdout).toMatch(/L[12]/);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  // -----------------------------------------------------------------------
  // aexos config validate
  // -----------------------------------------------------------------------

  describe('aexos config validate', () => {
    test('validates existing config files', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/framework-config.yaml': { fixture: 'framework-config.yaml' },
        '.aexos-core/project-config.yaml': { fixture: 'project-config.yaml' },
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stdout } = await runConfigCmd(['config', 'validate']);
        expect(exitCode).toBe(0);
        // "Config validation: PASS" contains "valid" as substring of "validation"
        expect(stdout).toContain('valid');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('validates specific level with --level', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/framework-config.yaml': { fixture: 'framework-config.yaml' },
      });

      try {
        setCwd(tmpDir);
        const { exitCode } = await runConfigCmd(['config', 'validate', '--level', 'L1']);
        expect(exitCode).toBe(0);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  // -----------------------------------------------------------------------
  // aexos config diff
  // -----------------------------------------------------------------------

  describe('aexos config diff', () => {
    test('shows diff between two levels', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/framework-config.yaml': { fixture: 'framework-config.yaml' },
        '.aexos-core/project-config.yaml': { fixture: 'project-config.yaml' },
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stdout } = await runConfigCmd(['config', 'diff', '--levels', 'L1,L2']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('performance_defaults');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  // -----------------------------------------------------------------------
  // aexos config migrate
  // -----------------------------------------------------------------------

  describe('aexos config migrate', () => {
    const LEGACY_CONFIG = [
      'project:',
      '  name: "test-project"',
      '  version: "1.0.0"',
      'ide:',
      '  selected:',
      '    - vscode',
      'mcp:',
      '  enabled: false',
      'toolsLocation: .aexos-core/tools',
      'lazyLoading:',
      '  enabled: true',
      '',
    ].join('\n');

    test('--dry-run shows preview without writing files', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': LEGACY_CONFIG,
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stdout } = await runConfigCmd(['config', 'migrate', '--dry-run']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('DRY RUN');
        expect(stdout).toContain('framework-config.yaml');
        // No split files should have been created
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'framework-config.yaml'))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'project-config.yaml'))).toBe(false);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('full migration creates split files and backup', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': LEGACY_CONFIG,
        '.gitignore': '# existing\nnode_modules\n',
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stdout } = await runConfigCmd(['config', 'migrate']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('Migration complete');

        // Split files created
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'framework-config.yaml'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'project-config.yaml'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'local-config.yaml'))).toBe(true);

        // Backup created
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'core-config.yaml.backup'))).toBe(true);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('round-trips complete legacy values through ignored local compatibility config', async () => {
      const completeLegacyConfig = [
        'project:',
        '  name: migration-roundtrip',
        'synapse:',
        '  enabled: false',
        '  maxEntries: 0',
        'boundary:',
        '  enforce: false',
        '  scopes: [core, product]',
        'models:',
        '  default: gpt-5.6-sol',
        '  aliases:',
        '    review: gpt-6-astra',
        'prd:',
        '  prdFile: docs/prd.md',
        '  prdVersion: v4',
        '  prdSharded: false',
        '  prdShardedLocation: docs/prd',
        '  epicFilePattern: epic-{n}.md',
        'customPrivate:',
        '  enabled: false',
        '  retryCount: 0',
        '  endpoint: ${SERVICE_URL:-localhost}',
        '  nested:',
        '    flags: [alpha, beta]',
        '    optional: null',
        'customTechnicalDocuments: null',
        '',
      ].join('\n');
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': completeLegacyConfig,
        '.gitignore': '# existing\n',
      });
      const originalServiceUrl = process.env.SERVICE_URL;
      delete process.env.SERVICE_URL;

      try {
        setCwd(tmpDir);
        const first = await runConfigCmd(['config', 'migrate']);
        expect(first.exitCode).toBe(0);
        expect(first.stdout).toContain('All legacy keys and values remain resolved');

        const resolved = configResolver.resolveConfig(tmpDir, { skipCache: true }).config;
        expect(resolved).toMatchObject({
          synapse: { enabled: false, maxEntries: 0 },
          boundary: { enforce: false, scopes: ['core', 'product'] },
          models: { default: 'gpt-5.6-sol', aliases: { review: 'gpt-6-astra' } },
          prd: {
            prdFile: 'docs/prd.md',
            prdVersion: 'v4',
            prdSharded: false,
            prdShardedLocation: 'docs/prd',
            epicFilePattern: 'epic-{n}.md',
          },
          customPrivate: {
            enabled: false,
            retryCount: 0,
            endpoint: 'localhost',
            nested: { flags: ['alpha', 'beta'], optional: null },
          },
          customTechnicalDocuments: null,
        });

        const localConfig = fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'local-config.yaml'),
          'utf8',
        );
        expect(localConfig).toContain('${SERVICE_URL:-localhost}');

        const projectConfig = fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'project-config.yaml'),
          'utf8',
        );
        expect(projectConfig).not.toContain('customPrivate');
        expect(projectConfig).not.toContain('synapse');
        expect(fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'core-config.yaml.backup'),
          'utf8',
        )).toBe(completeLegacyConfig);

        const beforeRerun = fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'local-config.yaml'),
          'utf8',
        );
        logOutput = [];
        errorOutput = [];
        const second = await runConfigCmd(['config', 'migrate']);
        expect(second.exitCode).toBe(0);
        expect(second.stdout).toContain('Nothing to migrate');
        expect(fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'local-config.yaml'),
          'utf8',
        )).toBe(beforeRerun);
      } finally {
        if (originalServiceUrl === undefined) delete process.env.SERVICE_URL;
        else process.env.SERVICE_URL = originalServiceUrl;
        cleanupTempDir(tmpDir);
      }
    });

    test('migrates the actual shipped config and preserves null through resolver and L5 precedence', async () => {
      const shipped = fs.readFileSync(path.join(__dirname, '../../.aexos-core/core-config.yaml'), 'utf8');
      const tmpDir = createTempProject({ '.aexos-core/core-config.yaml': shipped });
      const originalUserPath = configResolver.CONFIG_FILES.user;
      configResolver.CONFIG_FILES.user = path.join(tmpDir, 'isolated-user.yaml');
      try {
        setCwd(tmpDir);
        const before = configResolver.resolveConfig(tmpDir, { skipCache: true }).config;
        expect(before).toHaveProperty('customTechnicalDocuments', null);
        const result = await runConfigCmd(['config', 'migrate']);
        expect(result).toMatchObject({ exitCode: 0, stderr: '' });
        const after = configResolver.resolveConfig(tmpDir, { skipCache: true, debug: true });
        expect(after.config).toMatchObject(before);
        expect(after.config).not.toHaveProperty('_aexos_migration');
        expect(Object.keys(after.sources).some(key => key.startsWith('_aexos_migration'))).toBe(false);
        fs.writeFileSync(configResolver.CONFIG_FILES.user, 'customTechnicalDocuments: [user.md]\n');
        expect(configResolver.resolveConfig(tmpDir, { skipCache: true }).config.customTechnicalDocuments)
          .toEqual(['user.md']);
        fs.writeFileSync(configResolver.CONFIG_FILES.user, 'customTechnicalDocuments: null\n');
        expect(configResolver.resolveConfig(tmpDir, { skipCache: true }).config)
          .not.toHaveProperty('customTechnicalDocuments');
        expect(fs.readFileSync(path.join(tmpDir, '.aexos-core/core-config.yaml.backup'), 'utf8')).toBe(shipped);
      } finally {
        configResolver.CONFIG_FILES.user = originalUserPath;
        cleanupTempDir(tmpDir);
      }
    });

    test('keeps unknown nested private fields only in ignored L4 while normalizing schema-approved fields', async () => {
      const privateValue = 'PRIVATE-NESTED-VALUE';
      const legacy = yaml.dump({
        project: { type: 'BROWNFIELD', installedAt: '2026-09-21T00:00:00Z', privateNote: privateValue },
        git: { showConfigWarning: true, cacheTimeSeconds: 30, credential: privateValue },
        github: {
          enabled: true,
          cli_required: true,
          token: privateValue,
          features: { pr_creation: true, issue_management: false, privateFlag: privateValue },
        },
        decisionLogging: {
          enabled: true,
          async: false,
          indexFile: 'decisions.md',
          privateSink: privateValue,
        },
      });
      const tmpDir = createTempProject({ '.aexos-core/core-config.yaml': legacy });
      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);
        expect(result.exitCode).toBe(0);

        const frameworkText = fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'framework-config.yaml'),
          'utf8',
        );
        const projectText = fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'project-config.yaml'),
          'utf8',
        );
        expect(frameworkText).not.toContain(privateValue);
        expect(projectText).not.toContain(privateValue);

        const framework = yaml.load(frameworkText);
        const project = yaml.load(projectText);
        expect(framework.performance_defaults.git).toEqual({
          show_config_warning: true,
          cache_time_seconds: 30,
        });
        expect(project.github_integration.features).toEqual({
          pr_creation: true,
          issue_management: false,
        });
        expect(project.logging.decision_logging.index_file).toBe('decisions.md');

        const local = yaml.load(fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'local-config.yaml'),
          'utf8',
        ));
        expect(local.project.privateNote).toBe(privateValue);
        expect(local.git.credential).toBe(privateValue);
        expect(local.github.token).toBe(privateValue);
        expect(local.decisionLogging.privateSink).toBe(privateValue);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('keeps schema type-confusion payloads exclusively in ignored L4', async () => {
      const privateValue = 'PRIVATE-TYPE-CONFUSION';
      const legacy = yaml.dump({
        project: { type: 'BROWNFIELD' },
        toolsLocation: { token: privateValue },
        github: {
          enabled: { token: privateValue },
          cli_required: true,
          features: {
            pr_creation: { token: privateValue },
            issue_management: true,
          },
          pr: {
            conventional_commits: {
              enabled: true,
              branch_type_map: { 'secret-branch/': privateValue },
              default_type: 'chore',
            },
          },
        },
        ideSync: {
          enabled: true,
          redirects: { private: { token: privateValue } },
        },
        prd: {
          prdFile: { token: privateValue },
          prdVersion: 'v4',
          prdSharded: { token: privateValue },
          prdShardedLocation: 'docs/prd',
        },
        customTechnicalDocuments: { token: privateValue },
        devLoadAlwaysFiles: [{ token: privateValue }],
      });
      const tmpDir = createTempProject({ '.aexos-core/core-config.yaml': legacy });
      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);
        expect(result.exitCode).toBe(0);

        const frameworkText = fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'framework-config.yaml'),
          'utf8',
        );
        const projectText = fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'project-config.yaml'),
          'utf8',
        );
        expect(frameworkText).not.toContain(privateValue);
        expect(projectText).not.toContain(privateValue);

        const framework = yaml.load(frameworkText);
        const project = yaml.load(projectText);
        expect(framework.resource_locations).toBeUndefined();
        expect(project.github_integration).toEqual({
          cli_required: true,
          features: { issue_management: true },
          pr: {
            conventional_commits: {
              enabled: true,
              branch_type_map: {},
              default_type: 'chore',
            },
          },
        });
        expect(project.documentation_paths).toEqual({
          prd_version: 'v4',
          prd_sharded_location: 'docs/prd',
        });

        const local = yaml.load(fs.readFileSync(
          path.join(tmpDir, '.aexos-core', 'local-config.yaml'),
          'utf8',
        ));
        expect(local.toolsLocation.token).toBe(privateValue);
        expect(local.github.enabled.token).toBe(privateValue);
        expect(local.github_integration.pr.conventional_commits.branch_type_map['secret-branch/'])
          .toBe(privateValue);
        expect(local.ide_sync_system.redirects.private.token).toBe(privateValue);
        expect(local.prd.prdFile.token).toBe(privateValue);
        expect(local.customTechnicalDocuments.token).toBe(privateValue);
        expect(local.devLoadAlwaysFiles[0].token).toBe(privateValue);

        const resolved = configResolver.resolveConfig(tmpDir, { skipCache: true }).config;
        expect(resolved.github.enabled.token).toBe(privateValue);
        expect(resolved.github_integration.pr.conventional_commits.branch_type_map['secret-branch/'])
          .toBe(privateValue);
        expect(resolved.ide_sync_system.redirects.private.token).toBe(privateValue);
        expect(resolved.customTechnicalDocuments.token).toBe(privateValue);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test.each([
      ['array', '- first\n- second\n'],
      ['string', 'plain scalar\n'],
      ['number', '42\n'],
      ['prototype key', '__proto__:\n  polluted: true\n'],
    ])('rejects malformed legacy %s roots before writing migration files', async (_label, content) => {
      const tmpDir = createTempProject({ '.aexos-core/core-config.yaml': content });
      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/top-level mapping|unsafe key/);
        expect(fs.readdirSync(path.join(tmpDir, '.aexos-core'))).toEqual(['core-config.yaml']);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('dry-run summarizes outputs without printing private legacy names or values', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': [
          'project:',
          '  type: BROWNFIELD',
          'privateCredentialName: PRIVATE-DRY-RUN-VALUE',
          '',
        ].join('\n'),
      });
      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate', '--dry-run']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('names and values omitted');
        expect(result.stdout).not.toContain('privateCredentialName');
        expect(result.stdout).not.toContain('PRIVATE-DRY-RUN-VALUE');
        expect(fs.readdirSync(path.join(tmpDir, '.aexos-core'))).toEqual(['core-config.yaml']);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('refuses a legacy migration-metadata collision before writing files', async () => {
      const content = '_aexos_migration:\n  private: true\n';
      const tmpDir = createTempProject({ '.aexos-core/core-config.yaml': content });
      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('reserved key');
        expect(fs.readdirSync(path.join(tmpDir, '.aexos-core'))).toEqual(['core-config.yaml']);
        expect(fs.readFileSync(path.join(tmpDir, '.aexos-core/core-config.yaml'), 'utf8')).toBe(content);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('rolls back every created file when resolved validation loses a legacy value', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': LEGACY_CONFIG,
        '.gitignore': '# existing\n',
      });
      const resolverSpy = jest.spyOn(configResolver, 'resolveConfig')
        .mockReturnValueOnce({ config: yaml.load(LEGACY_CONFIG), warnings: [] })
        .mockReturnValueOnce({
          config: { project: { name: 'test-project' } },
          warnings: [],
        });

      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).not.toContain('Migration complete');
        expect(result.stderr).toContain('Migration rolled back');
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'framework-config.yaml'))).toBe(
          false,
        );
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'project-config.yaml'))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'local-config.yaml'))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'core-config.yaml.backup'))).toBe(
          false,
        );
        expect(fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8')).toBe('# existing\n');
      } finally {
        resolverSpy.mockRestore();
        cleanupTempDir(tmpDir);
      }
    });

    test('creates an effective root-anchored local-config ignore rule when none exists', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': LEGACY_CONFIG,
      });

      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);

        expect(result.exitCode).toBe(0);
        const rules = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8').trim().split(/\r?\n/);
        expect(rules.at(-1)).toBe('/.aexos-core/local-config.yaml');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('appends protection after commented and negated local-config rules', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': LEGACY_CONFIG,
        '.gitignore': [
          '# .aexos-core/local-config.yaml',
          '/.aexos-core/local-config.yaml',
          '!/.aexos-core/local-config.yaml',
          '',
        ].join('\n'),
      });

      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);

        expect(result.exitCode).toBe(0);
        const rules = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8').trim().split(/\r?\n/);
        expect(rules.at(-1)).toBe('/.aexos-core/local-config.yaml');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('neutralizes a nested negation without initializing git for a non-git project', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': LEGACY_CONFIG,
        '.aexos-core/.gitignore': '!local-config.yaml\n',
      });

      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);

        expect(result.exitCode).toBe(0);
        expect(fs.existsSync(path.join(tmpDir, '.git'))).toBe(false);
        const nestedRules = fs.readFileSync(
          path.join(tmpDir, '.aexos-core', '.gitignore'),
          'utf8',
        ).trim().split(/\r?\n/);
        expect(nestedRules.at(-1)).toBe('local-config.yaml');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('verifies effective privacy in git when nested ignore negates the root rule', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': LEGACY_CONFIG,
        '.aexos-core/.gitignore': '!local-config.yaml\n',
      });
      const init = spawnSync('git', ['init', '--quiet'], { cwd: tmpDir, encoding: 'utf8' });
      expect(init.status).toBe(0);

      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);

        expect(result.exitCode).toBe(0);
        const ignored = spawnSync(
          'git',
          ['check-ignore', '--no-index', '--quiet', '--', '.aexos-core/local-config.yaml'],
          { cwd: tmpDir, encoding: 'utf8' },
        );
        expect(ignored.status).toBe(0);
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'local-config.yaml'))).toBe(true);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('detects tracking and verifies privacy when project root is below the Git root', async () => {
      const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-cli-nested-git-'));
      const tmpDir = path.join(repoDir, 'packages', 'consumer');
      const coreDir = path.join(tmpDir, '.aexos-core');
      fs.mkdirSync(coreDir, { recursive: true });
      fs.writeFileSync(path.join(coreDir, 'core-config.yaml'), LEGACY_CONFIG);
      fs.writeFileSync(path.join(coreDir, 'local-config.yaml'), 'previous: local\n');
      expect(spawnSync('git', ['init', '--quiet'], { cwd: repoDir, encoding: 'utf8' }).status).toBe(0);
      expect(spawnSync(
        'git',
        ['add', 'packages/consumer/.aexos-core/local-config.yaml'],
        { cwd: repoDir, encoding: 'utf8' },
      ).status).toBe(0);

      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate', '--force']);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain('already tracked by git');
        expect(spawnSync(
          'git',
          ['-C', tmpDir, 'check-ignore', '--no-index', '--quiet', '--', '.aexos-core/local-config.yaml'],
          { encoding: 'utf8' },
        ).status).toBe(0);
      } finally {
        cleanupTempDir(repoDir);
      }
    });

    test('continues restoring other files and reports original plus rollback failures', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/core-config.yaml': LEGACY_CONFIG,
        '.gitignore': '# existing\n',
      });
      const resolverSpy = jest.spyOn(configResolver, 'resolveConfig')
        .mockReturnValueOnce({ config: yaml.load(LEGACY_CONFIG), warnings: [] })
        .mockReturnValueOnce({ config: {}, warnings: [] });
      const originalRmSync = fs.rmSync;
      const rmSpy = jest.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
        if (target.endsWith('framework-config.yaml')) {
          throw new Error('simulated restore denial');
        }
        return originalRmSync(target, options);
      });

      try {
        setCwd(tmpDir);
        const result = await runConfigCmd(['config', 'migrate']);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Migration validation lost');
        expect(result.stderr).toContain('simulated restore denial');
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'framework-config.yaml'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'project-config.yaml'))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'local-config.yaml'))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, '.aexos-core', 'core-config.yaml.backup'))).toBe(
          false,
        );
        expect(fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8')).toBe('# existing\n');
      } finally {
        rmSpy.mockRestore();
        resolverSpy.mockRestore();
        cleanupTempDir(tmpDir);
      }
    });

    test('reports nothing to migrate when already layered', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/framework-config.yaml': { fixture: 'framework-config.yaml' },
        '.aexos-core/project-config.yaml': { fixture: 'project-config.yaml' },
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stdout } = await runConfigCmd(['config', 'migrate']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('Nothing to migrate');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  // -----------------------------------------------------------------------
  // aexos config validate — error paths
  // -----------------------------------------------------------------------

  describe('aexos config validate — error paths', () => {
    test('reports malformed YAML syntax error', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/framework-config.yaml': 'metadata:\n  name: "test\n  bad_indent: [unmatched',
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stdout, stderr } = await runConfigCmd(['config', 'validate']);
        // Should fail with YAML error
        const combined = stdout + ' ' + stderr;
        expect(combined).toMatch(/YAML ERROR|error/i);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  // -----------------------------------------------------------------------
  // aexos config init-local
  // -----------------------------------------------------------------------

  describe('aexos config init-local', () => {
    test('creates local-config.yaml from template', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/local-config.yaml.template': 'ide:\n  selected:\n    - vscode\n',
      });

      try {
        setCwd(tmpDir);
        const { exitCode } = await runConfigCmd(['config', 'init-local']);
        expect(exitCode).toBe(0);

        const localConfig = path.join(tmpDir, '.aexos-core', 'local-config.yaml');
        expect(fs.existsSync(localConfig)).toBe(true);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    test('warns if local-config.yaml already exists', async () => {
      const tmpDir = createTempProject({
        '.aexos-core/local-config.yaml.template': 'ide:\n  selected:\n    - vscode\n',
        '.aexos-core/local-config.yaml': 'existing: true\n',
      });

      try {
        setCwd(tmpDir);
        const { exitCode, stderr } = await runConfigCmd(['config', 'init-local']);
        // initLocalAction writes to console.error and calls process.exit(1)
        expect(exitCode).toBe(1);
        expect(stderr).toContain('already exists');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });
});
