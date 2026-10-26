'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ConfinedFilesystem, inspectTarget } = require('../../../.aexos-core/core/permissions/confined-filesystem');
const { AgentRuntime } = require('../../../.aexos-core/core/execution/agent-runtime');

describe('structured project filesystem boundary', () => {
  let root;
  let outside;
  let mediated;
  let audit;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-confined-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-outside-'));
    fs.mkdirSync(path.join(root, 'with spaces'));
    fs.writeFileSync(path.join(root, 'with spaces', 'file.txt'), 'private content');
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'external secret');
    audit = [];
    mediated = new ConfinedFilesystem({ projectRoot: root, audit: (record) => audit.push(record) });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  test('reads ordinary file handles and records no contents or absolute paths', async () => {
    expect(await mediated.dispatch({ operation: 'read', target: 'with spaces/file.txt' })).toMatchObject({ success: true, data: 'private content' });
    expect(JSON.stringify(audit)).not.toContain(root);
    expect(JSON.stringify(audit)).not.toContain('private content');
  });

  test('malformed dispatch envelopes return structured denials', async () => {
    for (const request of [null, 5, [], 'read']) {
      expect(await mediated.dispatch(request)).toMatchObject({ success: false, code: 'INVALID' });
    }
  });

  test('explicit read limit accepts exact bytes and rejects oversized content before reading', async () => {
    const target = 'with spaces/file.txt';
    const maximum = Buffer.byteLength('private content');
    expect(await mediated.dispatch({ operation: 'read', target, maxBytes: maximum }))
      .toMatchObject({ success: true, data: 'private content', byteLength: maximum });
    const read = jest.spyOn(fs, 'readSync');
    expect(await mediated.dispatch({ operation: 'read', target, maxBytes: maximum - 1 }))
      .toMatchObject({ success: false, code: 'READ_LIMIT' });
    expect(read).not.toHaveBeenCalled();
  });

  test.each([0, -1, 1.5, '16', null, NaN, Infinity, 16 * 1024 * 1024 + 1])('invalid maxBytes %p never opens a descriptor', async (maxBytes) => {
    const open = jest.spyOn(fs, 'openSync');
    expect(await mediated.dispatch({ operation: 'read', target: 'with spaces/file.txt', maxBytes }))
      .toMatchObject({ success: false, code: 'INVALID_READ_LIMIT' });
    expect(open).not.toHaveBeenCalled();
  });

  test('bounded descriptor loop rejects content growth without leaking a partial result', async () => {
    const target = 'with spaces/file.txt';
    const original = fs.readSync;
    jest.spyOn(fs, 'readSync').mockImplementationOnce((...args) => {
      fs.appendFileSync(path.join(root, target), 'new bytes');
      return original(...args);
    });
    const result = await mediated.dispatch({ operation: 'read', target, maxBytes: Buffer.byteLength('private content') });
    expect(result).toMatchObject({ success: false, code: 'READ_LIMIT' });
    expect(result).not.toHaveProperty('data');
    expect(JSON.stringify(audit)).not.toContain('private content');
  });

  test.each([undefined, null, '', 17, {}, '../secret.txt', 'with spaces/../file.txt', 'NUL', 'file.txt:stream', '\\\\?\\C:\\secret', 'file.'])('denies malformed/alias targets %p without touching files', async (target) => {
    const open = jest.spyOn(fs, 'openSync');
    expect(await mediated.dispatch({ operation: 'read', target })).toMatchObject({ success: false });
    expect(open).not.toHaveBeenCalled();
  });

  test('rejects outside and protected roots and files', async () => {
    expect(await mediated.dispatch({ operation: 'read', target: path.join(outside, 'secret.txt') })).toMatchObject({ code: 'OUTSIDE' });
    expect(inspectTarget('read', 'file', path.parse(root).root)).toMatchObject({ code: 'PROTECTED' });
    expect(await mediated.dispatch({ operation: 'read', target: '.env' })).toMatchObject({ code: 'PROTECTED' });
    expect(JSON.stringify(audit)).not.toContain(outside);
  });

  test('home root remains protected under platform-native case aliases', () => {
    const home = process.platform === 'win32' ? os.homedir().toUpperCase() : os.homedir();
    expect(inspectTarget('read', 'any-file.txt', home)).toMatchObject({ code: 'PROTECTED' });
  });

  test('rejects junction ancestor and hard-linked mutation target', async () => {
    fs.symlinkSync(outside, path.join(root, 'alias'), 'junction');
    expect(await mediated.dispatch({ operation: 'read', target: 'alias/secret.txt' })).toMatchObject({ code: 'ALIAS' });
    fs.linkSync(path.join(outside, 'secret.txt'), path.join(root, 'linked.txt'));
    expect(await mediated.dispatch({ operation: 'create', target: 'linked.txt', content: 'overwrite' })).toMatchObject({ code: 'KIND' });
    expect(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('external secret');
  });

  test.each(['delete', 'move', 'overwrite', undefined])('rejects destructive or unspecified operation %p', async (operation) => {
    expect(await mediated.dispatch({ operation, target: 'with spaces/file.txt' })).toMatchObject({ success: false });
    expect(fs.readFileSync(path.join(root, 'with spaces/file.txt'), 'utf8')).toBe('private content');
  });

  test('existing targets cannot be overwritten and unsupported creation has no effects', async () => {
    expect(await mediated.dispatch({ operation: 'create', target: 'with spaces/file.txt', content: 'bad' })).toMatchObject({ code: 'RECOVERY_REQUIRED' });
    expect(await mediated.dispatch({ operation: 'create', target: 'new.txt', content: 'new' })).toMatchObject({ code: 'UNSUPPORTED_CREATE' });
    expect(fs.existsSync(path.join(root, 'new.txt'))).toBe(false);
  });

  test('detects parent substitution immediately before opening and returns no external data', async () => {
    const original = fs.openSync;
    jest.spyOn(fs, 'openSync').mockImplementationOnce((...args) => {
      fs.renameSync(path.join(root, 'with spaces'), path.join(root, 'original'));
      fs.symlinkSync(outside, path.join(root, 'with spaces'), 'junction');
      fs.writeFileSync(path.join(outside, 'file.txt'), 'external data');
      return original(...args);
    });
    expect(await mediated.dispatch({ operation: 'read', target: 'with spaces/file.txt' })).toMatchObject({ code: 'CHANGED' });
  });

  test('actual governed runtime dispatch invokes guard, never provider, and cannot choose another root', async () => {
    const provider = { execute: jest.fn() };
    const runtime = new AgentRuntime({ projectRoot: root, provider,
      governance: () => ({ budgetCeilingUsd: 1, story: null, scan: { safe: true, threats: [] } }),
    });
    const guard = jest.spyOn(runtime.operationGuard, 'dispatchFilesystem');
    const request = { agentId: 'dev', task: 'read', prompt: 'read project file', budgetCeilingUsd: 1,
      filesystemOperation: { operation: 'read', target: 'with spaces/file.txt' } };
    expect(await runtime.execute(request)).toMatchObject({ success: true, output: 'private content' });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(provider.execute).not.toHaveBeenCalled();
    await expect(runtime.execute({ ...request, projectRoot: outside })).rejects.toMatchObject({ code: 'FILESYSTEM_REQUEST_INVALID' });
    expect(await runtime.execute({ ...request, filesystemOperation: { operation: 'read' } })).toMatchObject({ success: false });
  });

  test('detects target replacement before reading from the opened handle', async () => {
    const original = fs.openSync;
    const target = path.join(root, 'with spaces/file.txt');
    jest.spyOn(fs, 'openSync').mockImplementationOnce((...args) => {
      fs.renameSync(target, path.join(root, 'saved.txt'));
      fs.copyFileSync(path.join(outside, 'secret.txt'), target);
      return original(...args);
    });
    expect(await mediated.dispatch({ operation: 'read', target })).toMatchObject({ code: 'CHANGED' });
  });

  test('Gemini hook uses current stdin contract and exceptions deny without leaking input', () => {
    const hook = path.resolve('.aexos-core/hooks/gemini/before-tool.js');
    const run = (input) => JSON.parse(spawnSync(process.execPath, [hook], { cwd: root, input, encoding: 'utf8' }).stdout);
    expect(run('{ secret malformed')).toMatchObject({ decision: 'deny' });
    expect(run(JSON.stringify({ tool_name: 'read_file', tool_input: { file_path: 'safe' } }))).toMatchObject({ decision: 'allow' });
    expect(run(JSON.stringify({ tool_name: 'run_shell_command', tool_input: { command: 'rm -rf /' } }))).toMatchObject({ decision: 'deny' });
  });
});
