const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cliPath = path.resolve(__dirname, '../../bin/aexos.js');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10000,
  });
}

describe('public command routing', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-public-routing-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('generate list reaches the canonical Commander implementation', () => {
    const result = runCli(['generate', 'list'], tempRoot);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Available Templates');
    for (const template of ['prd', 'adr', 'pmdr', 'dbdr', 'story', 'epic', 'task']) {
      expect(result.stdout).toContain(template);
    }
    expect(result.stdout).not.toContain('(missing)');
  });

  test('generate list emits a standalone JSON array in machine mode', () => {
    const result = runCli(['generate', 'list', '--json'], tempRoot);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const templates = JSON.parse(result.stdout);
    expect(templates).toHaveLength(8);
    expect(templates.map(template => template.type)).toContain('adr');
    expect(templates.every(template => template.status !== 'missing')).toBe(true);
  });

  test('generate info emits a standalone JSON object in machine mode', () => {
    const result = runCli(['generate', 'info', 'adr', '--json'], tempRoot);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: 'adr',
      name: 'Architecture Decision Record',
      version: 1,
    });
  });

  test('mcp help reaches Commander without running Docker or network operations', () => {
    const result = runCli(['mcp', '--help'], tempRoot);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: aexos mcp');
    expect(result.stdout).toContain('Manage global MCP');
    expect(result.stdout).toContain('status');
  });

  test.each(['manifest', 'qa', 'metrics', 'migrate'])(
    '%s help is reachable through the public executable',
    command => {
      const result = runCli([command, '--help'], tempRoot);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(`Usage: aexos ${command}`);
      expect(result.stdout).not.toContain('Unknown command');
    },
  );

  test('root help lists every routed Commander and direct command', () => {
    const result = runCli(['--help'], tempRoot);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    for (const command of [
      'workers', 'manifest', 'qa', 'mcp', 'migrate', 'generate', 'metrics', 'config', 'pro',
      'sdc', 'wave', 'enterprise', 'install', 'uninstall', 'init', 'info', 'doctor', 'validate',
      'update',
    ]) {
      expect(result.stdout).toMatch(new RegExp(`^\\s{2}${command}\\s`, 'm'));
    }
  });

  test('generate creates and validates a real ADR from a JSON context file', () => {
    const contextPath = path.join(tempRoot, 'adr-context.json');
    const outputPath = path.join(tempRoot, 'adr-42.md');
    fs.writeFileSync(contextPath, JSON.stringify({
      title: 'Context title must be overridden',
      number: 7,
      status: 'Proposed',
      deciders: 'AEXOS Maintainers',
      context: 'The public executable must route inherited Commander commands correctly.',
      decision: 'Route generate and MCP through the existing canonical Commander runner.',
      positiveConsequences: ['Public CLI matches the exported runner'],
      negativeConsequences: ['The legacy entry point retains two routing cases'],
    }));

    const result = runCli([
      'generate',
      'adr',
      '--non-interactive',
      '--title',
      'Route public commands',
      '--number',
      '42',
      '--status',
      'Accepted',
      '--context',
      contextPath,
      '--save',
      '--output',
      outputPath,
      '--json',
    ], tempRoot);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const generated = JSON.parse(result.stdout);
    expect(generated).toMatchObject({
      templateType: 'adr',
      savedTo: outputPath,
      validation: { isValid: true, errors: [] },
      variables: {
        number: 42,
        title: 'Route public commands',
        status: 'Accepted',
      },
    });
    expect(fs.existsSync(outputPath)).toBe(true);

    const document = fs.readFileSync(outputPath, 'utf8');
    expect(document).toContain('# ADR 042: Route public commands');
    expect(document).toContain('**Status:** Accepted');
    expect(document).toContain('**Deciders:** AEXOS Maintainers');
    expect(document).toContain(
      'Route generate and MCP through the existing canonical Commander runner.',
    );
  });

  test.each([
    ['missing', 'missing-context.json', null, 'Unable to read context file'],
    ['malformed', 'malformed-context.json', '{"context":', 'Invalid JSON in context file'],
    ['non-object', 'array-context.json', '[]', 'must contain a plain JSON object'],
  ])('%s context fails usefully without creating an output file', (
    _label,
    contextName,
    contextContent,
    expectedError,
  ) => {
    const contextPath = path.join(tempRoot, contextName);
    const outputPath = path.join(tempRoot, `${contextName}.md`);
    if (contextContent !== null) fs.writeFileSync(contextPath, contextContent);

    const result = runCli([
      'generate',
      'adr',
      '--non-interactive',
      '--title',
      'Failure should not write',
      '--number',
      '43',
      '--context',
      contextPath,
      '--save',
      '--output',
      outputPath,
    ], tempRoot);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Generation failed');
    expect(result.stderr).toContain(expectedError);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  test('unsupported generate types retain a useful non-zero failure', () => {
    const result = runCli(['generate', 'not-a-template', '--non-interactive'], tempRoot);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported template type: not-a-template');
    expect(result.stdout).toContain('Supported types:');
  });

  test('document JSON mode rejects incomplete context without interactive output', () => {
    const result = runCli([
      'generate',
      'adr',
      '--title',
      'Incomplete machine request',
      '--number',
      '44',
      '--json',
    ], tempRoot);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Generation failed');
    expect(result.stderr).toContain('has no default and interactive mode is disabled');
    expect(result.stderr).not.toContain('?');
  });
});
