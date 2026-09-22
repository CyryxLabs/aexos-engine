// Adapted from frozen upstream tests/tools/backward-compatibility.test.js
// Upstream commit: 4ef6530ff03b83aea953e4a426f95e012b8b70c5
// SHA256: 43121d7e5ba6672716b454b00001e39871e35bc09555d81825fafbe01fad2d55
// Canonical local APIs; upstream fixture corrections are tracked in missing-source-dispositions.json.
// Integration/Performance test - uses describeIntegration
const path = require('path');
const { execFileSync } = require('child_process');
const toolResolver = require('../../.aexos-core/infrastructure/scripts/tool-resolver');
const ToolValidationHelper = require('../../.aexos-core/infrastructure/scripts/tool-validation-helper');

function runtimeBenchmark(mode, tools = []) {
  const scenario = path.resolve(__dirname, '../helpers/tool-validation-performance-scenario.js');
  const output = execFileSync(process.execPath, [scenario, mode, JSON.stringify(tools)],
    { encoding: 'utf8', timeout: 10000, windowsHide: true });
  const marker = 'TOOL_VALIDATION_BENCHMARK ';
  const line = output.split('\n').find(value => value.startsWith(marker));
  if (!line) throw new Error('Missing tool validation benchmark result');
  return JSON.parse(line.slice(marker.length));
}

