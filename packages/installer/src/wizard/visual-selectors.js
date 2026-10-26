'use strict';

const path = require('path');
const chalk = require('chalk');
const { wrapText, stripTerminalControls } = require(path.join(__dirname, 'install-experience'));
const { visibleWidth, BRAND } = require(path.join(__dirname, '..', 'utils', 'aexos-banner'));

/**
 * @typedef {object} SelectorProps
 * @property {object} prompt Inquirer list or checkbox instance; input handling stays upstream.
 * @property {boolean} multiple Whether choices can be toggled independently.
 * @property {string} [error] Current validation feedback.
 */

function selectorColors() {
  // ANSI terminals retain contrast without approximating a dark teal as black.
  return chalk.level >= 3
    ? { focus: chalk.bgHex(BRAND.coreTeal).white.bold, accent: chalk.hex(BRAND.tealGlow), text: chalk.hex(BRAND.silver), rule: chalk.hex(BRAND.steel) }
    : { focus: chalk.bgCyan.black.bold, accent: chalk.cyanBright, text: chalk.white, rule: chalk.gray };
}

/** Render only. Defaults, navigation, submission and validation remain Inquirer's. */
function renderSelector({ prompt, multiple, error }) {
  const width = Math.max(24, Math.min(prompt.rl.output.columns || process.stdout.columns || 80, 100)) - 1;
  const inner = width - 2;
  const p = selectorColors();
  const choices = prompt.opt.choices;
  const focused = choices.getChoice(multiple ? prompt.pointer : prompt.selected);
  const checked = choices.filter((choice) => choice.type !== 'separator' && !choice.disabled && choice.checked);
  const lines = wrapText(stripTerminalControls(prompt.opt.message), width - 2).map((line, i) => `${i ? '  ' : '? '}${p.text(chalk.bold(line))}`);

  if (prompt.status === 'answered') {
    const answer = multiple ? checked.map((choice) => choice.short).join(', ') || (prompt.opt.name === 'selectedIDEs' ? 'CLI only' : 'None selected') : focused.short;
    lines.push(...wrapText(`Selected: ${answer}`, width - 2).map((line) => `  ${p.accent(line)}`));
    prompt.screen.render(lines.join('\n'));
    return;
  }

  const hint = multiple ? '↑↓ Move   Space Toggle   Enter Continue' : '↑↓ Move   Enter Choose';
  lines.push(...wrapText(hint, width - 2).map((line) => `  ${p.accent(line)}`));
  lines.push(...wrapText(multiple ? 'A All/none   Ctrl+C Cancel' : 'Ctrl+C Cancel', width - 2).map((line) => `  ${p.rule(line)}`));

  const rows = [];
  let activeStart = 0;
  let activeEnd = 0;
  choices.forEach((choice) => {
    const isFocused = choice === focused;
    const unavailable = choice.type === 'separator' || choice.disabled;
    const name = choice.type === 'separator' ? String(choice) : choice.short || choice.name;
    const marker = unavailable ? '  - ' : `${isFocused ? '›' : ' '} ${multiple ? choice.checked ? '[x]' : '[ ]' : isFocused ? '(●)' : '( )'} `;
    const label = `${name}${choice.disabled ? ' (unavailable)' : ''}`;
    if (isFocused) activeStart = rows.length;
    wrapText(label, inner - 8).forEach((line, index) => {
      const body = ` ${index ? ' '.repeat(marker.length) : marker}${line}`;
      const padded = body + ' '.repeat(Math.max(0, inner - visibleWidth(body)));
      rows.push(p.rule('│') + (isFocused ? p.focus(padded) : unavailable ? p.rule(padded) : p.text(padded)) + p.rule('│'));
    });
    if (isFocused) activeEnd = rows.length;
  });

  // Budget actual rendered rows, including narrow-terminal wrapping and hints.
  const detail = focused.description ? wrapText(focused.description, width - 4) : [];
  const footer = multiple
    ? `${checked.length} selected${prompt.opt.name === 'selectedIDEs' ? checked.length ? ' · clear for CLI only' : ' · CLI only' : ''}`
    : `Choose one · ${choices.realLength} options`;
  const footerLines = wrapText(footer, width - 2);
  const errorLines = error ? wrapText(`Error: ${error}`, width - 2) : [];
  const budget = Math.max(3, (prompt.rl.output.rows || process.stdout.rows || 24) - lines.length - detail.length - footerLines.length - errorLines.length - 6);
  const start = Math.max(0, Math.min(activeStart, activeEnd - budget, rows.length - budget));
  const end = Math.min(rows.length, start + budget);
  lines.push(p.rule(`╭${'─'.repeat(inner)}╮`), ...rows.slice(start, end), p.rule(`╰${'─'.repeat(inner)}╯`));
  if (rows.length > budget) lines.push(p.rule(`  ${start > 0 ? '↑ More above' : ''}${start > 0 && end < rows.length ? ' · ' : ''}${end < rows.length ? '↓ More below' : ''}`));
  lines.push(...footerLines.map((line) => `  ${p.accent(line)}`));
  lines.push(...detail.map((line) => `  ${p.text(line)}`));
  prompt.screen.render(lines.join('\n'), errorLines.map((line) => `  ${chalk.red(line)}`).join('\n'));
}

/** A scoped registry: other Inquirer consumers keep their own prompt renderers. */
function createVisualPrompt(inquirer) {
  const promptModule = inquirer.createPromptModule();
  class VisualList extends promptModule.prompts.list {
    render() { renderSelector({ prompt: this, multiple: false }); }
  }
  class VisualCheckbox extends promptModule.prompts.checkbox {
    render(error) { renderSelector({ prompt: this, multiple: true, error }); }
  }
  promptModule.registerPrompt('list', VisualList);
  promptModule.registerPrompt('checkbox', VisualCheckbox);
  return promptModule;
}

module.exports = { createVisualPrompt };
