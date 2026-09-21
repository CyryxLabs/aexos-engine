'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  copyExtraCommandFiles,
} = require('../../packages/installer/src/wizard/ide-config-generator');

const projectRoot = path.resolve(__dirname, '../..');
const publicScriptsDir = path.join(projectRoot, '.claude', 'commands', 'AEXOS', 'scripts');

const helpers = {
  'agent-config-loader': '.aexos-core/development/scripts/agent-config-loader.js',
  'generate-greeting': '.aexos-core/development/scripts/generate-greeting.js',
  'greeting-builder': '.aexos-core/development/scripts/greeting-builder.js',
  'session-context-loader': '.aexos-core/scripts/session-context-loader.js',
};

function publicHelperPath(name) {
  return path.join(publicScriptsDir, `${name}.js`);
}

function runPublicHelper(name, args = []) {
  return spawnSync(process.execPath, [publicHelperPath(name), ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

describe('Claude AEXOS command helper surface', () => {
  test.each(Object.entries(helpers))('%s is a thin projection of its canonical module', (name, target) => {
    const publicPath = publicHelperPath(name);
    const canonicalPath = path.join(projectRoot, target);

    expect(fs.existsSync(publicPath)).toBe(true);
    expect(require(publicPath)).toBe(require(canonicalPath));

    const source = fs.readFileSync(publicPath, 'utf8');
    expect(source).toContain(target);
    expect(source).not.toContain('.aiox-core');
    expect(source).not.toMatch(/require\(['"]yaml['"]\)/);
  });

  it('preserves generate-greeting CLI usage and exit status', () => {
    const result = runPublicHelper('generate-greeting');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: node generate-greeting.js <agent-id>');
  });

  it('forwards agent-config-loader CLI commands to the canonical implementation', () => {
    const result = runPublicHelper('agent-config-loader');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('node agent-config-loader.js load <agent-id>');
  });

  it('forwards session-context-loader CLI output to the canonical implementation', () => {
    const result = runPublicHelper('session-context-loader', ['load', 'dev']);

    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(JSON.parse(result.stdout)).toHaveProperty('sessionType');
  });

  it('keeps greeting-builder directly executable without duplicating business logic', () => {
    const result = runPublicHelper('greeting-builder');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('installs exactly the four public helpers and preserves customized helpers on reinstall', async () => {
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-helpers-'));
    const expectedNames = Object.keys(helpers).map(name => `${name}.js`).sort();

    try {
      const first = await copyExtraCommandFiles(targetRoot, projectRoot);
      const installedScriptsDir = path.join(targetRoot, '.claude', 'commands', 'AEXOS', 'scripts');

      expect(fs.readdirSync(installedScriptsDir).sort()).toEqual(expectedNames);
      expect(first.copiedFiles.filter(file => file.endsWith('.js'))).toHaveLength(4);

      const customizedPath = path.join(installedScriptsDir, 'session-context-loader.js');
      fs.writeFileSync(customizedPath, '// user customization\n', 'utf8');

      const second = await copyExtraCommandFiles(targetRoot, projectRoot);
      expect(fs.readFileSync(customizedPath, 'utf8')).toBe('// user customization\n');
      expect(second.preservedFiles).toContain(customizedPath);
      expect(second.unchangedFiles.filter(file => file.endsWith('.js'))).toHaveLength(3);
    } finally {
      fs.rmSync(targetRoot, { recursive: true, force: true });
    }
  });

  it('runs an installed session-context helper against its project-local canonical entry point', async () => {
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-helper-cli-'));

    try {
      await copyExtraCommandFiles(targetRoot, projectRoot);

      const canonicalPath = path.join(targetRoot, '.aexos-core', 'scripts', 'session-context-loader.js');
      fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
      fs.writeFileSync(
        canonicalPath,
        "if (require.main === module) console.log(JSON.stringify({ sessionType: 'installed-test' }));\nmodule.exports = class SessionContextLoader {};\n",
        'utf8',
      );

      const installedHelper = path.join(
        targetRoot,
        '.claude',
        'commands',
        'AEXOS',
        'scripts',
        'session-context-loader.js',
      );
      const result = spawnSync(process.execPath, [installedHelper, 'load', 'dev'], {
        cwd: targetRoot,
        encoding: 'utf8',
        timeout: 10_000,
      });

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ sessionType: 'installed-test' });
    } finally {
      fs.rmSync(targetRoot, { recursive: true, force: true });
    }
  });
});