function expectValidResults(results, count) {
  expect(results).toHaveLength(count);
  results.forEach(result => {
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
}

/**
 * Backward Compatibility Test Suite
 *
 * AC3 & AC4 Requirements:
 * - Tools without validators auto-pass validation
 * - No errors thrown for missing validators
 * - Backward compatibility maintained for v1.0 simple tools
 * - Graceful degradation when executable_knowledge is missing
 *
 * This suite tests:
 * 1. Simple tools (v1.0) without executable_knowledge pass validation
 * 2. Complex tools (v2.0) without validators pass validation
 * 3. Tools with empty validators array pass validation
 * 4. No errors thrown in any backward compatibility scenario
 * 5. ToolValidationHelper handles missing validators gracefully
 */
describe('Backward Compatibility - No-Validator Pass-Through', () => {
  let simpleToolsPath, complexToolsPath;
  const v1SimpleTools = ['github-cli', 'supabase-cli', 'browser', 'exa'];
  const _v2ComplexTools = ['clickup', 'google-workspace', 'n8n', 'supabase'];

  beforeAll(() => {
    simpleToolsPath = path.join(__dirname, '../../.aexos-core/infrastructure/tools');
    complexToolsPath = path.join(__dirname, '../../.aexos-core/infrastructure/tools');
    toolResolver.setSearchPaths([simpleToolsPath, complexToolsPath]);
  });

  afterAll(() => {
    toolResolver.resetSearchPaths();
    toolResolver.clearCache();
  });

  describe('v1.0 Simple Tools (No executable_knowledge)', () => {
    test('github-cli tool passes validation automatically', async () => {
      const tool = await toolResolver.resolveTool('github-cli');

      // Verify it's a v1.0 tool (no executable_knowledge)
      expect(tool.executable_knowledge).toBeUndefined();
      expect(tool.schema_version).toBe(1); // Auto-detected as v1.0

      // Create validator (should handle missing executable_knowledge)
      const validator = new ToolValidationHelper(tool.executable_knowledge);

      // Validate any command - should auto-pass
      const result = await validator.validate('any-command', { any: 'args' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('supabase-cli tool passes validation automatically', async () => {
      const tool = await toolResolver.resolveTool('supabase-cli');

      expect(tool.executable_knowledge).toBeUndefined();

      const validator = new ToolValidationHelper(tool.executable_knowledge);
      const result = await validator.validate('db-push', { some: 'args' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('browser tool passes validation automatically', async () => {
      const tool = await toolResolver.resolveTool('browser');

      expect(tool.executable_knowledge).toBeUndefined();

      const validator = new ToolValidationHelper(tool.executable_knowledge);
      const result = await validator.validate('navigate', { url: 'https://example.com' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('exa tool passes validation automatically', async () => {
      const tool = await toolResolver.resolveTool('exa');

      expect(tool.executable_knowledge).toBeUndefined();

      const validator = new ToolValidationHelper(tool.executable_knowledge);
      const result = await validator.validate('search', { query: 'test' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('all v1.0 simple tools pass validation', async () => {
      const results = [];

      for (const toolName of v1SimpleTools) {
        const tool = await toolResolver.resolveTool(toolName);
        const validator = new ToolValidationHelper(tool.executable_knowledge);
        const result = await validator.validate('test-command', { test: 'data' });
        results.push({ tool: toolName, result });
      }

      // All should pass
      results.forEach(({ tool, result }) => {
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('v2.0 Complex Tools with Empty Validators', () => {
    test('complex tool with empty validators array passes validation', async () => {
    // Simulate a complex tool with executable_knowledge but no validators
      const mockTool = {
        id: 'mock-complex',
        schema_version: '2.0',
        executable_knowledge: {
          helpers: [],
          validators: [], // Empty validators array
        },
      };

      const validator = new ToolValidationHelper(mockTool.executable_knowledge);
      const result = await validator.validate('any-command', { any: 'args' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('complex tool with undefined validators passes validation', async () => {
      const mockTool = {
        id: 'mock-complex-undefined',
        schema_version: '2.0',
        executable_knowledge: {
          helpers: [],
        // validators not defined
        },
      };

      const validator = new ToolValidationHelper(mockTool.executable_knowledge);
      const result = await validator.validate('test', {});

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('complex tool with null validators passes validation', async () => {
      const mockTool = {
        id: 'mock-complex-null',
        schema_version: '2.0',
        executable_knowledge: {
          helpers: [],
          validators: null, // Explicitly null
        },
      };

      const validator = new ToolValidationHelper(mockTool.executable_knowledge);
      const result = await validator.validate('command', { data: 'value' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('No Errors Thrown for Missing Validators', () => {
    test('ToolValidationHelper constructor does not throw with undefined executable_knowledge', () => {
      expect(() => {
        new ToolValidationHelper(undefined);
      }).not.toThrow();
    });

    test('ToolValidationHelper constructor does not throw with null executable_knowledge', () => {
      expect(() => {
        new ToolValidationHelper(null);
      }).not.toThrow();
    });

    test('ToolValidationHelper constructor does not throw with empty object', () => {
      expect(() => {
        new ToolValidationHelper({});
      }).not.toThrow();
    });

    test('validate() does not throw when validators are missing', async () => {
      const validator = new ToolValidationHelper(undefined);

      await expect(async () => {
        await validator.validate('any-command', { any: 'args' });
      }).not.toThrow();
    });

    test('validate() does not throw with null validators array', async () => {
      const validator = new ToolValidationHelper({ validators: null });

      await expect(async () => {
        await validator.validate('test', {});
      }).not.toThrow();
    });

    test('validateBatch() does not throw when validators are missing', async () => {
      const validator = new ToolValidationHelper(undefined);

      await expect(async () => {
        await validator.validateBatch([
          { command: 'cmd1', args: { a: 1 } },
          { command: 'cmd2', args: { b: 2 } },
        ]);
      }).not.toThrow();
    });
  });

  describe('Graceful Degradation', () => {
    test('validator with no executable_knowledge returns valid for all commands', async () => {
      const validator = new ToolValidationHelper(undefined);

      const commands = [
        'create', 'update', 'delete', 'list', 'get',
        'execute', 'run', 'start', 'stop', 'configure',
      ];

      for (const command of commands) {
        const result = await validator.validate(command, { test: 'data' });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    test('validator with empty validators array returns valid for all commands', async () => {
      const validator = new ToolValidationHelper({ validators: [] });

      const testCases = [
        { command: 'create', args: { name: 'test' } },
        { command: 'update', args: { id: '123', data: { name: 'updated' } } },
        { command: 'delete', args: { id: '456' } },
        { command: 'list', args: { filter: 'active' } },
        { command: 'get', args: { id: '789' } },
      ];

      for (const { command, args } of testCases) {
        const result = await validator.validate(command, args);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    test('batch validation with no validators passes all operations', async () => {
      const validator = new ToolValidationHelper(undefined);

      const operations = [
        { command: 'create', args: { name: 'item1' } },
        { command: 'create', args: { name: 'item2' } },
        { command: 'update', args: { id: '1', name: 'updated' } },
        { command: 'delete', args: { id: '2' } },
        { command: 'list', args: {} },
      ];

      const results = await validator.validateBatch(operations);

      // validateBatch returns array of {command, result} objects
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(operations.length);
      results.forEach(({ command, result }) => {
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    test('validator handles mixed scenarios correctly', async () => {
    // Test with various malformed executable_knowledge structures
      const scenarios = [
        { validators: undefined },
        { validators: null },
        { validators: [] },
        {},
        undefined,
        null,
      ];

      for (const execKnowledge of scenarios) {
        const validator = new ToolValidationHelper(execKnowledge);
        const result = await validator.validate('test', { data: 'value' });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });
  });

  describe('Integration with ToolResolver', () => {
    test('resolving and validating v1.0 tool works end-to-end', async () => {
    // Resolve a simple tool
      const tool = await toolResolver.resolveTool('github-cli');

      // Create validator
      const validator = new ToolValidationHelper(tool.executable_knowledge);

      // Validate - should auto-pass
      const result = await validator.validate('pr-create', {
        title: 'Test PR',
        body: 'Test body',
        base: 'main',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('resolving all simple tools and validating works', async () => {
      const results = [];

      for (const toolName of v1SimpleTools) {
        const tool = await toolResolver.resolveTool(toolName);
        const validator = new ToolValidationHelper(tool.executable_knowledge);
        const result = await validator.validate('test-command', {});

        results.push({
          tool: toolName,
          hasExecKnowledge: !!tool.executable_knowledge,
          validationResult: result,
        });
      }

      // All should have no executable_knowledge and pass validation
      results.forEach(({ tool, hasExecKnowledge, validationResult }) => {
        expect(hasExecKnowledge).toBe(false); // v1.0 tools
        expect(validationResult.valid).toBe(true);
        expect(validationResult.errors).toHaveLength(0);
      });
    });
  });

  describe('Performance with No Validators', () => {
    test('validation without validators is instant (<1ms)', async () => {
      const { duration, results } = runtimeBenchmark('single');

      // Should be instant (much faster than 50ms target)
      expect(duration).toBeLessThan(1);
      expect(duration).toBeGreaterThanOrEqual(0);
      expectValidResults(results, 1);
    });

    test('batch validation without validators is instant', async () => {
      const { duration, results } = runtimeBenchmark('batch');

      // Even 100 operations should be instant
      expect(duration).toBeLessThan(5);
      expect(duration).toBeGreaterThanOrEqual(0);
      expectValidResults(results.map(item => item.result), 100);
      results.forEach((item, i) => {
        expect(item.command).toBe(`cmd${i}`);
        expect(item.args).toEqual({ index: i });
      });
    });

    test('concurrent validations without validators are instant', async () => {
      const { duration, results } = runtimeBenchmark('concurrent');

      // Even 50 concurrent validations should be instant
      expect(duration).toBeLessThan(5);
      expect(duration).toBeGreaterThanOrEqual(0);
      expectValidResults(results, 50);
    });
  });

  describe('Backward Compatibility Summary', () => {
    test('comprehensive backward compatibility check', async () => {
      const report = runtimeBenchmark('summary', v1SimpleTools);

      // Verify all passed
      expect(report.validation_errors).toHaveLength(0);
      expect(report.performance_issues).toHaveLength(0);
      expect(report.v1_tools.map(tool => tool.name)).toEqual(v1SimpleTools);

      report.v1_tools.forEach(tool => {
        expect(tool.has_exec_knowledge).toBe(false);
        expect(tool.validation_passed).toBe(true);
        expect(tool.errors).toHaveLength(0);
        expect(tool.duration_ms).toBeGreaterThanOrEqual(0);
        expect(tool.duration_ms).toBeLessThan(1);
      });

      // Log summary
      console.log('\n✅ Backward Compatibility Report:');
      console.log(`  v1.0 Tools Tested: ${report.v1_tools.length}`);
      console.log(`  All Validations Passed: ${report.validation_errors.length === 0}`);
      console.log(`  All Performance OK: ${report.performance_issues.length === 0}`);
      console.log('  Average Duration: <1ms (instant)');
    });
  });
});
