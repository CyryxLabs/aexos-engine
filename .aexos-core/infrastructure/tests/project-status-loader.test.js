/**
 * @jest-environment node
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const yaml = require('js-yaml');
const execa = require('execa');
const { ProjectStatusLoader } = require('../scripts/project-status-loader');
const execSync = childProcess.execSync;
const execFileSync = childProcess.execFileSync;

describe('ProjectStatusLoader', () => {
  let loader;
  let testRoot;
  let cacheFile;
  let previousGitCeiling;

  beforeEach(async () => {
    // A user's temp directory can itself live inside an ancestor Git worktree.
    testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-test-'));
    previousGitCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(testRoot);
    // Native child_process otherwise reads the host environment instead of
    // Jest's sandboxed process.env. Forward the same ceiling used by execa.
    jest.spyOn(childProcess, 'execSync').mockImplementation((command, options) => (
      execSync(command, { ...options, env: process.env })
    ));
    jest.spyOn(childProcess, 'execFileSync').mockImplementation((file, args, options) => (
      execFileSync(file, args, { ...options, env: process.env })
    ));
    loader = new ProjectStatusLoader(testRoot);
    cacheFile = path.join(testRoot, '.aexos', 'project-status.yaml');
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testRoot, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    } finally {
      childProcess.execSync.mockRestore();
      childProcess.execFileSync.mockRestore();
      if (previousGitCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
      else process.env.GIT_CEILING_DIRECTORIES = previousGitCeiling;
    }
  });

  describe('isGitRepository', () => {
    it('detects a repository through a child directory within the fixture boundary', async () => {
      await execa('git', ['init'], { cwd: testRoot });
      const child = path.join(testRoot, 'nested');
      await fs.mkdir(child);
      const nestedLoader = new ProjectStatusLoader(child);
      expect(await nestedLoader.isGitRepository()).toBe(true);
    });

    it('should return false for non-git directory', async () => {
      // testRoot already created by mkdtemp in beforeEach
      const isGit = await loader.isGitRepository();
      expect(isGit).toBe(false);
    });

    it('does not inherit an ancestor Git fingerprint outside the fixture boundary', async () => {
      expect(await loader.getGitStateFingerprint()).toBeNull();
    });

    it('should return true for git repository', async () => {
      // Git is required; fixture setup and assertion failures must fail
      // testRoot already created by mkdtemp in beforeEach

      // Try to initialize git
      await execa('git', ['init'], { cwd: testRoot });
      const isGit = await loader.isGitRepository();
      expect(isGit).toBe(true);
    });
  });

  describe('getGitBranch', () => {
    it('should return unknown on error', async () => {
      // testRoot already created by mkdtemp in beforeEach
      const branch = await loader.getGitBranch();
      expect(branch).toBe('unknown');
    });

    it('should detect git branch', async () => {
      // testRoot already created by mkdtemp in beforeEach

      await execa('git', ['init'], { cwd: testRoot });

      // Create initial commit
      await fs.writeFile(path.join(testRoot, 'test.txt'), 'test');
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRoot });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRoot });
      await execa('git', ['add', '.'], { cwd: testRoot });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testRoot });

      const branch = await loader.getGitBranch();
      expect(['main', 'master']).toContain(branch);
    });
  });

  describe('getModifiedFiles', () => {
    it('should return empty result for non-git repo', async () => {
      // testRoot already created by mkdtemp in beforeEach
      const result = await loader.getModifiedFiles();
      // Implementation returns { files: [], totalCount: 0 } for non-git repos
      expect(result.files || result).toEqual([]);
    });

    it('should detect modified files', async () => {
      // testRoot already created by mkdtemp in beforeEach

      await execa('git', ['init'], { cwd: testRoot });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRoot });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRoot });

      // Create and commit initial file
      await fs.writeFile(path.join(testRoot, 'existing.txt'), 'existing');
      await execa('git', ['add', '.'], { cwd: testRoot });
      await execa('git', ['commit', '-m', 'Initial'], { cwd: testRoot });

      // Modify file
      await fs.writeFile(path.join(testRoot, 'existing.txt'), 'modified');

      const { files } = await loader.getModifiedFiles();
      expect(files).toContain('existing.txt');
    });

    it('should limit to 5 files maximum', async () => {
      // testRoot already created by mkdtemp in beforeEach

      await execa('git', ['init'], { cwd: testRoot });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRoot });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRoot });

      // Create 7 files
      for (let i = 0; i < 7; i++) {
        await fs.writeFile(path.join(testRoot, `file${i}.txt`), 'content');
      }

      const { files } = await loader.getModifiedFiles();
      expect(files.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getRecentCommits', () => {
    it('should return empty array for non-git repo', async () => {
      // testRoot already created by mkdtemp in beforeEach
      const commits = await loader.getRecentCommits();
      expect(commits).toEqual([]);
    });

    it('should return empty array for repo with no commits', async () => {
      // testRoot already created by mkdtemp in beforeEach

      await execa('git', ['init'], { cwd: testRoot });

      const commits = await loader.getRecentCommits();
      expect(commits).toEqual([]);
    });

    it('should limit to 2 commits', async () => {
      // testRoot already created by mkdtemp in beforeEach

      await execa('git', ['init'], { cwd: testRoot });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRoot });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRoot });

      // Create 3 commits
      for (let i = 0; i < 3; i++) {
        await fs.writeFile(path.join(testRoot, `file${i}.txt`), 'content');
        await execa('git', ['add', '.'], { cwd: testRoot });
        await execa('git', ['commit', '-m', `Commit ${i}`], { cwd: testRoot });
      }

      const commits = await loader.getRecentCommits();
      expect(commits.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getCurrentStoryInfo', () => {
    it('should return null when stories directory missing', async () => {
      // testRoot already created by mkdtemp in beforeEach
      const info = await loader.getCurrentStoryInfo();
      expect(info).toEqual({ story: null, epic: null });
    });

    it('should detect InProgress story', async () => {
      await fs.mkdir(path.join(testRoot, 'docs', 'stories'), { recursive: true });

      const storyContent = `# Story 6.1.2.4

**Story ID:** STORY-6.1.2.4
**Epic:** Epic 6.1 - Agent Identity
**Status:** InProgress

## Description
Test story
`;

      await fs.writeFile(path.join(testRoot, 'docs', 'stories', 'story-6.1.2.4.md'), storyContent);

      const info = await loader.getCurrentStoryInfo();
      expect(info.story).toBe('STORY-6.1.2.4');
      expect(info.epic).toContain('Epic 6.1');
    });

    it('should handle multiple story files correctly', async () => {
      await fs.mkdir(path.join(testRoot, 'docs', 'stories'), { recursive: true });

      // Create one completed story
      await fs.writeFile(
        path.join(testRoot, 'docs', 'stories', 'story-1.md'),
        '**Status:** Completed',
      );

      // Create one in progress story
      await fs.writeFile(
        path.join(testRoot, 'docs', 'stories', 'story-2.md'),
        '**Status:** InProgress\n**Story ID:** STORY-2',
      );

      const info = await loader.getCurrentStoryInfo();
      expect(info.story).toBe('STORY-2');
    });
  });

  describe('Cache Management', () => {
    it('expires a fingerprint-free cache at its TTL boundary', () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(100000);
      try {
        expect(loader.isCacheValid({ timestamp: 99001, ttl: 1 }, null)).toBe(true);
        expect(loader.isCacheValid({ timestamp: 99000, ttl: 1 }, null)).toBe(false);
      } finally {
        now.mockRestore();
      }
    });

    it('should create cache file on first load', async () => {
      // testRoot already created by mkdtemp in beforeEach

      const status = await loader.loadProjectStatus();

      // Check cache file exists
      const cacheExists = await fs
        .access(cacheFile)
        .then(() => true)
        .catch(() => false);

      expect(cacheExists).toBe(true);
    });

    it('should return cached status within TTL', async () => {
      // testRoot already created by mkdtemp in beforeEach

      // First load
      const status1 = await loader.loadProjectStatus();
      const time1 = status1.lastUpdate;

      // Immediate second load (within TTL)
      const status2 = await loader.loadProjectStatus();
      const time2 = status2.lastUpdate;

      // Should return same cached status
      expect(time1).toBe(time2);
    });

    it('should invalidate cache after TTL expires', async () => {
      // testRoot already created by mkdtemp in beforeEach

      // Override TTL to 0 seconds for testing
      loader.cacheTTL = 0;

      // First load
      const status1 = await loader.loadProjectStatus();
      const time1 = status1.lastUpdate;

      // Wait 10ms
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second load (after TTL)
      const status2 = await loader.loadProjectStatus();
      const time2 = status2.lastUpdate;

      // Should be different timestamps
      expect(time1).not.toBe(time2);
    });

    it('should clear cache successfully', async () => {
      // testRoot already created by mkdtemp in beforeEach

      // Create cache
      await loader.loadProjectStatus();

      // Clear cache
      const cleared = await loader.clearCache();
      expect(cleared).toBe(true);

      // Check cache file deleted
      const cacheExists = await fs
        .access(cacheFile)
        .then(() => true)
        .catch(() => false);

      expect(cacheExists).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle detached HEAD state', async () => {
      // testRoot already created by mkdtemp in beforeEach

      await execa('git', ['init'], { cwd: testRoot });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRoot });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRoot });

      // Create commit
      await fs.writeFile(path.join(testRoot, 'test.txt'), 'test');
      await execa('git', ['add', '.'], { cwd: testRoot });
      await execa('git', ['commit', '-m', 'Initial'], { cwd: testRoot });

      // Get commit hash
      const { stdout: hash } = await execa('git', ['rev-parse', 'HEAD'], { cwd: testRoot });

      // Checkout detached HEAD
      await execa('git', ['checkout', hash.trim()], { cwd: testRoot });

      const branch = await loader.getGitBranch();
      expect(typeof branch).toBe('string');
    });

    it('should gracefully handle non-git project', async () => {
      // testRoot already created by mkdtemp in beforeEach

      const status = await loader.loadProjectStatus();

      expect(status.isGitRepo).toBe(false);
      expect(status.branch).toBeNull();
      expect(status.modifiedFiles).toEqual([]);
      expect(status.recentCommits).toEqual([]);
    });
  });

  describe('formatStatusDisplay', () => {
    it('should format git status correctly', () => {
      const status = {
        isGitRepo: true,
        branch: 'main',
        modifiedFiles: ['file1.md', 'file2.js'],
        recentCommits: ['chore: cleanup', 'feat: new feature'],
        currentStory: 'STORY-123',
        lastUpdate: new Date().toISOString(),
      };

      const display = loader.formatStatusDisplay(status);

      expect(display).toContain('Branch: main');
      expect(display).toContain('Modified: file1.md, file2.js');
      expect(display).toContain('Recent: chore: cleanup, feat: new feature');
      expect(display).toContain('Story: STORY-123');
    });

    it('should handle non-git repo message', () => {
      const status = {
        isGitRepo: false,
        branch: null,
        modifiedFiles: [],
        recentCommits: [],
        currentStory: null,
        lastUpdate: new Date().toISOString(),
      };

      const display = loader.formatStatusDisplay(status);
      expect(display).toContain('Not a git repository');
    });

    it('should handle clean repository', () => {
      const status = {
        isGitRepo: true,
        branch: 'main',
        modifiedFiles: [],
        recentCommits: [],
        currentStory: null,
        lastUpdate: new Date().toISOString(),
      };

      const display = loader.formatStatusDisplay(status);
      expect(display).toContain('Branch: main');
    });

    // Story 1.5: Worktree Status Integration tests
    it('should display worktrees summary in status', () => {
      const status = {
        isGitRepo: true,
        branch: 'main',
        modifiedFiles: [],
        recentCommits: [],
        currentStory: null,
        lastUpdate: new Date().toISOString(),
        worktrees: {
          'STORY-42': {
            path: '.aexos/worktrees/STORY-42',
            branch: 'auto-claude/STORY-42',
            createdAt: '2026-01-28T10:00:00Z',
            lastActivity: '2026-01-28T12:30:00Z',
            uncommittedChanges: 3,
            status: 'active',
          },
          'STORY-43': {
            path: '.aexos/worktrees/STORY-43',
            branch: 'auto-claude/STORY-43',
            createdAt: '2026-01-27T10:00:00Z',
            lastActivity: '2026-01-27T12:30:00Z',
            uncommittedChanges: 0,
            status: 'active',
          },
        },
      };

      const display = loader.formatStatusDisplay(status);
      expect(display).toContain('Worktrees:');
      expect(display).toContain('2/2 active');
      expect(display).toContain('1 with changes');
    });

    it('should not display worktrees section when empty', () => {
      const status = {
        isGitRepo: true,
        branch: 'main',
        modifiedFiles: [],
        recentCommits: [],
        currentStory: null,
        lastUpdate: new Date().toISOString(),
        worktrees: {},
      };

      const display = loader.formatStatusDisplay(status);
      expect(display).not.toContain('Worktrees:');
    });

    it('should not display worktrees section when undefined', () => {
      const status = {
        isGitRepo: true,
        branch: 'main',
        modifiedFiles: [],
        recentCommits: [],
        currentStory: null,
        lastUpdate: new Date().toISOString(),
      };

      const display = loader.formatStatusDisplay(status);
      expect(display).not.toContain('Worktrees:');
    });
  });

  // Story 1.5: Worktree Status Integration
  describe('getWorktreesStatus', () => {
    it('should return null when no worktrees exist', async () => {
      // testRoot already created by mkdtemp in beforeEach

      const worktrees = await loader.getWorktreesStatus();
      expect(worktrees).toBeNull();
    });

    it('should return worktree info with required fields', async () => {
      // testRoot already created by mkdtemp in beforeEach

      await execa('git', ['init'], { cwd: testRoot });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRoot });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRoot });

      // Create initial commit (required for worktree)
      await fs.writeFile(path.join(testRoot, 'test.txt'), 'test');
      await execa('git', ['add', '.'], { cwd: testRoot });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testRoot });

      // Create worktree manually
      const worktreePath = path.join(testRoot, '.aexos', 'worktrees', 'STORY-TEST');
      await execa('git', ['worktree', 'add', worktreePath, '-b', 'auto-claude/STORY-TEST'], {
        cwd: testRoot,
      });

      const worktrees = await loader.getWorktreesStatus();

      expect(worktrees).not.toBeNull();
      expect(worktrees['STORY-TEST']).toBeDefined();
      expect(worktrees['STORY-TEST'].path).toContain('STORY-TEST');
      expect(worktrees['STORY-TEST'].branch).toBe('auto-claude/STORY-TEST');
      expect(worktrees['STORY-TEST'].createdAt).toBeDefined();
      expect(worktrees['STORY-TEST'].lastActivity).toBeDefined();
      expect(typeof worktrees['STORY-TEST'].uncommittedChanges).toBe('number');
      expect(['active', 'stale']).toContain(worktrees['STORY-TEST'].status);

      // Cleanup worktree
      await execa('git', ['worktree', 'remove', worktreePath, '--force'], { cwd: testRoot });
      await execa('git', ['branch', '-D', 'auto-claude/STORY-TEST'], { cwd: testRoot });
    });
  });

  describe('generateStatus with worktrees', () => {
    it('should include worktrees in generated status', async () => {
      // testRoot already created by mkdtemp in beforeEach

      await execa('git', ['init'], { cwd: testRoot });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRoot });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRoot });

      // Create initial commit
      await fs.writeFile(path.join(testRoot, 'test.txt'), 'test');
      await execa('git', ['add', '.'], { cwd: testRoot });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testRoot });

      // Create worktree
      const worktreePath = path.join(testRoot, '.aexos', 'worktrees', 'STORY-GEN');
      await execa('git', ['worktree', 'add', worktreePath, '-b', 'auto-claude/STORY-GEN'], {
        cwd: testRoot,
      });

      const status = await loader.generateStatus();

      expect(status.worktrees).toBeDefined();
      expect(status.worktrees['STORY-GEN']).toBeDefined();

      // Cleanup
      await execa('git', ['worktree', 'remove', worktreePath, '--force'], { cwd: testRoot });
      await execa('git', ['branch', '-D', 'auto-claude/STORY-GEN'], { cwd: testRoot });
    });

    it('should not include worktrees key when none exist', async () => {
      // testRoot already created by mkdtemp in beforeEach

      await execa('git', ['init'], { cwd: testRoot });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testRoot });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRoot });

      await fs.writeFile(path.join(testRoot, 'test.txt'), 'test');
      await execa('git', ['add', '.'], { cwd: testRoot });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testRoot });

      const status = await loader.generateStatus();

      // worktrees should be undefined (not included) when none exist
      expect(status.worktrees).toBeUndefined();
    });
  });
});
