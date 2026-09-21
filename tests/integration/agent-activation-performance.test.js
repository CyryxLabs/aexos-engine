// Integration/Performance test - uses describeIntegration
/**
 * Integration Tests: Agent Activation Performance
 * Story 6.1.2.6.2 - Agent Performance Optimization
 *
 * Tests end-to-end agent activation with session context
 */

const DevContextLoader = require('../../.aexos-core/development/scripts/dev-context-loader');
const SessionContextLoader = require('../../.aexos-core/core/session/context-loader');
const { createGreetingProject } = require('../helpers/isolated-greeting-project');
const fs = require('fs');
const path = require('path');

describe('Agent Activation Performance (Integration)', () => {
  let devLoader;
  let project;
  let sessionLoader;

  beforeEach(async () => {
    project = createGreetingProject({ contextFixture: true });
    devLoader = new DevContextLoader();
    devLoader.cacheDir = path.join(project.root, '.aexos/cache');
    sessionLoader = new SessionContextLoader();
    sessionLoader.sessionStatePath = path.join(project.root, '.aexos/session-state.json');
    // Start with clean session and cache
    sessionLoader.clearSession();
    await devLoader.clearCache().catch(() => {});
  });

  afterEach(() => { project.cleanup(); });

  describe('@dev Activation with Session Context', () => {
    test('activates with session context after @po', async () => {
      // Simulate @po activation and command
      sessionLoader.updateSession('po', 'Themis', 'validate-story-draft');

      // Simulate @dev activation
      const start = Date.now();
      const devContext = await devLoader.load({ fullLoad: false });
      const sessionContext = sessionLoader.loadContext('dev');
      const duration = Date.now() - start;

      // Performance assertion
      expect(duration).toBeLessThan(100); // Including both loaders

      // Session context assertions
      expect(sessionContext.sessionType).toBe('existing');
      expect(sessionContext.previousAgent.agentId).toBe('po');
      expect(sessionContext.message).toContain('Continuing from @po');

      // Dev context assertions
      expect(devContext.status).toBe('loaded');
      expect(devContext.files.length).toBeGreaterThan(0);
    });

    test('shows correct load time and cache status', async () => {
      // First load (cache miss)
      const result1 = await devLoader.load({ fullLoad: false });

      expect(result1.loadTime).toBeLessThan(50);
      expect(result1.cacheHits).toBe(0);

      // Second load (cache hit)
      const result2 = await devLoader.load({ fullLoad: false });

      expect(result2.loadTime).toBeLessThan(5);
      expect(result2.cacheHits).toBeGreaterThan(0);
    });
  });

  describe('Multi-Agent Transition Flow', () => {
    test('tracks agent sequence: @po → @dev → @qa → @sm', () => {
      // Simulate agent transitions
      sessionLoader.updateSession('po', 'Themis', 'validate-story-draft');
      const context1 = sessionLoader.loadContext('dev');
      expect(context1.previousAgent.agentId).toBe('po');

      sessionLoader.updateSession('dev', 'Vulcan', 'develop');
      const context2 = sessionLoader.loadContext('qa');
      expect(context2.previousAgent.agentId).toBe('dev');

      sessionLoader.updateSession('qa', 'Argus', 'review');
      const context3 = sessionLoader.loadContext('sm');
      expect(context3.previousAgent.agentId).toBe('qa');

      // Verify command history preserved
      expect(context3.lastCommands).toContain('validate-story-draft');
      expect(context3.lastCommands).toContain('develop');
      expect(context3.lastCommands).toContain('review');
    });
  });

  describe('Performance Targets', () => {
    test('@dev activation loads efficiently', async () => {
      sessionLoader.clearSession();

      const start = Date.now();
      await devLoader.load({ fullLoad: false, skipCache: true });
      const sessionContext = sessionLoader.loadContext('dev');
      const duration = Date.now() - start;

      // Relaxed for CI environments
      expect(duration).toBeLessThan(5000); // 5 seconds max
      expect(sessionContext.sessionType).toBe('new');
    }, 60000);

    test('@dev cached activation is significantly faster', async () => {
      // Use a realistic large context so filesystem/parser work is measurable above
      // sub-millisecond scheduler noise on Node 18 CI runners.
      const fixturePath = path.join(project.root, 'docs/fixture-context.md');
      const lines = ['# Consumer context', ...Array.from({ length: 20000 }, (_, i) => `Operational requirement ${i + 1}.`)];
      fs.writeFileSync(fixturePath, lines.join('\n'));
      await devLoader.clearCache();

      const readSpy = jest.spyOn(fs.promises, 'readFile');
      const writeSpy = jest.spyOn(fs.promises, 'writeFile');
      try {
        await devLoader.load({ fullLoad: false, skipCache: true });
        expect(readSpy.mock.calls.some(([file]) => path.resolve(file) === fixturePath)).toBe(true);
        expect(writeSpy.mock.calls.some(([file]) => path.basename(file).startsWith('devcontext_'))).toBe(true);

        readSpy.mockClear();
        writeSpy.mockClear();
        const cachedProbe = await devLoader.load({ fullLoad: false });
        expect(cachedProbe.cacheHits).toBe(1);
        expect(readSpy.mock.calls.some(([file]) => path.resolve(file) === fixturePath)).toBe(false);
        expect(writeSpy.mock.calls.some(([file]) => path.basename(file).startsWith('devcontext_'))).toBe(false);

        const cold = [], warm = [];
        for (let i = 0; i < 20; i++) {
          const start = performance.now();
          await devLoader.load({ fullLoad: false, skipCache: true });
          cold.push(performance.now() - start);
          const cachedStart = performance.now();
          const cached = await devLoader.load({ fullLoad: false });
          warm.push(performance.now() - cachedStart);
          expect(cached.cacheHits).toBe(1);
        }
        const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
        expect(median(warm)).toBeLessThan(median(cold) * 0.5);
      } finally {
        readSpy.mockRestore();
        writeSpy.mockRestore();
      }
    }, 60000);
  });

  describe('Cache Behavior', () => {
    test('cache persists across multiple loads', async () => {
      const result1 = await devLoader.load({ fullLoad: false });
      const result2 = await devLoader.load({ fullLoad: false });
      const result3 = await devLoader.load({ fullLoad: false });

      expect(result2.cacheHits).toBeGreaterThan(result1.cacheHits);
      expect(result3.cacheHits).toBe(result2.cacheHits);
      expect(result3.cacheHits).toBe(result3.filesCount);
    });

    test('cache invalidation after clear', async () => {
      // Load with cache
      const result1 = await devLoader.load({ fullLoad: false });
      expect(result1.cacheHits).toBe(0); // First load

      const result2 = await devLoader.load({ fullLoad: false });
      expect(result2.cacheHits).toBeGreaterThan(0); // Cached

      // Clear cache
      await devLoader.clearCache();

      // Should be cache miss again
      const result3 = await devLoader.load({ fullLoad: false });
      expect(result3.cacheHits).toBe(0);
    });
  });

  describe('Data Reduction', () => {
    test('summary mode reduces data by ~82%', async () => {
      const summaryResult = await devLoader.load({ fullLoad: false, skipCache: true });
      const fullResult = await devLoader.load({ fullLoad: true, skipCache: true });

      // Only count successfully loaded files (exclude files with errors)
      const successfulSummaryFiles = summaryResult.files.filter(f => !f.error);
      const successfulFullFiles = fullResult.files.filter(f => !f.error);

      // Calculate total lines only from successfully loaded files
      const summaryLines = successfulSummaryFiles.reduce((sum, f) => sum + (f.summaryLines || 0), 0);
      const fullLines = successfulFullFiles.reduce((sum, f) => sum + (f.linesCount || 0), 0);

      expect(successfulFullFiles).toHaveLength(1);
      expect(successfulSummaryFiles).toHaveLength(1);
      expect(fullLines).toBe(700);
      const reduction = ((fullLines - summaryLines) / fullLines) * 100;
      expect(reduction).toBeGreaterThan(75);
      expect(reduction).toBeLessThan(90);
    });
  });

  describe('Session Context Display', () => {
    test('formats context message correctly', () => {
      sessionLoader.updateSession('po', 'Themis', 'validate-story-draft');

      const message = sessionLoader.formatForGreeting('dev');

      expect(message).toContain('\n');
      expect(message).toContain('📍');
      expect(message).toContain('@po');
      expect(message).toContain('Themis');
    });

    test('shows empty message for new sessions', () => {
      sessionLoader.clearSession();

      const message = sessionLoader.formatForGreeting('dev');

      expect(message).toBe('');
    });
  });
});
