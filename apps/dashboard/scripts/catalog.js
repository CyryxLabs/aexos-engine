'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../..');
const { loadRegistry } = require(path.join(root, '.aexos-core/core/virtual-office/registry-loader'));
const registry = loadRegistry(root);
const catalog = { version: 1, squads: registry.squads.map((squad) => ({
  id: squad.id, name: squad.name, domain: squad.domain, description: '', entryAgent: squad.entryAgent,
  agents: squad.agents.map((agent) => ({ key: agent.key, id: agent.id, name: agent.name, title: agent.title, squadId: agent.squadId })),
})) };
const catalogFile = path.join(root, 'apps/dashboard/lib/catalog.json');
const keysFile = path.join(root, '.aexos-core/core/virtual-office/cloud/catalog-keys.json');
fs.mkdirSync(path.dirname(catalogFile), { recursive: true });
fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
fs.writeFileSync(keysFile, JSON.stringify(catalog.squads.flatMap((squad) => squad.agents.map((agent) => agent.key)), null, 2) + '\n');
console.log(JSON.stringify({ catalogSha256: crypto.createHash('sha256').update(fs.readFileSync(catalogFile)).digest('hex'),
  keysSha256: crypto.createHash('sha256').update(fs.readFileSync(keysFile)).digest('hex'),
  squads: catalog.squads.length, agents: catalog.squads.flatMap((squad) => squad.agents).length }));
