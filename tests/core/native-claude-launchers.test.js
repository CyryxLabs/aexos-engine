'use strict';

jest.mock('child_process', () => ({ execSync: jest.fn(), spawnSync: jest.fn() }));
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { AIResolver } = require('../../.aexos-core/core/execution/semantic-merge-engine');
const { AIReviewer } = require('../../.aexos-core/infrastructure/scripts/pr-review-ai');

describe.each([[AIResolver, 120000], [AIReviewer, 180000]])('native Claude launcher %p', (Launcher, timeout) => {
  beforeEach(() => jest.clearAllMocks());
  test('delivers hostile-looking prompt literally through stdin with native permissions', async () => {
    const prompt = 'quotes " $(whoami) `echo sensitive` | ; &\nnext line';
    spawnSync.mockReturnValue({ status: 0, stdout: 'valid response' });
    expect(await new Launcher().callClaude(prompt)).toBe('valid response');
    const [command, args, options] = spawnSync.mock.calls[0];
    expect(command).toBe('claude');
    expect(args).toEqual(['--print']);
    expect(options.input).toBe(prompt);
    expect(options.shell).toBe(false);
    expect(options.timeout).toBe(timeout);
    expect(options.killSignal).toBe('SIGKILL');
    expect(execSync).not.toHaveBeenCalled();
  });
  test.each([
    { status: 1, stderr: 'private provider diagnostics' },
    { status: null, signal: 'SIGKILL' },
    { error: { code: 'ETIMEDOUT', message: 'private prompt' } },
    { error: { code: 'ENOENT' } },
  ])('fails closed on launch/exit failure without echoing content', async (result) => {
    spawnSync.mockReturnValue(result);
    await expect(new Launcher().callClaude('private prompt')).rejects.toThrow(/^Claude CLI error: (exit 1|SIGKILL|ETIMEDOUT|ENOENT)$/);
  });
  test('rejects missing prompts before launching', async () => {
    await expect(new Launcher().callClaude(null)).rejects.toThrow('non-empty prompt');
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

test.each(['max', 'free', 'free-tracked'].flatMap((mode) => ['cmd', 'sh'].map((ext) => `claude-${mode}.${ext}`)))('routing template %s retains native permissions', (file) => {
  const source = fs.readFileSync(path.resolve('.aexos-core/infrastructure/scripts/llm-routing/templates', file), 'utf8');
  expect(source).not.toContain('--dangerously-skip-permissions');
  expect(source).toContain(file.endsWith('.cmd') ? 'claude %*' : 'claude "$@"');
});
