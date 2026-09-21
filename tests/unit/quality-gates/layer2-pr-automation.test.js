/**
 * Layer 2: PR Automation Unit Tests
 *
 * @story 2.10 - Quality Gate Manager
 */

const childProcess = require('child_process');
const { Layer2PRAutomation } = require('../../../.aexos-core/core/quality-gates/layer2-pr-automation');

describe('Layer2PRAutomation', () => {
  let layer;
  let spawnSyncSpy;

  beforeEach(() => {
    // These unit tests mock the CodeRabbit command adapter. Keep its separate
    // Windows prerequisite probe deterministic instead of depending on the
    // developer machine's WSL installation.
    spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockImplementation((command, args) => {
      if (command === 'wsl' && args?.[0] === '-l') {
        return { status: 0, stdout: 'Ubuntu\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    });
    layer = new Layer2PRAutomation({
      enabled: true,
      coderabbit: {
        enabled: true,
        blockOn: ['CRITICAL'],
        warnOn: ['HIGH'],
      },
      quinn: {
        enabled: true,
        autoReview: true,
      },
    });
  });

  afterEach(() => {
    spawnSyncSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create layer with default config', () => {
      const defaultLayer = new Layer2PRAutomation();
      expect(defaultLayer).toBeDefined();
      expect(defaultLayer.name).toBe('Layer 2: PR Automation');
      expect(defaultLayer.enabled).toBe(true);
    });

    it('should create layer with custom config', () => {
      const customLayer = new Layer2PRAutomation({
        enabled: false,
        coderabbit: { enabled: false },
      });
      expect(customLayer.enabled).toBe(false);
      expect(customLayer.coderabbit.enabled).toBe(false);
    });
  });

  describe('execute', () => {
    it('should return skipped result when disabled', async () => {
      const disabledLayer = new Layer2PRAutomation({ enabled: false });
      const result = await disabledLayer.execute();

      expect(result.enabled).toBe(false);
      expect(result.results[0].skipped).toBe(true);
    });
  });

  describe('parseCodeRabbitOutput', () => {
    it('should parse CRITICAL issues', () => {
      const output = 'CRITICAL: SQL injection vulnerability found';
      const issues = layer.parseCodeRabbitOutput(output);

      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('CRITICAL');
      expect(issues[0].message).toContain('SQL injection');
    });

    it('should parse multiple severity levels', () => {
      const output = `
        CRITICAL: Major security issue
        HIGH: Performance problem
        MEDIUM: Code style issue
        LOW: Minor suggestion
      `;
      const issues = layer.parseCodeRabbitOutput(output);

      expect(issues.length).toBe(4);
      expect(issues.filter(i => i.severity === 'CRITICAL').length).toBe(1);
      expect(issues.filter(i => i.severity === 'HIGH').length).toBe(1);
      expect(issues.filter(i => i.severity === 'MEDIUM').length).toBe(1);
      expect(issues.filter(i => i.severity === 'LOW').length).toBe(1);
    });

    it('should return empty array for clean output', () => {
      const output = 'No issues found. Code looks good!';
      const issues = layer.parseCodeRabbitOutput(output);

      expect(issues.length).toBe(0);
    });
  });

  describe('runCodeRabbit', () => {
    test.each(['wsl', 'native'])('honors explicit %s execution without host assumptions', async mode => {
      layer.coderabbit.installation_mode = mode;
      layer.runCommand = jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1 });
      expect((await layer.runCodeRabbit()).pass).toBe(true);
      if (mode === 'wsl') {
        expect(spawnSyncSpy).toHaveBeenCalledWith('wsl', ['-l'], { encoding: 'utf8' });
        expect(layer.runCommand.mock.calls[0][0]).toMatch(/^wsl bash/);
      } else {
        expect(spawnSyncSpy).not.toHaveBeenCalled();
        expect(layer.runCommand.mock.calls[0][0]).not.toMatch(/^wsl/);
      }
    });

    it('should pass when no CRITICAL issues', async () => {
      layer.runCommand = jest.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'HIGH: Minor issue\nMEDIUM: Suggestion',
        stderr: '',
        duration: 5000,
      });

      const result = await layer.runCodeRabbit();

      if (process.platform === 'win32') {
        expect(spawnSyncSpy).toHaveBeenCalledWith('wsl', ['-l'], { encoding: 'utf8' });
      } else {
        expect(spawnSyncSpy).not.toHaveBeenCalledWith('wsl', ['-l'], { encoding: 'utf8' });
      }
      expect(result.pass).toBe(true);
      expect(result.issues.critical).toBe(0);
      expect(result.issues.high).toBe(1);
    });

    it('should fail on CRITICAL issues', async () => {
      layer.runCommand = jest.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'CRITICAL: Security vulnerability',
        stderr: '',
        duration: 5000,
      });

      const result = await layer.runCodeRabbit();

      expect(result.pass).toBe(false);
      expect(result.issues.critical).toBe(1);
    });

    it('should handle graceful degradation when not installed', async () => {
      layer.runCommand = jest.fn().mockRejectedValue(
        new Error('command not found'),
      );

      const result = await layer.runCodeRabbit();

      expect(result.pass).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.message).toContain('not installed');
    });

    it('should fail when CodeRabbit exits non-zero even without output', async () => {
      layer.runCommand = jest.fn().mockResolvedValue({
        exitCode: 137,
        stdout: '',
        stderr: '',
        duration: 100,
      });

      const result = await layer.runCodeRabbit();

      expect(result.pass).toBe(false);
      expect(result.error).toMatch(/CodeRabbit CLI exited with code 137/);
      expect(result.error).toContain('stdout:');
      expect(result.error).toContain('stderr:');
    });
  });

  describe('runQuinnReview', () => {
    it('should return suggestions', async () => {
      const result = await layer.runQuinnReview();

      expect(result.check).toBe('quinn');
      expect(result).toHaveProperty('suggestions');
    });
  });

  describe('getSummary', () => {
    it('should return correct summary', async () => {
      layer.runCommand = jest.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        duration: 100,
      });

      await layer.execute();
      const summary = layer.getSummary();

      expect(summary.layer).toBe('Layer 2: PR Automation');
      expect(summary).toHaveProperty('pass');
      expect(summary).toHaveProperty('duration');
    });
  });
});
