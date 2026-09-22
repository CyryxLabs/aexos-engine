'use strict';

// Keep the real validator measurements outside Jest instrumentation. Return
// every result so the caller checks behavior as well as the original budgets.
const path = require('path');
const { performance } = require('node:perf_hooks');
const ToolValidationHelper = require('../../.aexos-core/infrastructure/scripts/tool-validation-helper');

async function main() {
  const mode = process.argv[2];
  let output;
  if (mode === 'single') {
    const validator = new ToolValidationHelper(undefined);
    const start = performance.now();
    const result = await validator.validate('command', { args: 'data' });
    output = { duration: performance.now() - start, results: [result] };
  } else if (mode === 'batch') {
    const validator = new ToolValidationHelper({ validators: [] });
    const operations = Array.from({ length: 100 }, (_, i) => ({ command: `cmd${i}`, args: { index: i } }));
    const start = performance.now();
    const results = await validator.validateBatch(operations);
    output = { duration: performance.now() - start, results };
  } else if (mode === 'concurrent') {
    const validator = new ToolValidationHelper(null);
    const promises = Array.from({ length: 50 }, (_, i) => validator.validate(`command${i}`, { data: i }));
    const start = performance.now();
    const results = await Promise.all(promises);
    output = { duration: performance.now() - start, results };
  } else if (mode === 'summary') {
    const resolver = require('../../.aexos-core/infrastructure/scripts/tool-resolver');
    const toolsPath = path.resolve(__dirname, '../../.aexos-core/infrastructure/tools');
    resolver.setSearchPaths([toolsPath, toolsPath]);
    const tools = JSON.parse(process.argv[3]);
    output = { v1_tools: [], validation_errors: [], performance_issues: [] };
    for (const name of tools) {
      const tool = await resolver.resolveTool(name);
      const validator = new ToolValidationHelper(tool.executable_knowledge);
      const start = performance.now();
      const result = await validator.validate('test', {});
      const duration = performance.now() - start;
      output.v1_tools.push({ name, has_exec_knowledge: !!tool.executable_knowledge,
        validation_passed: result.valid, errors: result.errors, duration_ms: duration });
      if (!result.valid) output.validation_errors.push({ tool: name, errors: result.errors });
      if (duration >= 1) output.performance_issues.push({ tool: name, duration_ms: duration });
    }
  } else {
    throw new Error(`Unknown performance scenario: ${mode}`);
  }
  process.stdout.write('TOOL_VALIDATION_BENCHMARK ' + JSON.stringify(output) + '\n');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
