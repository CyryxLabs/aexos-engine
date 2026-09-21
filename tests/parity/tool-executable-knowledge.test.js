const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const toolResolver = require('../../.aexos-core/infrastructure/scripts/tool-resolver');
const ToolValidationHelper = require(
  '../../.aexos-core/infrastructure/scripts/tool-validation-helper',
);
const ToolHelperExecutor = require(
  '../../.aexos-core/infrastructure/scripts/tool-helper-executor',
);

describe('packaged executable knowledge', () => {
  afterEach(() => {
    toolResolver.clearCache();
    toolResolver.resetSearchPaths();
  });

  test.each([
    ['clickup', 'create_task', { name: 'Task', list_id: '12345678' }, { list_id: '123' }],
    [
      'google-workspace',
      'create_file',
      { name: 'file.txt', content: 'data' },
      { name: 'file.txt' },
    ],
    ['n8n', 'execute_workflow', { workflow_id: 'wf_123' }, {}],
    [
      'supabase',
      'execute_sql',
      { project_id: 'proj_123', query: 'SELECT 1' },
      { project_id: 'proj_123', query: 'DROP DATABASE production' },
    ],
  ])('%s validators execute their packaged positive and negative paths', async (
    toolName,
    command,
    validArgs,
    invalidArgs,
  ) => {
    const accepted = await toolResolver.validateCommand(toolName, command, validArgs);
    const rejected = await toolResolver.validateCommand(toolName, command, invalidArgs);

    expect(accepted).toMatchObject({ valid: true, errors: [] });
    expect(rejected.valid).toBe(false);
    expect(rejected.errors.length).toBeGreaterThan(0);
  });

  test('resolver exposes packaged helper execution without dispatching a provider', async () => {
    await expect(
      toolResolver.executeHelper('clickup', 'format-assignee-for-create', {
        assignees: 456,
      }),
    ).resolves.toEqual([456]);

    await expect(
      toolResolver.executeHelper('google-workspace', 'parse-drive-file-id', {
        input: 'https://drive.google.com/file/d/FILE_123/view',
      }),
    ).resolves.toBe('FILE_123');
  });

  test('resolver prefers consumer tools and falls back to package tools after cwd changes', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-tool-resolver-'));
    const projectRoot = path.join(tempRoot, 'project');
    const emptyRoot = path.join(tempRoot, 'empty');
    const overrideDirectory = path.join(
      projectRoot,
      '.aexos-core',
      'infrastructure',
      'tools',
      'mcp',
    );
    fs.mkdirSync(overrideDirectory, { recursive: true });
    fs.mkdirSync(emptyRoot, { recursive: true });
    fs.writeFileSync(
      path.join(overrideDirectory, 'clickup.yaml'),
      `tool:
  id: clickup
  type: mcp
  name: Consumer ClickUp
  version: 1.0.0
  description: Consumer override
`,
    );

    const resolverPath = path.resolve(
      __dirname,
      '../../.aexos-core/infrastructure/scripts/tool-resolver.js',
    );
    const childSource = `
      const resolver = require(${JSON.stringify(resolverPath)});
      (async () => {
        process.chdir(${JSON.stringify(projectRoot)});
        const consumer = await resolver.resolveTool('clickup');
        process.chdir(${JSON.stringify(emptyRoot)});
        const packaged = await resolver.resolveTool('clickup');
        process.stdout.write(JSON.stringify([consumer.name, packaged.name]));
      })().catch(error => { process.stderr.write(error.message); process.exitCode = 1; });
    `;

    try {
      const child = spawnSync(process.execPath, ['-e', childSource], {
        encoding: 'utf8',
        timeout: 2000,
      });
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual(['Consumer ClickUp', 'ClickUp']);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('v1 tools retain no-validator pass-through', async () => {
    const result = await toolResolver.validateCommand('github-cli', 'unconfigured', {
      arbitrary: true,
    });

    expect(result).toMatchObject({ valid: true, errors: [] });
    expect(result._note).toContain('No validator configured');
  });

  test('VM receives data only and blocks host constructor, process, and require access', async () => {
    const executor = new ToolHelperExecutor(
      [
        {
          id: 'probe',
          function: `
            (function() {
              let constructorEscape = 'blocked';
              try {
                constructorEscape = ({}).constructor.constructor('return process')().platform;
              } catch (_error) {}
              return {
                constructorEscape,
                processType: typeof process,
                requireType: typeof require,
                argsPrototypeIsLocal: Object.getPrototypeOf(args) === Object.prototype
              };
            })();
          `,
        },
      ],
      { timeoutMs: 50 },
    );

    await expect(executor.execute('probe', { value: 1 })).resolves.toEqual({
      constructorEscape: 'blocked',
      processType: 'undefined',
      requireType: 'undefined',
      argsPrototypeIsLocal: true,
    });

    const intrinsicProbe = new ToolHelperExecutor([
      {
        id: 'replace-json',
        function: `
          JSON.stringify = () => ({ get value() { while (true) {} } });
          ({ ok: true });
        `,
      },
    ]);
    await expect(intrinsicProbe.execute('replace-json')).resolves.toEqual({ ok: true });
  });

  test('validator and helper infinite loops stop at their configured timeout', async () => {
    const validator = new ToolValidationHelper(
      [{ validates: 'loop', function: '(function() { while (true) {} })();' }],
      { timeoutMs: 20 },
    );
    const executor = new ToolHelperExecutor(
      [{ id: 'loop', function: '(function() { while (true) {} })();' }],
      { timeoutMs: 20 },
    );

    await expect(validator.validate('loop', {})).resolves.toMatchObject({
      valid: false,
      errors: [expect.stringContaining('exceeded 20ms timeout')],
    });
    await expect(executor.execute('loop', {})).rejects.toThrow('exceeded 0.02s timeout');
  });

  test('queued microtask loops cannot outlive the VM timeout', () => {
    const executorPath = path.resolve(
      __dirname,
      '../../.aexos-core/infrastructure/scripts/tool-helper-executor.js',
    );
    const childSource = `
      const ToolHelperExecutor = require(${JSON.stringify(executorPath)});
      const executor = new ToolHelperExecutor([{
        id: 'microtask-loop',
        function: "Promise.resolve().then(() => { while (true) {} }); 'scheduled';"
      }], { timeoutMs: 20 });
      executor.execute('microtask-loop').then(
        () => { process.stderr.write('unexpected success'); process.exitCode = 2; },
        error => process.stdout.write(error.message)
      );
    `;

    const child = spawnSync(process.execPath, ['-e', childSource], {
      encoding: 'utf8',
      timeout: 1000,
    });

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('exceeded 0.02s timeout');
  });

  test('VM-owned getters and thrown values remain inside the deadline', () => {
    const executorPath = path.resolve(
      __dirname,
      '../../.aexos-core/infrastructure/scripts/tool-helper-executor.js',
    );
    const childSource = `
      const ToolHelperExecutor = require(${JSON.stringify(executorPath)});
      const cases = [
        ['then-getter', '({ get then() { while (true) {} } })'],
        ['value-getter', '({ get value() { while (true) {} } })'],
        ['throw-to-string', 'throw { toString() { while (true) {} } }'],
        ['throw-message', 'throw { get message() { while (true) {} } }'],
        ['throw-code', "throw { message: 'safe', get code() { while (true) {} } }"]
      ];
      (async () => {
        const messages = [];
        for (const [id, fn] of cases) {
          const executor = new ToolHelperExecutor([{ id, function: fn }], { timeoutMs: 20 });
          try { await executor.execute(id); messages.push('unexpected success'); }
          catch (error) { messages.push(error.message); }
        }
        process.stdout.write(JSON.stringify(messages));
      })();
    `;

    const child = spawnSync(process.execPath, ['-e', childSource], {
      encoding: 'utf8',
      timeout: 2000,
    });

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    const messages = JSON.parse(child.stdout);
    expect(messages).toHaveLength(5);
    expect(messages).not.toContain('unexpected success');
    expect(messages.slice(0, 4).every(message => message.includes('timeout'))).toBe(true);
    expect(messages[4]).toContain('execution failed: safe');
  });

  test('malformed definitions and validator result envelopes fail closed', async () => {
    expect(() => new ToolHelperExecutor([{ id: 'missing-function' }])).toThrow(
      'Helper must have id and function fields',
    );
    expect(() => new ToolValidationHelper([{ validates: 'missing-function' }])).toThrow(
      'Validator must have validates and function fields',
    );

    const validator = new ToolValidationHelper([
      { validates: 'string-valid', function: '({ valid: \'false\', errors: [] })' },
      { validates: 'string-errors', function: '({ valid: false, errors: \'nope\' })' },
    ]);
    await expect(validator.validate('string-valid')).resolves.toMatchObject({
      valid: false,
      errors: [expect.stringContaining('invalid format')],
    });
    await expect(validator.validate('string-errors')).resolves.toMatchObject({
      valid: false,
      errors: [expect.stringContaining('invalid format')],
    });
  });

  test('unsupported asynchronous results and long errors fail closed with bounded messages', async () => {
    const executor = new ToolHelperExecutor([
      { id: 'async', function: 'Promise.resolve(1);' },
      { id: 'syntax', function: 'function invalid( {' },
      { id: 'error', function: `throw new Error('${'x'.repeat(1000)}');` },
    ]);

    await expect(executor.execute('async')).rejects.toThrow(
      'asynchronous results are not supported',
    );
    await expect(executor.execute('syntax')).rejects.toThrow('execution failed');
    await expect(executor.execute('error')).rejects.toThrow('execution failed');

    try {
      await executor.execute('error');
      throw new Error('expected helper error');
    } catch (error) {
      expect(error.message.length).toBeLessThan(400);
    }
  });
});
