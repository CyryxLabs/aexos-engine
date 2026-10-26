'use strict';

const path = require('path');
const { readCorrelationFile, correlationGraph, stableStringify } = require('./correlation');

const HELP = 'aexos office correlate --file <project-relative.json> --project-root <path> [--run-id <uuid>] [--story-id <id>] [--limit <1..512>] [--format json|graph]';
async function runCorrelationCli(args, dependencies = {}) {
  const output = dependencies.output || console;
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { output.log(HELP); return null; }
  const options = { projectRoot: process.cwd(), format: 'json' };
  const flags = { '--file': 'file', '--project-root': 'projectRoot', '--run-id': 'runId',
    '--story-id': 'storyId', '--limit': 'limit', '--format': 'format' };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!Object.hasOwn(flags, flag) || seen.has(flag) || !value || value.startsWith('-')) {
      throw Object.assign(new Error('Unsupported correlation option; this command is read-only.'), { code: 'CORRELATION_OPTION_DENIED' });
    }
    seen.add(flag); options[flags[flag]] = value;
  }
  if (!options.file || !['json', 'graph'].includes(options.format)
    || (options.limit !== undefined && !/^[0-9]{1,3}$/.test(options.limit))) {
    throw Object.assign(new Error(HELP), { code: 'CORRELATION_OPTIONS_INVALID' });
  }
  options.projectRoot = path.resolve(options.projectRoot);
  if (options.limit !== undefined) options.limit = Number(options.limit);
  const model = await readCorrelationFile(options.file, options);
  const result = options.format === 'graph' ? correlationGraph(model) : model;
  output.log(stableStringify(result));
  return result;
}

module.exports = { runCorrelationCli, HELP };
