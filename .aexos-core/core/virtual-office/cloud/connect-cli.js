'use strict';

const fs = require('fs');
const readline = require('readline');
const { Writable } = require('stream');
const { createCloudBridge } = require('./bridge');

const HELP = 'aexos office connect --project-root <path> --project-id <uuid> --epoch <uuid> [--identity-epoch <uuid>] --ingest-url <https-url> --origin <https-origin> [--port <port>] [--observe-codex]\nSet AEXOS_DASHBOARD_INGEST_TOKEN for this process, or enter the token at the hidden prompt. The token is never stored.';

function parse(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (flag === '--observe-codex') { options.observeCodex = true; continue; }
    const fields = { '--project-root': 'projectRoot', '--project-id': 'projectId', '--epoch': 'epoch', '--identity-epoch': 'identityEpoch', '--ingest-url': 'endpoint', '--origin': 'approvedOrigin', '--port': 'port' };
    if (!fields[flag] || !args[i + 1] || args[i + 1].startsWith('-')) throw new Error('INVALID_CONNECT_OPTION');
    if (Object.hasOwn(options, fields[flag])) throw new Error('DUPLICATE_CONNECT_OPTION');
    options[fields[flag]] = args[++i];
  }
  for (const field of ['projectRoot', 'projectId', 'epoch', 'endpoint', 'approvedOrigin']) if (!options[field]) throw new Error(`CONNECT_REQUIRES_${field.toUpperCase()}`);
  options.projectRoot = fs.realpathSync(options.projectRoot);
  return options;
}

async function hiddenToken(input = process.stdin, output = process.stderr) {
  if (!input.isTTY || !output.isTTY) throw new Error('INGEST_TOKEN_REQUIRED');
  output.write('Dashboard connection token (hidden): ');
  const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = readline.createInterface({ input, output: silent, terminal: true, historySize: 0 });
  try {
    return await new Promise((resolve, reject) => {
      reader.once('SIGINT', () => reject(new Error('TOKEN_INPUT_CANCELLED')));
      reader.once('close', () => reject(new Error('TOKEN_INPUT_CLOSED')));
      reader.question('', resolve);
    });
  } finally { reader.close(); output.write('\n'); }
}

async function runConnect(args, dependencies = {}) {
  const options = parse(args);
  const output = dependencies.output || console;
  if (options.help) { output.log(HELP); return null; }
  const env = dependencies.env || process.env;
  const token = env.AEXOS_DASHBOARD_INGEST_TOKEN || await (dependencies.readToken || hiddenToken)();
  delete env.AEXOS_DASHBOARD_INGEST_TOKEN;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('INVALID_CLOUD_CREDENTIAL');
  const officeArgs = ['--project-root', options.projectRoot, '--no-open'];
  if (options.port) officeArgs.push('--port', options.port);
  if (options.observeCodex) officeArgs.push('--observe-codex');
  let office;
  let bridge;
  const stop = async () => { if (bridge) await bridge.stop(); if (office) await office.stop(); };
  try {
    office = await (dependencies.runOffice || require('../cli').run)(officeArgs, { handleSignals: false, output });
    bridge = await createCloudBridge(office, { ...options, token, fetch: dependencies.fetch,
      onStatus: (status) => output.log(JSON.stringify({ code: 'AEXOS_CLOUD_TRANSPORT', ...status })),
    });
    await bridge.start();
  } catch (error) { await stop(); throw error; }
  if (dependencies.handleSignals !== false) {
    const shutdown = async () => { await stop(); process.exitCode = 0; };
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  }
  return { office, bridge, stop };
}

module.exports = { HELP, hiddenToken, parse, runConnect };
