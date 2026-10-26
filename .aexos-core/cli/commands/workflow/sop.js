'use strict';

const path = require('path');
const { Command } = require('commander');
const { auditConformance, createSopStore, normalizeSopContract, previewSop, renderSop, verifyProjection } = require('../../../core/workflow-engineering/sop');
const { readOrdinaryFile } = require('../../../core/workflow-engineering/sop/store');

function readJson(file) { return JSON.parse(readOrdinaryFile(path.resolve(file), 1024 * 1024).text); }
function output(value, json = true) { console.log(json ? JSON.stringify(value, null, 2) : String(value)); }
function guard(action) {
  return async (...args) => { try { await action(...args); } catch (error) {
    const code = /^SOP_[A-Z_]+$/.test(error.code || '') ? error.code : 'SOP_INPUT_INVALID';
    console.error(`[${code}] SOP input or operation rejected.`); process.exitCode = 4;
  } };
}

function createSopCommand() {
  const command = new Command('sop').description('Validate, project, inspect, and audit versioned SOP contracts');
  command.command('validate').argument('<contract>').action(guard((file) => output(normalizeSopContract(readJson(file)))));
  command.command('render').argument('<contract>').option('--format <format>', 'markdown|json', 'markdown').action(guard((file, options) => {
    const rendered = renderSop(readJson(file)); output(options.format === 'json' ? rendered : rendered.markdown, options.format === 'json');
  }));
  command.command('verify-projection').argument('<contract>').argument('<projection>').action(guard((file, projection) => {
    const result = verifyProjection(readJson(file), readOrdinaryFile(path.resolve(projection), 8 * 1024 * 1024).text); output(result); process.exitCode = result.matches ? 0 : 3;
  }));
  command.command('preview').argument('<contract>').option('--project-root <directory>', 'Consumer project root', process.cwd()).action(guard((file, options) => output(previewSop(readJson(file), { projectRoot: path.resolve(options.projectRoot) }))));
  command.command('history').argument('<sop-id>').requiredOption('--control-dir <directory>').option('--consumer-root <directory>').action(guard((sopId, options) => {
    const store = createSopStore(path.resolve(options.controlDir), { consumerRoot: path.resolve(options.consumerRoot || process.cwd()) }); output(store.history(sopId));
  }));
  command.command('record-declaration').argument('<declaration>').requiredOption('--control-dir <directory>').action(guard((file, options) => {
    const declaration = readJson(file); const store = createSopStore(path.resolve(options.controlDir), { consumerRoot: process.cwd() });
    if (!declaration.sopId || typeof declaration.decision !== 'string') throw Object.assign(new Error('Declaration requires sopId and decision.'), { code: 'SOP_DECLARATION_INVALID' });
    const lock = store.acquire(declaration.sopId);
    try { output(store.append(declaration.sopId, { type: 'declaration', assurance: 'unverified', at: new Date().toISOString(), declaration }, lock)); }
    finally { store.release(lock); }
  }));
  command.command('conformance').argument('<snapshot>').argument('<run>').description('Project conformance; standalone CLI has no trusted production receipt resolver').action(guard(async (snapshot, run) => output(await auditConformance(readJson(snapshot), readJson(run), null))));
  command.command('transition').description('Deny lifecycle transition without a registered trusted host').action(() => { console.error('[SOP_AUTHORITY_UNAVAILABLE] Trusted lifecycle transitions require a registered host authority.'); process.exitCode = 4; });
  return command;
}

module.exports = { createSopCommand };
