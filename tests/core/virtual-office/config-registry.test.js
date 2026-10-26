'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig, readYamlConfig } = require('../../../.aexos-core/core/virtual-office/config-loader');
const { loadRegistry } = require('../../../.aexos-core/core/virtual-office/registry-loader');

describe('Virtual Office configuration and registry', () => {
  it('loads secure packaged defaults', () => {
    const config = loadConfig();
    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 4001,
      openBrowser: true,
      maxEventBytes: 65536,
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('accepts CLI overrides while rejecting remote binding', () => {
    expect(loadConfig({ port: '4044', openBrowser: false })).toMatchObject({
      port: 4044,
      openBrowser: false,
    });
    expect(() => loadConfig({ host: '0.0.0.0' })).toThrow(/only accepts loopback/i);
    expect(() => loadConfig({ port: 'invalid' })).toThrow(/port must be an integer/i);
  });

  it('rejects missing configuration files', () => {
    expect(() => readYamlConfig(path.join(os.tmpdir(), 'missing-office-config.yaml')))
      .toThrow(/configuration not found/i);
  });

  it('loads the canonical current registry with all squads and agents', () => {
    const registry = loadRegistry(path.resolve(__dirname, '..', '..', '..'));
    expect(registry).toMatchObject({
      squadCount: 23,
      agentCount: 180,
      registrySquadCount: 22,
      registryAgentCount: 168,
      coreAgentCount: 12,
    });
    expect(registry.squads[0].id).toBe('aexos-core');
    expect(registry.squads[0].agents.map((agent) => agent.id)).toEqual(
      expect.arrayContaining(['aexos-master', 'dev', 'qa', 'architect']),
    );
    expect(registry.squads.every((squad) => squad.agents.length > 0)).toBe(true);
    expect(registry.squads.flatMap((squad) => squad.agents).every((agent) => (
      agent.key === `${agent.squadId}/${agent.id}`
    ))).toBe(true);
  });

  it('rejects malformed registries instead of inventing a catalog', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-office-registry-'));
    const dataDirectory = path.join(tempRoot, '.aexos-core', 'data');
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(path.join(dataDirectory, 'squad-registry.yaml'), 'registry:\n  squad_count: 1\n', 'utf8');
    expect(() => loadRegistry(tempRoot)).toThrow(/squads.*array/i);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('does not fall back to the framework catalog for a non-AEXOS directory', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'not-an-aexos-project-'));
    expect(() => loadRegistry(tempRoot)).toThrow(/registry not found/i);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
