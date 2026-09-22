'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { Readable } = require('stream');

const ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE_DIR = path.join(ROOT, '.aexos-core', 'infrastructure', 'templates', 'grok-hooks');
const SYNAPSE = path.join(TEMPLATE_DIR, 'synapse-engine.cjs');
const PRECOMPACT = path.join(TEMPLATE_DIR, 'precompact-session-digest.cjs');

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function vendoredHook(root, source) {
  const target = path.join(root, '.grok', 'hooks', path.basename(source));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return target;
}

function loadHook(file) {
  delete require.cache[require.resolve(file)];
  return require(file);
}

describe('canonical Grok hook wrappers', () => {
  let temp;
  let originalCwd;
  let originalGrokRoot;

  beforeEach(() => {
    temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-wrapper-')));
    originalCwd = process.cwd();
    originalGrokRoot = process.env.GROK_WORKSPACE_ROOT;
    delete process.env.GROK_WORKSPACE_ROOT;
  });
  afterEach(() => {
    process.chdir(originalCwd);
    if (originalGrokRoot === undefined) delete process.env.GROK_WORKSPACE_ROOT;
    else process.env.GROK_WORKSPACE_ROOT = originalGrokRoot;
    jest.restoreAllMocks();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  test('finds and invokes a vendored SYNAPSE runtime two levels above the hook when cwd is elsewhere', async () => {
    const consumer = path.join(temp, 'consumer');
    const outside = path.join(temp, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    const hook = vendoredHook(consumer, SYNAPSE);
    write(consumer, '.aexos-core/core/synapse/runtime/hook-runtime.js', `
      exports.resolveHookRuntime = input => ({
        engine: { process: async () => ({ xml: input.cwd, bracket: 'FRESH' }) },
        session: {}, updateSession() {}
      });
      exports.buildHookOutput = xml => ({ hookSpecificOutput: { additionalContext: xml } });
    `);

    process.chdir(outside);
    const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const wrapper = loadHook(hook);
    await wrapper.main({ prompt: 'context' });

    expect(wrapper.runtimePath({})).toBe(
      path.join(consumer, '.aexos-core', 'core', 'synapse', 'runtime', 'hook-runtime.js'),
    );
    expect(JSON.parse(output.mock.calls[0][0]).hookSpecificOutput.additionalContext).toBe(consumer);
  });

  test('uses GROK_WORKSPACE_ROOT for runner discovery and emits a Grok context envelope', () => {
    const consumer = path.join(temp, 'grok-consumer');
    const outside = path.join(temp, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    const hook = vendoredHook(consumer, PRECOMPACT);
    const runner = write(consumer, '.aexos-core/hooks/unified/runners/precompact-runner.js', 'exports.onPreCompact=async()=>{};');
    process.chdir(outside);
    process.env.GROK_WORKSPACE_ROOT = consumer;
    const child = { on: jest.fn(), unref: jest.fn() };
    const spawn = jest.spyOn(childProcess, 'spawn').mockReturnValue(child);
    const wrapper = loadHook(hook);

    wrapper.main({ sessionId: 'grok-session', hookEventName: 'PreCompact' });
    const [executable, args, options] = spawn.mock.calls[0];
    const context = JSON.parse(options.env.AEXOS_HOOK_CONTEXT);

    expect(wrapper.runnerPath({})).toBe(runner);
    expect(executable).toBe(process.execPath);
    expect(args.join(' ')).toContain(JSON.stringify(runner));
    expect(context).toMatchObject({
      sessionId: 'grok-session', projectDir: consumer, hookEventName: 'PreCompact', provider: 'grok',
    });
  });

  test('recognizes the registered Claude snake-case payload and emits a Claude context envelope', () => {
    const consumer = path.join(temp, 'claude-consumer');
    const hook = vendoredHook(consumer, PRECOMPACT);
    write(consumer, '.aexos-core/hooks/unified/runners/precompact-runner.js', 'exports.onPreCompact=async()=>{};');
    const child = { on: jest.fn(), unref: jest.fn() };
    const spawn = jest.spyOn(childProcess, 'spawn').mockReturnValue(child);
    const wrapper = loadHook(hook);
    const payload = {
      session_id: 'claude-session', cwd: consumer, transcript_path: 'session.jsonl',
      hook_event_name: 'PreCompact', permission_mode: 'default',
    };

    wrapper.main(payload);
    const context = JSON.parse(spawn.mock.calls[0][2].env.AEXOS_HOOK_CONTEXT);

    expect(context).toMatchObject({
      sessionId: 'claude-session', projectDir: consumer, transcriptPath: 'session.jsonl',
      hookEventName: 'PreCompact', permissionMode: 'default', provider: 'claude',
    });
  });

  test.each([
    [PRECOMPACT, 9000],
    [SYNAPSE, 5000],
  ])('restores bounded stdin and non-exiting run exports for %s', async (source, timeout) => {
    const wrapper = loadHook(source);
    const payload = { prompt: 'bounded-input' };
    await expect(wrapper.readStdin(Readable.from([JSON.stringify(payload)]), 100)).resolves.toEqual(payload);
    expect(wrapper.HOOK_TIMEOUT_MS).toBe(timeout);

    const exit = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
    const previousExitCode = process.exitCode;
    await wrapper.run(Readable.from([JSON.stringify(payload)]));
    expect(exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    process.exitCode = previousExitCode;
  });

  test('bounds the complete imported run when the SYNAPSE engine never resolves', async () => {
    const consumer = path.join(temp, 'hanging-consumer');
    const hook = vendoredHook(consumer, SYNAPSE);
    write(consumer, '.aexos-core/core/synapse/runtime/hook-runtime.js', `
      exports.resolveHookRuntime = () => ({
        engine: { process: () => new Promise(() => {}) }, session: {}, updateSession() {}
      });
      exports.buildHookOutput = xml => xml;
    `);
    const wrapper = loadHook(hook);
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
    const started = Date.now();

    await wrapper.run(Readable.from(['{"prompt":"hang"}']), 25);

    expect(Date.now() - started).toBeLessThan(500);
    expect(exit).not.toHaveBeenCalled();
  });

  test('restores validator default options without changing explicit overrides', () => {
    const validator = require('../../.aexos-core/infrastructure/scripts/grok-skills-sync/validate');
    expect(validator.getDefaultOptions()).toEqual({
      projectRoot: process.cwd(),
      grokRoot: path.join(process.cwd(), '.grok'),
      strict: false,
      quiet: false,
      json: false,
    });
  });

  test.each(['synapse-engine.cjs', 'precompact-session-digest.cjs'])(
    'keeps generated %s byte-identical to its canonical template',
    (name) => {
      expect(fs.readFileSync(path.join(ROOT, '.grok', 'hooks', name))).toEqual(
        fs.readFileSync(path.join(TEMPLATE_DIR, name)),
      );
    },
  );
});
