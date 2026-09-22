/**
 * Performance Benchmarks for Decision Logging
 *
 * Validates that decision logging overhead meets the <50ms requirement (AC8).
 * Tests individual operations and full workflow performance.
 *
 * @see .aexos-core/scripts/decision-recorder.js
 */

const fs = require('fs').promises;
// Sub-millisecond budgets require a monotonic high-resolution clock. Date.now
// rounds a boundary crossing to 1 ms even when the operation takes microseconds.
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createDecisionProject } = require('../helpers/isolated-decision-project');
const {
  initializeDecisionLogging,
  recordDecision,
  trackFile,
  trackTest,
  updateMetrics,
  completeDecisionLogging,
} = require('../../.aexos-core/development/scripts/decision-recorder');

function runtimeBenchmark(mode = 'workflow') {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, '../helpers/decision-performance-scenario.js'), mode,
  ], { cwd: process.cwd(), encoding: 'utf8', timeout: 10000, windowsHide: true });
  const line = output.split(/\r?\n/).find(value => value.startsWith('DECISION_BENCHMARK '));
  expect(line).toBeDefined();
  return JSON.parse(line.slice('DECISION_BENCHMARK '.length));
}

describe('Decision Logging Performance Benchmarks', () => {
  const testStoryPath = 'docs/stories/benchmark-test.md';
  const testStoryId = 'benchmark-test';
  let restoreProject;

  // Performance targets (AC8)
  const TARGETS = {
    initialization: 50,        // <50ms (includes git, config loading)
    recordDecision: 5,         // <5ms per call
    trackFile: 2,              // <2ms per call
    trackTest: 2,              // <2ms per call
    updateMetrics: 1,          // <1ms
    logGeneration: 30,         // <30ms
    indexUpdate: 5,            // <5ms
    totalOverhead: 50,          // <50ms (CRITICAL)
  };

  beforeEach(async () => {
    restoreProject = createDecisionProject();
    await initializeDecisionLogging('dev', testStoryPath, { enabled: false });
    // Clean up any previous benchmark logs
    try {
      await fs.unlink(`.ai/decision-log-${testStoryId}.md`);
    } catch (error) {
      // File doesn't exist, that's okay
    }

    try {
      await fs.unlink('.ai/decision-logs-index.md');
    } catch (error) {
      // File doesn't exist, that's okay
    }
  });

  afterEach(async () => {
    await initializeDecisionLogging('dev', testStoryPath, { enabled: false });
    restoreProject();
  });

  describe('Individual Operation Performance', () => {
    it('should initialize decision logging in <50ms', () => {
      // Use the same plain-Node boundary as the full workflow benchmark.
      // Jest's captured console constructs stack traces inside the timed call.
      const measured = runtimeBenchmark('initialization');
      const duration = measured.phases.initialize;
      expect(measured).toMatchObject({
        agentId: 'dev', storyPath: testStoryPath, agentLoadTime: 150,
        summary: { decisionsCount: 0, filesModifiedCount: 0, testsRunCount: 0, status: 'running' },
      });
      expect(measured.commitBefore).toMatch(/^[0-9a-f]{40}$/);
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(TARGETS.initialization);
      console.log(`Initialization: ${duration}ms (target: <${TARGETS.initialization}ms) ✓`);
    });

    it('should record decision in <5ms per call', async () => {
      await initializeDecisionLogging('dev', testStoryPath);

      const iterations = 10;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        recordDecision({
          description: `Benchmark decision ${i}`,
          reason: 'Performance test',
          alternatives: ['Alt 1', 'Alt 2', 'Alt 3'],
          type: 'library-choice',
          priority: 'medium',
        });

        const duration = performance.now() - startTime;
        times.push(duration);
      }

      const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(avgTime).toBeLessThan(TARGETS.recordDecision);
      expect(maxTime).toBeLessThan(TARGETS.recordDecision * 2); // Allow 2x for outliers

      console.log(`recordDecision: avg=${avgTime.toFixed(2)}ms, max=${maxTime}ms (target: <${TARGETS.recordDecision}ms) ✓`);
    });

    it('should track file in <2ms per call', async () => {
      await initializeDecisionLogging('dev', testStoryPath);

      const iterations = 20;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        trackFile(`src/file-${i}.js`, 'created');

        const duration = performance.now() - startTime;
        times.push(duration);
      }

      const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(avgTime).toBeLessThan(TARGETS.trackFile);
      expect(maxTime).toBeLessThan(TARGETS.trackFile * 2);

      console.log(`trackFile: avg=${avgTime.toFixed(2)}ms, max=${maxTime}ms (target: <${TARGETS.trackFile}ms) ✓`);
    });

    it('should track test in <2ms per call', async () => {
      await initializeDecisionLogging('dev', testStoryPath);

      const iterations = 20;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        trackTest({
          name: `test-${i}.js`,
          passed: i % 2 === 0,
          duration: 100 + i,
        });

        const duration = performance.now() - startTime;
        times.push(duration);
      }

      const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(avgTime).toBeLessThan(TARGETS.trackTest);
      expect(maxTime).toBeLessThan(TARGETS.trackTest * 2);

      console.log(`trackTest: avg=${avgTime.toFixed(2)}ms, max=${maxTime}ms (target: <${TARGETS.trackTest}ms) ✓`);
    });

    it('should update metrics in <1ms', async () => {
      await initializeDecisionLogging('dev', testStoryPath);

      const startTime = performance.now();

      updateMetrics({
        agentLoadTime: 150,
        taskExecutionTime: 300000,
        customMetric: 'test',
      });

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(TARGETS.updateMetrics);
      console.log(`updateMetrics: ${duration}ms (target: <${TARGETS.updateMetrics}ms) ✓`);
    });
  });

  describe('Log Generation Performance', () => {
    it('should generate decision log in <30ms', async () => {
      const measured = runtimeBenchmark('log-generation');
      const duration = measured.phases.complete;
      expect(measured.summary).toMatchObject({ decisionsCount: 5, filesModifiedCount: 10,
        testsRunCount: 5, testsPassed: 5, status: 'completed' });
      expect(await fs.readFile(measured.log, 'utf8')).toContain('Realistic decision 4');
      expect(await fs.readFile('.ai/decision-logs-index.md', 'utf8')).toContain(testStoryId);
      expect(duration).toBeLessThan(TARGETS.logGeneration);

      console.log(`Log generation: ${duration}ms (target: <${TARGETS.logGeneration}ms) ✓`);
    });
  });

  describe('Total Workflow Overhead (CRITICAL - AC8)', () => {
    it('should complete full workflow with <50ms total overhead', async () => {
      const measured = runtimeBenchmark();
      const totalOverhead = measured.elapsed;
      expect(measured.summary).toMatchObject({
        decisionsCount: 7, filesModifiedCount: 12, testsRunCount: 15,
        testsPassed: 13, testsFailed: 2, status: 'completed',
      });
      expect(await fs.readFile(measured.log, 'utf8')).toContain('Realistic decision 6');
      expect(await fs.readFile('.ai/decision-logs-index.md', 'utf8')).toContain(testStoryId);

      // CRITICAL: Must be under 50ms
      expect(totalOverhead).toBeLessThan(TARGETS.totalOverhead);

      console.log(`\n📊 TOTAL WORKFLOW OVERHEAD: ${totalOverhead}ms (target: <${TARGETS.totalOverhead}ms) ✓`);
      console.log('   - Decisions: 7');
      console.log('   - Files: 12');
      console.log('   - Tests: 15');
      console.log(`   - Status: ${totalOverhead < TARGETS.totalOverhead ? '✅ PASS' : '❌ FAIL'}\n`);
    });

    it('should handle large workflow (100 decisions) efficiently', async () => {
      const startTime = performance.now();

      await initializeDecisionLogging('dev', testStoryPath);

      // Stress test: 100 decisions
      for (let i = 0; i < 100; i++) {
        recordDecision({
          description: `Stress test decision ${i}`,
          reason: 'Large workflow test',
          alternatives: ['Alt 1', 'Alt 2'],
        });
      }

      // 50 files
      for (let i = 0; i < 50; i++) {
        trackFile(`src/file-${i}.js`, 'created');
      }

      // 30 tests
      for (let i = 0; i < 30; i++) {
        trackTest({
          name: `test-${i}.js`,
          passed: true,
          duration: 100,
        });
      }

      await completeDecisionLogging(testStoryId, 'completed');

      const totalOverhead = performance.now() - startTime;

      // Allow 2x target for stress test (100ms)
      expect(totalOverhead).toBeLessThan(TARGETS.totalOverhead * 2);

      console.log(`\n⚡ STRESS TEST (100 decisions): ${totalOverhead}ms (max: <${TARGETS.totalOverhead * 2}ms) ✓`);
    });
  });

  describe('Performance Regression Tests', () => {
    it('should not degrade with repeated calls', async () => {
      await initializeDecisionLogging('dev', testStoryPath);

      const times = [];

      for (let i = 0; i < 50; i++) {
        const startTime = performance.now();

        recordDecision({
          description: `Regression test ${i}`,
          reason: 'Checking for performance degradation',
          alternatives: [],
        });

        const duration = performance.now() - startTime;
        times.push(duration);
      }

      const firstHalf = times.slice(0, 25);
      const secondHalf = times.slice(25);

      const firstAvg = firstHalf.reduce((sum, t) => sum + t, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, t) => sum + t, 0) / secondHalf.length;

      // Second half should not be significantly slower (allow 50% variance)
      // If both are 0ms (very fast), that's acceptable
      if (firstAvg > 0) {
        expect(secondAvg).toBeLessThan(firstAvg * 1.5);
      } else {
        expect(secondAvg).toBeLessThanOrEqual(1); // Both should be <1ms
      }

      console.log(`Regression check: first=${firstAvg.toFixed(2)}ms, second=${secondAvg.toFixed(2)}ms ✓`);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory with large datasets', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      await initializeDecisionLogging('dev', testStoryPath);

      // Create large dataset
      for (let i = 0; i < 1000; i++) {
        recordDecision({
          description: `Memory test ${i}`,
          reason: 'Testing memory usage',
          alternatives: [],
        });
      }

      await completeDecisionLogging(testStoryId, 'completed');

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Should not use more than 10MB for 1000 decisions
      expect(memoryIncrease).toBeLessThan(10);

      console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB (max: <10MB) ✓`);
    });
  });
});
