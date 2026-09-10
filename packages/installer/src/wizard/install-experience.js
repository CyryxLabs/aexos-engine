'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { stripVTControlCharacters } = require('util');
const { renderPanel, visibleWidth, getWelcomeLayout, renderIllustratedWelcome } = require('../utils/aexos-banner');
const { colors } = require('../utils/aexos-colors');
const { getCyryxCoreVersion, getCyryxCorePackageRoot } = require('../utils/package-paths');
const { IDE_CONFIGS } = require('../config/ide-configs');

const INSTALL_STEPS = ['Configure', 'Install', 'Connect', 'Verify'];
function stripTerminalControls(value) {
  // Remove terminal commands, including OSC hyperlinks, before rendering paths.
  // eslint-disable-next-line no-control-regex
  return stripVTControlCharacters(String(value)).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

function getTerminalCapabilities(options = {}) {
  const output = options.output || process.stdout;
  const env = options.env || process.env;
  const plain = options.plain ?? (!output.isTTY || 'NO_COLOR' in env || env.TERM === 'dumb');
  return { plain, width: Math.max(24, Math.min(options.width || output.columns || 80, 120)) };
}

function wrapText(value, width) {
  const lines = [];
  for (const paragraph of stripTerminalControls(value).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      if (line && visibleWidth(`${line} ${word}`) > width) {
        lines.push(line);
        line = '';
      }
      for (const character of `${line ? ' ' : ''}${word}`) {
        if (visibleWidth(line + character) > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function renderInstallPanel(title, lines, options = {}) {
  const capabilities = getTerminalCapabilities(options);
  const plain = capabilities.plain;
  // Shared renderPanel limits frames to 100 columns; match its content width.
  const width = plain ? capabilities.width : Math.min(capabilities.width, 100);
  const body = lines.flatMap((line) => wrapText(line, width - 6));
  const heading = wrapText(title, width - 8);
  if (plain) return [...heading, ...body.map((line) => `  ${line}`)].join('\n');
  return renderPanel(heading[0], [...heading.slice(1), ...body], { width });
}

function showInstallStep(index, lines = []) {
  const heading = `${String(index + 1).padStart(2, '0')} / ${INSTALL_STEPS.length}  ${INSTALL_STEPS[index]}`;
  const { plain, width } = getTerminalCapabilities();
  console.log(`\n${plain ? heading : colors.primary(heading)}`);
  for (const line of lines) console.log(wrapText(line, width - 2).map((part) => `  ${part}`).join('\n'));
}

function renderInstallWelcome(options = {}) {
  const { width, plain } = getTerminalCapabilities(options);
  const metadata = readInstallWelcomeMetadata(options.projectRoot || process.cwd());
  const heading = `AEXOS ${metadata.version}`;
  const rail = width < 60 ? 'Configure > Install > Connect > Verify' : '01 Configure   02 Install   03 Connect   04 Verify';
  const count = (key) => Number.isInteger(metadata.counts[key]) ? `${metadata.counts[key]} ${metadata.counts[key] === 1 ? key.slice(0, -1) : key}` : `${key}: unavailable`;
  if (plain) {
    return [heading, 'Workspace setup / Cyryx Labs',
      ...wrapText(`Included in this package: ${count('agents')} / ${count('tasks')}`, width),
      ...wrapText(`Target: ${metadata.projectRoot}`, width), '', rail,
    ].join('\n');
  }
  const height = options.height ?? process.stdout.rows;
  const layout = getWelcomeLayout(width, height);
  const rows = [
    ...(layout.stacked ? [{ text: `${heading} / Cyryx Labs`, tone: 'heading' }] : [
      { text: 'Workspace setup / Cyryx Labs', tone: 'heading' },
      { text: heading, tone: 'muted' },
    ]),
    ...(!layout.compact ? [{ text: '' }] : []),
    { text: 'INCLUDED IN THIS PACKAGE', tone: 'heading' },
    { text: `${count('agents')} / ${count('tasks')}` },
    { text: `${count('workflows')} / ${count('templates')}` },
    ...(!layout.compact ? [{ text: '' }] : []),
    { text: 'TARGET WORKSPACE', tone: 'heading' },
    { text: metadata.projectRoot },
    ...(layout.stacked ? [{ text: 'Host setup: local files only.', tone: 'muted' }] : [
      { text: 'HOST SETUP: choose next.', tone: 'heading' },
      { text: 'No provider session is started.', tone: 'muted' },
    ]),
  ].flatMap((row) => wrapText(row.text, layout.contentWidth).map((text) => ({ ...row, text })));
  return [renderIllustratedWelcome(rows, { width, height, colorLevel: options.colorLevel }), '', rail].join('\n');
}

/** Read only the executing package's inventory, never a workspace's agent count. */
function readInstallWelcomeMetadata(projectRoot = process.cwd()) {
  let version = 'version unavailable';
  let counts = {};
  try {
    const packageRoot = getCyryxCorePackageRoot();
    version = getCyryxCoreVersion() || version;
    counts = readInstalledCounts(packageRoot);
  } catch {
    // The welcome cannot prevent diagnostics when package metadata is missing.
  }
  return { version: stripTerminalControls(version), counts, projectRoot: stripTerminalControls(projectRoot) };
}

function hostLabel(hosts = []) {
  return hosts.length ? hosts.map((id) => IDE_CONFIGS[id]?.name || id).join(', ') : 'CLI only';
}

function renderInstallPlan(answers, options = {}) {
  return renderInstallPanel(options.dryRun ? 'Installation preview' : 'Review installation', [
    `Target: ${answers.projectRoot || process.cwd()}`,
    `Version: ${getCyryxCoreVersion() || 'unavailable'}`,
    `Profile: ${answers.userProfile === 'bob' ? 'Assisted - guided by Bob' : 'Advanced - direct agent control'}`,
    `Project: ${answers.projectType === 'greenfield' ? 'New project' : 'Existing project'}`,
    `Hosts: ${hostLabel(answers.selectedIDEs)}`,
    `Preset: ${answers.selectedTechPreset || 'none'}`,
    ...(answers.template && answers.template !== 'default' ? [`Requested template: ${answers.template} (compatibility alias; standard installation)`] : []),
    `Dependencies: install framework requirements; ${answers.skipInstall ? 'skip project dependencies (--skip-install)' : 'install project dependencies when package.json exists'}.`,
    `Existing config: ${answers.forceMerge && !answers.noMerge ? 'merge supported files' : answers.nonInteractive ? (answers.projectType === 'brownfield' && !answers.noMerge ? 'merge supported files; overwrite other generated config' : 'overwrite generated configuration') : answers.noMerge ? 'merge disabled; ask before replacing existing configuration' : 'ask how to handle existing configuration'}.`,
    'Host files configure local integration; they do not sign in or start a provider.',
  ], options);
}

function createCancellationError() {
  const error = new Error('Installation cancelled');
  error.code = 'AEXOS_INSTALL_CANCELLED';
  error.exitCode = 130;
  return error;
}

/** Numbered keyboard fallback: no ANSI or cursor manipulation, even on a TTY. */
async function promptPlainQuestions(questions, initial = {}, options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const width = getTerminalCapabilities({ ...options, output }).width;
  const write = (value) => output.write(`${wrapText(value, width).join('\n')}\n`);
  const answers = { ...initial };
  const rl = readline.createInterface({ input, output, terminal: false });
  try {
    for (const question of questions) {
      const choices = (question.choices || []).filter((choice) => choice.type !== 'separator');
      const defaultValue = typeof question.default === 'function' ? await question.default(answers) : question.default;
      let selected = defaultValue;
      if (question.type === 'list' && Number.isInteger(defaultValue)) selected = choices[defaultValue]?.value;
      if (question.type === 'checkbox' && !Array.isArray(selected)) selected = choices.filter((c) => c.checked).map((c) => c.value);
      write(`\n${stripTerminalControls(question.message)}`);
      choices.forEach((choice, index) => write(`${index + 1}. ${stripTerminalControls(choice.name || choice.label || choice)}${(Array.isArray(selected) ? selected.includes(choice.value) : selected === choice.value) ? ' [selected]' : ''}`));
      for (;;) {
        if (question.type === 'checkbox') write('Separate numbers with commas. 0 clears.');
        const hint = question.type === 'confirm' ? `Continue? ${defaultValue ? '[Y/n]' : '[y/N]'} ` : 'Choice (Enter keeps selection): ';
        const raw = await new Promise((resolve, reject) => {
          const onClose = () => reject(createCancellationError());
          rl.once('close', onClose);
          rl.question(hint, (value) => { rl.removeListener('close', onClose); resolve(value.trim()); });
        });
        let value = selected;
        if (raw.toLowerCase() === 'q') throw createCancellationError();
        if (question.type === 'confirm') value = raw ? /^(y|yes|n|no)$/i.test(raw) ? /^(y|yes)$/i.test(raw) : undefined : Boolean(defaultValue);
        else if (question.type === 'checkbox' && raw) {
          const numbers = raw === '0' ? [] : raw.split(/[\s,]+/).map(Number);
          value = numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= choices.length) ? [...new Set(numbers)].map((n) => choices[n - 1].value) : undefined;
        } else if (question.type === 'list' && raw) value = choices[Number(raw) - 1]?.value;
        else if (!['list', 'checkbox', 'confirm'].includes(question.type)) value = raw || defaultValue;
        const validation = value === undefined ? 'Choose a listed number.' : question.validate ? await question.validate(value, answers) : true;
        if (validation === true) { answers[question.name] = value; break; }
        output.write(`  ${stripTerminalControls(validation || 'Invalid choice.')}\n`);
      }
    }
    return answers;
  } finally {
    rl.close();
  }
}

function readInstalledCounts(projectRoot) {
  const counts = {};
  for (const [name, extension] of [['agents', '.md'], ['tasks', '.md'], ['workflows', '.yaml'], ['templates', null]]) {
    const directory = path.join(projectRoot, '.aexos-core', 'development', name);
    try {
      counts[name] = fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && (!extension || entry.name.endsWith(extension))).length;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error(`Could not inspect installed ${name}: ${error.message}`);
      counts[name] = null;
    }
  }
  return counts;
}

function getInstallOutcome(answers = {}) {
  const failures = [];
  const hosts = answers.selectedIDEs || [];
  for (const [key, label] of [['cyryxCoreInstalled', 'Framework files'], ['envConfigured', 'Project configuration'], ['depsInstalled', 'Dependencies']]) {
    if (answers[key] === false) failures.push(label);
  }
  if (answers.ideConfigResult?.success === false) failures.push('Host configuration');
  if (hosts.length && (answers.ideSyncStatus === 'failed' || answers.ideSyncValidation === 'failed')) failures.push('Host projection sync');
  if (hosts.includes('codex') && (answers.codexSkillsStatus === 'failed' || answers.codexSkillsSkipped === true)) failures.push('Codex skills');
  if (hosts.includes('claude-code') && answers.settingsGenerated === false) failures.push('Claude settings');
  const status = answers.validationResult?.overallStatus;
  if (!['success', 'warning'].includes(status)) failures.push('Installation verification');
  return { success: failures.length === 0, failures, warnings: answers.validationResult?.warnings?.length || 0 };
}

function renderInstallCompletion(answers = {}, options = {}) {
  const outcome = getInstallOutcome(answers);
  const hosts = answers.selectedIDEs || [];
  const counts = answers.installedCounts || {};
  const projectRoot = options.projectRoot || answers.projectRoot || process.cwd();
  const lines = [
    `Project: ${projectRoot}`,
    `Hosts: ${hostLabel(hosts)}`,
    `Installed: ${counts.agents ?? '?'} agents / ${counts.tasks ?? '?'} tasks / ${counts.workflows ?? '?'} workflows / ${counts.templates ?? '?'} templates`,
    outcome.success ? `Verification: passed${outcome.warnings ? ` with ${outcome.warnings} warning(s)` : ''}` : `Needs attention: ${outcome.failures.join(', ')}`,
    ...(outcome.warnings ? ['', 'Warnings:', ...(answers.validationResult.warnings || []).map((warning) => `- ${typeof warning === 'string' ? warning : warning.message || warning.description || warning.type || 'See verification details above.'}`)] : []),
  ];
  const changeDirectory = answers.invocationCwd && path.resolve(answers.invocationCwd) !== path.resolve(projectRoot);
  const quote = (value) => process.platform === 'win32' ? `'${value.replace(/'/g, "''")}'` : `'${value.replace(/'/g, "'\\''")}'`;
  // Commands remain single logical lines so terminal soft wrapping is copyable.
  // Do not turn control-bearing paths into a different executable command.
  const safeTarget = stripTerminalControls(projectRoot) === projectRoot;
  const commands = [
    '', outcome.success ? 'Next steps' : 'Recovery',
    ...(changeDirectory && safeTarget ? [process.platform === 'win32' ? `Set-Location -LiteralPath ${quote(projectRoot)}` : `cd -- ${quote(projectRoot)}`] : []),
    ...(changeDirectory && !safeTarget ? ['Open a terminal in the target directory shown above.'] : []),
    'npx @aexos/core doctor',
    ...(!outcome.success ? ['Resolve the reported issue, then retry in this directory:', 'npx @aexos/core install'] : []),
    ...(hosts.includes('codex') ? ['Codex: /skills > aexos-master > *help'] : []),
    ...(hosts.includes('claude-code') ? ['Claude Code: /aexos-master > *help'] : []),
    '',
    ...wrapText('Host execution is verified separately. No provider session was started.', getTerminalCapabilities(options).width),
  ];
  return [renderInstallPanel(outcome.success ? 'AEXOS installed' : 'Installation needs attention', lines, options), ...commands].join('\n');
}

module.exports = { wrapText, renderInstallPanel, showInstallStep, readInstalledCounts, getInstallOutcome, renderInstallCompletion, getTerminalCapabilities, stripTerminalControls, renderInstallWelcome, renderInstallPlan, promptPlainQuestions, createCancellationError };
