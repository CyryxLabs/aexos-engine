// Integration/Performance test - uses describeIntegration
/**
 * Performance Tests for Contextual Greeting System
 *
 * Validates:
 * - P50 latency <100ms
 * - P95 latency <130ms
 * - P99 latency <150ms (hard limit)
 * - No regression vs baseline
 */

let GreetingBuilder;
const { createGreetingProject } = require('../helpers/isolated-greeting-project');
let ContextDetector;
let GitConfigDetector;

// Mock dependencies for consistent testing
jest.mock('../../.aexos-core/core/session/context-detector');
jest.mock('../../.aexos-core/infrastructure/scripts/git-config-detector');
jest.mock('../../.aexos-core/infrastructure/scripts/project-status-loader');

let loadProjectStatus;

describe('Greeting Performance Tests', () => {
  let builder;
  let project;
  let mockAgent;
  const ITERATIONS = 100;

  beforeEach(() => {
    project = createGreetingProject();
    // Resolve module-level preference paths after changing to this consumer.
    jest.resetModules();
    GreetingBuilder = require('../../.aexos-core/development/scripts/greeting-builder');
    ContextDetector = require('../../.aexos-core/core/session/context-detector');
    GitConfigDetector = require('../../.aexos-core/infrastructure/scripts/git-config-detector');
    ({ loadProjectStatus } = require('../../.aexos-core/infrastructure/scripts/project-status-loader'));

    // Setup mock agent
    mockAgent = {
      name: 'TestAgent',
      icon: '🤖',
      persona_profile: {
        greeting_levels: {
          minimal: '🤖 TestAgent ready',
          named: '🤖 TestAgent (Tester) ready',
        },
      },
      commands: [
        { name: 'help', visibility: ['full', 'quick', 'key'] },
        { name: 'test', visibility: ['full'] },
      ],
    };

    // Setup fast mocks
    ContextDetector.prototype.detectSessionType = jest.fn().mockReturnValue('new');
    GitConfigDetector.prototype.get = jest.fn().mockReturnValue({
      configured: true,
      type: 'github',
      branch: 'main',
    });
    loadProjectStatus.mockResolvedValue({
      branch: 'main',
      modifiedFiles: [],
      isGitRepo: true,
    });
    builder = new GreetingBuilder();
  });

  afterEach(() => { jest.restoreAllMocks(); project.cleanup(); });

  describe('Baseline Performance (Simple Greeting)', () => {
    test('baseline simple greeting should be fast', () => {
      const times = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        builder.buildSimpleGreeting(mockAgent);
        const end = performance.now();
        times.push(end - start);
      }

      const stats = calculateStats(times);

      console.log('Baseline Performance (Simple Greeting):');
      console.log(`  P50: ${stats.p50.toFixed(2)}ms`);
      console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`  P99: ${stats.p99.toFixed(2)}ms`);

      // Simple greeting should be very fast
      expect(stats.p99).toBeLessThan(50);
    });
  });

  describe('Contextual Greeting Performance', () => {
    test('P50 latency should be <100ms', async () => {
      const times = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        await builder.buildGreeting(mockAgent, {});
        const end = performance.now();
        times.push(end - start);
      }

      const stats = calculateStats(times);

      console.log('Contextual Greeting Performance:');
      console.log(`  P50: ${stats.p50.toFixed(2)}ms`);
      console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`  P99: ${stats.p99.toFixed(2)}ms`);

      expect(stats.p50).toBeLessThan(100);
    });

    test('P95 latency should be <130ms', async () => {
      const times = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        await builder.buildGreeting(mockAgent, {});
        const end = performance.now();
        times.push(end - start);
      }

      const stats = calculateStats(times);
      expect(stats.p95).toBeLessThan(130);
    });

    test('P99 latency should be <150ms (hard limit)', async () => {
      const times = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        await builder.buildGreeting(mockAgent, {});
        const end = performance.now();
        times.push(end - start);
      }

      const stats = calculateStats(times);
      expect(stats.p99).toBeLessThan(150);
    });

    test('fallback uses the 150ms deadline and clears its timer', async () => {
      jest.useFakeTimers();
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      loadProjectStatus.mockImplementation(() => new Promise(() => {}));
      try {
        let settled = false;
        const pending = builder.buildGreeting(mockAgent, {}).then(value => {
          settled = true;
          return value;
        });
        await jest.advanceTimersByTimeAsync(149);
        expect(settled).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        expect(await pending).toBe(builder.buildSimpleGreeting(mockAgent));
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    test('fallback adds at most 10ms P99 overhead to a paired 150ms host timer', async () => {
      const times = [];
      const controls = [];
      const overheads = [];
      const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
      loadProjectStatus.mockImplementation(() => new Promise(() => {}));

      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        // Both deadlines share this event-loop cycle. The control captures OS
        // timer delivery delay, not application work or the greeting result.
        const control = new Promise(resolve => {
          setTimeout(() => resolve(performance.now() - start), 150);
        });
        const actual = builder.buildGreeting(mockAgent, {}).then(greeting => ({
          greeting, duration: performance.now() - start,
        }));
        const [timerDuration, result] = await Promise.all([control, actual]);
        expect(result.greeting).toBe(builder.buildSimpleGreeting(mockAgent));
        times.push(result.duration);
        controls.push(timerDuration);
        overheads.push(result.duration - timerDuration);
      }

      const stats = calculateStats(times);
      const timerStats = calculateStats(controls);
      const overheadStats = calculateStats(overheads);
      console.log('Fallback timing:', { actualP99: stats.p99, controlP99: timerStats.p99,
        pairedOverheadP99: overheadStats.p99 });
      // Keep the original 10ms application-overhead budget. The separate fake
      // clock test enforces 150ms scheduling; Node cannot bound OS dispatch.
      expect(overheadStats.p99).toBeLessThanOrEqual(10);
      expect(warning).toHaveBeenCalledWith('[GreetingBuilder] Fallback to simple greeting:', 'Greeting timeout');
    }, 25000);
  });

  describe('Cache Hit Performance', () => {
    test('cached git config should be fast', async () => {
      const detector = new GitConfigDetector();
      const times = [];

      // First call to populate cache
      detector.get();

      // Measure cache hits
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        detector.get();
        const end = performance.now();
        times.push(end - start);
      }

      const stats = calculateStats(times);

      console.log('Git Config Cache Hit Performance:');
      console.log(`  P50: ${stats.p50.toFixed(2)}ms`);

      expect(stats.p50).toBeLessThan(5); // Should be <5ms
    });
  });
});

/**
 * Calculate percentile statistics
 * @param {number[]} times - Array of measurements
 * @returns {Object} Statistics
 */
function calculateStats(times) {
  const sorted = times.sort((a, b) => a - b);

  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean: mean(sorted),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function percentile(sorted, p) {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index];
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
