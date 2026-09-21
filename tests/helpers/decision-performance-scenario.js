'use strict';

// Measure product code in a plain Node process. Jest's captured console adds
// stack construction and coverage instrumentation to every summary message;
// that is test-runner overhead, not the decision recorder's runtime budget.
const { performance } = require('node:perf_hooks');
const recorder = require('../../.aexos-core/development/scripts/decision-recorder');

async function main() {
  const generationOnly = process.argv[2] === 'log-generation';
  const started = performance.now();
  const context = await recorder.initializeDecisionLogging('dev', 'docs/stories/benchmark-test.md', {
    agentLoadTime: 150,
  });
  const initialized = performance.now();
  for (let i = 0; i < (generationOnly ? 5 : 7); i++) recorder.recordDecision({
    description: `Realistic decision ${i}`, reason: 'Performance validation',
    alternatives: ['Alt 1', 'Alt 2', 'Alt 3'],
    type: i % 2 === 0 ? 'library-choice' : 'architecture', priority: i < 3 ? 'high' : 'medium',
  });
  for (let i = 0; i < (generationOnly ? 10 : 12); i++) recorder.trackFile(`src/feature/file-${i}.js`, i % 3 === 0 ? 'created' : 'modified');
  for (let i = 0; i < (generationOnly ? 5 : 15); i++) recorder.trackTest({
    name: `feature-${i}.test.js`, passed: generationOnly || i % 10 !== 0, duration: 50 + i,
  });
  recorder.updateMetrics({ taskExecutionTime: 180000 });
  const tracked = performance.now();
  const log = await recorder.completeDecisionLogging('benchmark-test', 'completed');
  const elapsed = performance.now() - started;
  process.stdout.write(`DECISION_BENCHMARK ${JSON.stringify({ elapsed,
    phases: { initialize: initialized - started, track: tracked - initialized, complete: elapsed - (tracked - started) },
    log, summary: context.getSummary() })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
