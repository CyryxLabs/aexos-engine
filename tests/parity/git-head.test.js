'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { readGitHead } = require('../../.aexos-core/core/utils/git-head');

describe('fresh Git revision for decision rollback', () => {
  let root;
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-git-head-'));
    git('init', '--quiet');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'initial');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('matches Git and sees the next commit without a stale cache', () => {
    const initial = readGitHead(root);
    expect(initial).toBe(git('rev-parse', 'HEAD'));
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'next');
    expect(readGitHead(root)).toBe(git('rev-parse', 'HEAD'));
    expect(readGitHead(root)).not.toBe(initial);
    const nested = path.join(root, 'nested');
    fs.mkdirSync(nested);
    expect(readGitHead(nested)).toBe(readGitHead(root));
  });

  test('reads packed refs, detached HEAD and linked worktree common refs', () => {
    git('pack-refs', '--all');
    expect(readGitHead(root)).toBe(git('rev-parse', 'HEAD'));
    const worktree = path.join(root, 'linked');
    git('worktree', 'add', '-b', 'linked-branch', worktree);
    expect(readGitHead(worktree)).toBe(git('rev-parse', 'HEAD'));
    git('checkout', '--detach');
    expect(readGitHead(root)).toBe(git('rev-parse', 'HEAD'));
  });

  test('delegates unsupported markers to Git and propagates its failure', () => {
    fs.writeFileSync(path.join(root, '.git/HEAD'), 'invalid head\n');
    expect(() => readGitHead(root)).toThrow();
  });

  test('does not walk past a nested bare repository into the parent worktree', () => {
    const bare = path.join(root, 'nested.git');
    git('clone', '--bare', '.', bare);
    const bareHead = readGitHead(bare);
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'outer advances');
    expect(readGitHead(bare)).toBe(bareHead);
    expect(readGitHead(bare)).not.toBe(readGitHead(root));
    expect(readGitHead(bare)).toBe(git('--git-dir', bare, 'rev-parse', 'HEAD'));
  });
});
