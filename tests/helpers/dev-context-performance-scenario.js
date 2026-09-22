'use strict';

// The parent supplies a real, isolated consumer as cwd. Only product load
// durations are measured; process startup and fixture creation are excluded.
const DevContextLoader = require('../../.aexos-core/development/scripts/dev-context-loader');

async function main() {
  const loader = new DevContextLoader();
  const cold = await loader.load({ fullLoad: false });
  const warm = await loader.load({ fullLoad: false });
  const metrics = ({ status, loadTime, cacheHits, filesCount }) => ({ status, loadTime, cacheHits, filesCount });
  process.stdout.write(JSON.stringify({ cold: metrics(cold), warm: metrics(warm) }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
