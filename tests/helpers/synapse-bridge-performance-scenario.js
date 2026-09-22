'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { UnifiedActivationPipeline } = require('../../.aexos-core/development/scripts/unified-activation-pipeline');

const context = { projectRoot: process.cwd() };
const write = UnifiedActivationPipeline.prototype._writeSynapseSession;
write.call(context, 'dev', 'full', { loaders: {} });
const metrics = { loaders: {} };
const started = performance.now();
write.call(context, 'dev', 'full', metrics);
const elapsed = performance.now() - started;
const written = JSON.parse(fs.readFileSync(path.join(context.projectRoot, '.synapse/sessions/_active-agent.json'), 'utf8'));
process.stdout.write(JSON.stringify({ elapsed, metrics, written }));
