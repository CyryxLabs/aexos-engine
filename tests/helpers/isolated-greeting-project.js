'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

// Real configuration/agents, with every mutable session, preference and cache
// confined to a disposable consumer. Never back up or restore the checkout.
function createGreetingProject({ contextFixture = false } = {}) {
  const cwd = process.cwd();
  const source = path.resolve(__dirname, '../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-greeting-project-'));
  const core = path.join(root, '.aexos-core');
  fs.mkdirSync(core);
  const config = yaml.load(fs.readFileSync(path.join(source, '.aexos-core/core-config.yaml'), 'utf8'));
  config.user_profile = 'advanced';
  config.agentIdentity = { ...config.agentIdentity, greeting: { preference: 'auto', contextDetection: true } };
  if (contextFixture) {
    config.devLoadAlwaysFiles = ['docs/fixture-context.md'];
    fs.mkdirSync(path.join(root, 'docs'));
    const lines = ['# Consumer context', ...Array.from({ length: 699 }, (_, i) => `Operational requirement ${i + 1}.`)];
    fs.writeFileSync(path.join(root, config.devLoadAlwaysFiles[0]), lines.join('\n'));
  }
  fs.writeFileSync(path.join(core, 'core-config.yaml'), yaml.dump(config));
  fs.cpSync(path.join(source, '.aexos-core/development/agents'), path.join(core, 'development/agents'), { recursive: true });
  fs.mkdirSync(path.join(core, 'data'));
  fs.copyFileSync(path.join(source, '.aexos-core/data/workflow-patterns.yaml'), path.join(core, 'data/workflow-patterns.yaml'));
  fs.copyFileSync(path.join(source, '.aexos-core/data/agent-config-requirements.yaml'), path.join(core, 'data/agent-config-requirements.yaml'));
  process.chdir(root);
  return { root, config, cleanup() { process.chdir(cwd); fs.rmSync(root, { recursive: true, force: true }); } };
}

module.exports = { createGreetingProject };
