'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { hookConfiguration, installHooks, observeHook, readHookInput } = require('./host-hooks');
const { CodexSessionObserver } = require('./codex-observer');
const { submitEvent } = require('./host-bridge');
const { loadConfig } = require('./config-loader');
const { createVirtualOfficeServer } = require('./server');

const HELP = `
AEXOS Virtual Office — local real-time agent observability

Usage:
  aexos office [options]
  aexos office status [options]
  aexos office connect --help
  aexos office correlate --file <project-relative.json> --project-root <path> [--format json|graph]
  aexos office observe-codex [--once] [--agent <id>] [--session-id <id>]
  aexos office --observe-codex [--agent <id>] [--session-id <id>]
  aexos office hooks --producer-host <claude-code|gemini> [--install]
  aexos office emit --file <json-file|-> --producer-host <host> [options]
  aexos-office [options]

Options:
  --project-root <path>  AEXOS project to observe (default: nearest project)
  --host <host>          Loopback host (default: 127.0.0.1)
  --port <port>          Local collector port (default: 4001)
  --no-open              Do not open the browser automatically
  --json                 Print the readiness record as JSON
  -h, --help             Show this help

The dashboard consumes local AEXOS telemetry and never calls an AI API.
It is read-only: agent execution and approvals remain in the CLI.
`;

function valueAfter(args, index, flag) {
  const value = args[index + 1];
  if (!value || (value.startsWith('-') && !(flag === '--file' && value === '-'))) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(args) {
  const options = {
    projectRoot: null,
    host: undefined,
    port: undefined,
    openBrowser: undefined,
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case 'observe-codex':
      case 'hooks':
      case 'hook':
      case 'status':
      case 'emit':
        options.action = argument;
        break;
      case '--file':
      case '--producer-host':
        options[argument === '--file' ? 'file' : 'producerHost'] = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--session-id':
        options.sessionId = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--agent':
        options.agentId = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--observe-codex':
        options.observeCodex = true;
        break;
      case '--once':
        options.once = true;
        break;
      case '--install':
        options.install = true;
        break;
      case '--queue':
        options.queue = true;
        break;
      case '--project-root':
        options.projectRoot = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--host':
        options.host = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--port':
        options.port = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--no-open':
        options.openBrowser = false;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown Virtual Office option: ${argument}`);
    }
  }
  return options;
}

function findProjectRoot(startDirectory = process.cwd(), options = {}) {
  const searchParents = options.searchParents !== false;
  let current = path.resolve(startDirectory);
  while (true) {
    const coreDirectory = path.join(current, '.aexos-core');
    if (fs.existsSync(coreDirectory)) return current;
    const parent = path.dirname(current);
    if (!searchParents || parent === current) {
      throw new Error(`No AEXOS project found from ${path.resolve(startDirectory)}`);
    }
    current = parent;
  }
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'cmd.exe';
    args = ['/d', '/s', '/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function run(args = process.argv.slice(2), dependencies = {}) {
  if (args[0] === 'connect') return require('./cloud/connect-cli').runConnect(args.slice(1), dependencies);
  if (args[0] === 'correlate') return require('./correlation-cli').runCorrelationCli(args.slice(1), dependencies);
  const options = parseArgs(args);
  const output = dependencies.output || console;
  if (options.help) {
    output.log(HELP.trim());
    return null;
  }

  const projectRoot = findProjectRoot(options.projectRoot || process.cwd(), {
    searchParents: !options.projectRoot,
  });
  const config = loadConfig({
    host: options.host,
    port: options.port,
    openBrowser: options.openBrowser,
  });
  if (options.action) {
    const visibleHost = config.host === '::1' ? '[::1]' : config.host;
    const base = `http://${visibleHost}:${config.port}`;
    let result;
    if (options.action === 'observe-codex') {
      const observer = new CodexSessionObserver(projectRoot, { url: `${base}/events`, agentId: options.agentId, sessionId: options.sessionId });
      result = options.once ? await observer.scan() : await observer.start();
      output.log(JSON.stringify(result));
      if (!options.once && dependencies.handleSignals !== false) {
        const stop = async () => { await observer.stop(); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
      }
      return observer;
    } else if (options.action === 'hook') {
      await observeHook(projectRoot, options.producerHost, { url: `${base}/events`, input: dependencies.input });
      output.log('{}');
      return {};
    } else if (options.action === 'hooks') {
      result = options.install ? installHooks(projectRoot, options.producerHost) : hookConfiguration(projectRoot, options.producerHost);
    } else if (options.action === 'status') {
      const response = await fetch(`${base}/api/snapshot`, { signal: globalThis.AbortSignal.timeout(2000) });
      if (!response.ok) throw new Error(`Office status failed: HTTP ${response.status}`);
      result = await response.json();
    } else {
      if (!options.file || !options.producerHost) throw new Error('emit requires --file and --producer-host');
      let source;
      if (options.file === '-') {
        source = await readHookInput(dependencies.input || process.stdin, config.maxEventBytes);
      } else {
        if (fs.statSync(options.file).size > config.maxEventBytes) throw new Error('Event file exceeds payload limit');
        source = JSON.parse(fs.readFileSync(options.file, 'utf8'));
      }
      result = await submitEvent(projectRoot, { ...source, host: options.producerHost, evidence: 'manual' },
        { url: `${base}/events`, queue: options.queue });
    }
    output.log(JSON.stringify(result));
    return result;
  }
  const createServer = dependencies.createServer || createVirtualOfficeServer;
  const office = createServer({ projectRoot, config });
  const address = await office.start();
  const visibleHost = config.host === '::1' ? '[::1]' : config.host;
  const url = `http://${visibleHost}:${address.port}`;
  if (options.observeCodex) {
    const observer = new CodexSessionObserver(projectRoot, { url: `${url}/events`, agentId: options.agentId, sessionId: options.sessionId });
    await observer.start();
    const stopOffice = office.stop;
    office.stop = async () => { await observer.stop(); await stopOffice(); };
  }
  const readiness = {
    status: 'ready',
    url,
    project: path.basename(projectRoot),
    squads: office.catalog.squadCount,
    agents: office.catalog.agentCount,
    aiApiRequired: false,
    controlPlane: false,
  };

  if (options.json) {
    output.log(JSON.stringify(readiness));
  } else {
    output.log('AEXOS Virtual Office is ready');
    output.log(`  ${readiness.squads} squads · ${readiness.agents} registered agents`);
    output.log(`  ${url}`);
    output.log('  Local telemetry only · observability mode');
    output.log('Press Ctrl+C to stop.');
  }

  if (config.openBrowser) {
    (dependencies.openBrowser || openBrowser)(url);
  }

  if (dependencies.handleSignals !== false) {
    const shutdown = async () => {
      await office.stop();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }

  return office;
}

module.exports = {
  HELP,
  findProjectRoot,
  openBrowser,
  parseArgs,
  run,
};

if (require.main === module) {
  run().catch((error) => { console.error(`Virtual Office: ${error.message}`); process.exitCode = 1; });
}
