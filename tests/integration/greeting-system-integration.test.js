// Real local activation in disposable consumers.
/**
 * Integration Tests for Unified Greeting System
 * 
 * Tests the complete greeting workflow across all components:
 * - agent-config-loader.js
 * - greeting-builder.js
 * - generate-greeting.js
 * - session-context-loader.js
 * - project-status-loader.js
 * 
 * Part of Story 6.1.4: Unified Greeting System Integration
 */

const assert = require('assert');
const { execFile } = require('child_process');
const path = require('path');
const { createGreetingProject } = require('../helpers/isolated-greeting-project');
const greetingScript = path.resolve(__dirname, '../../.aexos-core/development/scripts/generate-greeting.js');
const util = require('util');
const runNode = util.promisify(execFile);
const execPromise = agent => runNode(process.execPath, [greetingScript, agent], { cwd: process.cwd(), windowsHide: true, timeout: 5000 });

const TEST_AGENTS = ['qa', 'dev', 'pm'];
const PERFORMANCE_TARGET_MS = 150;

describe('Unified Greeting System Integration', () => {
  let project;
  beforeEach(() => { project = createGreetingProject(); });
  afterEach(() => { project.cleanup(); });
  describe('End-to-End Greeting Generation', () => {
    for (const agentId of TEST_AGENTS) {
      it(`should generate greeting for ${agentId} agent`, async function() {
        
        try {
          const { stdout, stderr } = await execPromise(
            agentId,
          );
          
          // Verify output contains expected elements
          assert.ok(stdout.length > 0, 'Greeting should not be empty');
          assert.ok(stdout.includes('ready') || stdout.includes('Ready'), 'Should include ready status');
          
          // Check for stderr warnings (acceptable)
          if (stderr && stderr.includes('[generate-greeting]')) {
            console.log(`  ⚠️ Warning: ${stderr.trim()}`);
          }
          
        } catch (error) {
          assert.fail(`Failed to generate greeting for ${agentId}: ${error.message}`);
        }
      });
    }
  });
  
  describe('Performance Validation', () => {
    it('should complete within target time', async function() {
      
      const startTime = Date.now();
      
      try {
        await execPromise('qa');
        const duration = Date.now() - startTime;
        
        console.log(`  ⏱️ Generation time: ${duration}ms (target: <${PERFORMANCE_TARGET_MS}ms)`);
        
        if (duration > PERFORMANCE_TARGET_MS) {
          console.log('  ⚠️ Performance degradation detected');
        }
        
        // Soft assertion - log warning but don't fail
        assert.ok(duration < 500, 'Should complete within 500ms hard limit');
        
      } catch (error) {
        assert.fail(`Performance test failed: ${error.message}`);
      }
    });
  });
  
  describe('Agent Configuration Loading', () => {
    it('should load complete agent definition', async () => {
      const { AgentConfigLoader } = require('../../.aexos-core/development/scripts/agent-config-loader');
      const yaml = require('js-yaml');
      const fs = require('fs');
      
      const coreConfig = yaml.load(
        fs.readFileSync('.aexos-core/core-config.yaml', 'utf8'),
      );
      
      const loader = new AgentConfigLoader('qa');
      const complete = await loader.loadComplete(coreConfig);
      
      // Verify structure
      assert.ok(complete.agent, 'Should have agent object');
      assert.ok(complete.persona_profile, 'Should have persona_profile');
      assert.ok(complete.commands, 'Should have commands array');
      
      // Verify agent properties
      assert.strictEqual(complete.agent.id, 'qa');
      assert.ok(complete.agent.name);
      assert.ok(complete.agent.icon);
      
      // Verify persona_profile
      assert.ok(complete.persona_profile.greeting_levels);
      assert.ok(complete.persona_profile.greeting_levels.minimal);
      assert.ok(complete.persona_profile.greeting_levels.named);
      
      // Verify commands
      assert.ok(Array.isArray(complete.commands));
      assert.ok(complete.commands.length > 0);
    });
  });
  
  describe('Greeting Builder Integration', () => {
    it('should build greeting with all sections', async () => {
      const GreetingBuilder = require('../../.aexos-core/development/scripts/greeting-builder');
      
      const mockAgent = {
        id: 'test',
        name: 'Test Agent',
        icon: '🧪',
        persona_profile: {
          greeting_levels: {
            minimal: '🧪 test ready',
            named: '🧪 Test Agent ready',
          },
        },
        persona: {
          role: 'Test Engineer',
        },
        commands: [
          { name: 'help', description: 'Show help', visibility: ['full', 'quick', 'key'] },
          { name: 'test', description: 'Run tests', visibility: ['full', 'quick', 'key'] },
        ],
      };
      
      const mockContext = {
        sessionType: 'new',
        gitConfig: { configured: true, branch: 'main', type: 'github' },
        projectStatus: {
          branch: 'main',
          modifiedFiles: [],
          isGitRepo: true,
          recentCommit: 'Initial commit',
        },
      };
      
      const builder = new GreetingBuilder();
      const greeting = await builder.buildGreeting(mockAgent, mockContext);
      
      // Verify greeting structure
      assert.ok(greeting.includes('Test Agent'), 'Should include agent name');
      assert.ok(greeting.includes('Test Engineer'), 'Should include role');
      assert.ok(greeting.includes('*help'), 'Should include commands');
      assert.ok(greeting.includes('main'), 'Should include branch');
    });
  });
  
  describe('Compact Command Format Normalization', () => {
    it('should normalize compact commands during parsing', async () => {
      const { AgentConfigLoader } = require('../../.aexos-core/development/scripts/agent-config-loader');
      const yaml = require('js-yaml');
      const fs = require('fs');
      
      const coreConfig = yaml.load(
        fs.readFileSync('.aexos-core/core-config.yaml', 'utf8'),
      );
      
      const loader = new AgentConfigLoader('qa');
      const complete = await loader.loadComplete(coreConfig);
      
      // Verify commands are properly parsed
      const commands = complete.commands;
      assert.ok(commands.length > 0, 'Should have commands');
      
      // Check first few commands have name and description
      for (let i = 0; i < Math.min(3, commands.length); i++) {
        const cmd = commands[i];
        assert.ok(cmd.name, `Command ${i} should have name`);
        assert.ok(cmd.description, `Command ${i} should have description`);
        assert.strictEqual(typeof cmd.name, 'string');
        assert.strictEqual(typeof cmd.description, 'string');
      }
    });
  });
  
  describe('Error Recovery', () => {
    it('should provide fallback greeting on failure', async function() {
      
      try {
        const { stdout } = await execPromise(
          'nonexistent-agent',
        );
        
        // Should still produce output (fallback)
        assert.ok(stdout.includes('ready'), 'Should provide fallback greeting');
        
      } catch (error) {
        // Even on error, should have output
        assert.ok(
          error.stdout && error.stdout.includes('ready'),
          'Should provide fallback even on error',
        );
      }
    });
  });
});

