'use strict';

const path = require('path');
const { performance } = require('node:perf_hooks');
const { RegistryLoader } = require('../../.aexos-core/core/ids/registry-loader');
const { IncrementalDecisionEngine } = require('../../.aexos-core/core/ids/incremental-decision-engine');

// Use the same real fixture and engine, without Jest's coverage instrumentation.
const loader = new RegistryLoader(path.resolve(__dirname, '../core/ids/fixtures/valid-registry.yaml'));
loader.load();
const engine = new IncrementalDecisionEngine(loader);
let output;
if (process.argv[2] === 'analysis') {
  const start = performance.now();
  const result = engine.analyze('validate story drafts before implementation');
  output = { elapsed: performance.now() - start, result };
} else if (process.argv[2] === 'cache') {
  const start1 = performance.now();
  const first = engine.analyze('template rendering engine');
  const elapsed1 = performance.now() - start1;
  const start2 = performance.now();
  const second = engine.analyze('template rendering engine');
  const elapsed2 = performance.now() - start2;
  output = { elapsed1, elapsed2, sameReference: first === second, first, second };
} else {
  throw new Error('Unknown IDS performance scenario');
}
process.stdout.write('IDS_BENCHMARK ' + JSON.stringify(output) + '\n');
