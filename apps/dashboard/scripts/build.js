'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = path.resolve(__dirname, '..');
const core = path.resolve(app, '../../.aexos-core/core/virtual-office/cloud');
const target = path.join(app, 'supabase/functions/aexos-telemetry');
fs.mkdirSync(target, { recursive: true });
for (const file of ['schema.mjs', 'catalog-keys.json']) {
  const source = fs.readFileSync(path.join(core, file));
  fs.copyFileSync(path.join(core, file), path.join(target, file));
  if (!source.equals(fs.readFileSync(path.join(target, file)))) throw new Error('SHARED_CONTRACT_COPY_MISMATCH');
}
const keys = require(path.join(core, 'catalog-keys.json'));
const catalog = require(path.join(app, 'lib/catalog.json'));
if (JSON.stringify(keys) !== JSON.stringify(catalog.squads.flatMap((squad) => squad.agents.map((agent) => agent.key)))) throw new Error('CATALOG_DRIFT');
for (const required of ['index.html', 'app.js', 'dashboard-state.js', 'styles.css']) if (!fs.statSync(path.join(app, 'public', required)).isFile()) throw new Error('UI_ASSET_MISSING');
console.log(JSON.stringify({ code: 'DASHBOARD_BUILD_COMPLETE', catalogSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(app, 'lib/catalog.json'))).digest('hex'), sharedContractsIdentical: true, privatePackage: require(path.join(app, 'package.json')).private === true }));
