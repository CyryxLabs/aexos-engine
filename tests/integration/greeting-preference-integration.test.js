// Local integration using an isolated consumer.
/**
 * Integration Tests for Greeting Preference System
 * Tests end-to-end flow: Set preference → Activate agent → Verify greeting
 */

// Mock dependencies before requiring GreetingBuilder
jest.mock('../../.aexos-core/core/session/context-detector');
jest.mock('../../.aexos-core/infrastructure/scripts/git-config-detector');
jest.mock('../../.aexos-core/infrastructure/scripts/project-status-loader', () => ({
  loadProjectStatus: jest.fn(),
  formatStatusDisplay: jest.fn(),
}));

let GreetingPreferenceManager;
let GreetingBuilder;
const { createGreetingProject } = require('../helpers/isolated-greeting-project');

describe('Greeting Preference Integration', () => {
  let manager;
  let builder;
  let project;

  const mockAgent = {
    name: 'Vulcan',
    id: 'dev',
    icon: '💻',
    persona_profile: {
      archetype: 'Builder',
      greeting_levels: {
        minimal: '💻 dev Agent ready',
        named: '💻 Vulcan (Builder) ready',
        archetypal: '💻 Vulcan the Builder ready to innovate!',
      },
    },
  };

  beforeEach(() => {
    project = createGreetingProject();
    jest.resetModules();
    GreetingPreferenceManager = require('../../.aexos-core/development/scripts/greeting-preference-manager');
    GreetingBuilder = require('../../.aexos-core/development/scripts/greeting-builder');
    const ContextDetector = require('../../.aexos-core/core/session/context-detector');
    const GitConfigDetector = require('../../.aexos-core/infrastructure/scripts/git-config-detector');
    const { loadProjectStatus } = require('../../.aexos-core/infrastructure/scripts/project-status-loader');
    ContextDetector.prototype.detectSessionType = jest.fn().mockReturnValue('new');
    GitConfigDetector.prototype.get = jest.fn().mockReturnValue({ configured: true, branch: 'main' });
    loadProjectStatus.mockResolvedValue({ branch: 'main', modifiedFiles: [], isGitRepo: true });
    manager = new GreetingPreferenceManager();
    builder = new GreetingBuilder();
  });
  afterEach(() => { project.cleanup(); });

  describe('End-to-End: Set Preference → Activate Agent', () => {
    test('minimal preference shows minimal greeting', async () => {
      // Set preference
      manager.setPreference('minimal');
      
      // Build greeting
      const greeting = await builder.buildGreeting(mockAgent, {});
      
      // Verify
      expect(greeting).toContain('dev Agent ready');
      expect(greeting).not.toContain('Vulcan the Builder');
    });

    test('named preference shows named greeting', async () => {
      manager.setPreference('named');
      const greeting = await builder.buildGreeting(mockAgent, {});
      
      expect(greeting).toContain('Vulcan (Builder) ready');
      expect(greeting).not.toContain('dev Agent ready');
    });

    test('archetypal preference shows archetypal greeting', async () => {
      manager.setPreference('archetypal');
      const greeting = await builder.buildGreeting(mockAgent, {});
      
      expect(greeting).toContain('Vulcan the Builder ready to innovate!');
    });

    test('auto preference uses session detection', async () => {
      manager.setPreference('auto');
      
      // New session (empty history)
      const greeting = await builder.buildGreeting(mockAgent, { conversationHistory: [] });
      
      // Should use contextual logic (not fixed level)
      expect(greeting).toContain('main');
      expect(greeting).toContain('Vulcan');
    });
  });

  describe('Preference Change → Immediate Effect', () => {
    test('changing preference updates greeting immediately', async () => {
      // Start with minimal
      manager.setPreference('minimal');
      let greeting = await builder.buildGreeting(mockAgent, {});
      expect(greeting).toContain('dev Agent ready');

      // Change to named
      manager.setPreference('named');
      greeting = await builder.buildGreeting(mockAgent, {});
      expect(greeting).toContain('Vulcan (Builder) ready');
      expect(greeting).not.toContain('dev Agent ready');
    });

    test('preference persists across GreetingBuilder instances', async () => {
      manager.setPreference('archetypal');
      
      // Create new builder instance
      const newBuilder = new GreetingBuilder();
      const greeting = await newBuilder.buildGreeting(mockAgent, {});
      
      expect(greeting).toContain('Vulcan the Builder ready to innovate!');
    });
  });

  describe('Backward Compatibility', () => {
    test('default preference preserves Story 6.1.2.5 behavior', async () => {
      // Ensure preference is auto (default)
      manager.setPreference('auto');
      
      const greeting = await builder.buildGreeting(mockAgent, { conversationHistory: [] });
      
      // Should use contextual logic, not fixed level
      expect(greeting).toContain('main');
    });

    test('agents without greeting_levels fall back gracefully', async () => {
      manager.setPreference('minimal');
      
      const agentWithoutLevels = {
        name: 'Test',
        id: 'test',
        icon: '🤖',
      };
      
      const greeting = await builder.buildGreeting(agentWithoutLevels, {});
      expect(greeting).toBeTruthy();
      expect(greeting).toContain('*help');
    });
  });
});
