'use strict';

const path = require('path');
const readline = require('readline');
const { PassThrough } = require('stream');
const inquirer = require('inquirer');
const { createVisualPrompt } = require(path.join(__dirname, '..', '..', 'packages', 'installer', 'src', 'wizard', 'visual-selectors'));
const { visibleWidth } = require(path.join(__dirname, '..', '..', 'packages', 'installer', 'src', 'utils', 'aexos-banner'));
const { stripVTControlCharacters } = require('util');

describe('Visual selectors retain Inquirer behavior', () => {
  const interfaces = [];
  function create(question, width = 80, rows = 24) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.columns = width;
    output.rows = rows;
    const rl = readline.createInterface({ input, output, terminal: true });
    interfaces.push(rl);
    const module = createVisualPrompt(inquirer);
    const prompt = new module.prompts[question.type](question, rl, {});
    prompt.screen.render = jest.fn();
    const rendered = () => stripVTControlCharacters(prompt.screen.render.mock.calls.at(-1).join('\n'));
    return { prompt, rendered };
  }
  afterEach(() => interfaces.splice(0).forEach((rl) => rl.close()));

  test('isolates registries and leaves confirm/password and global prompts unchanged', () => {
    const original = inquirer.prompt.prompts.list;
    const first = createVisualPrompt(inquirer);
    const second = createVisualPrompt(inquirer);
    expect(inquirer.prompt.prompts.list).toBe(original);
    expect(first.prompts.list).not.toBe(second.prompts.list);
    expect(first.prompts.confirm).toBe(inquirer.prompt.prompts.confirm);
    expect(first.prompts.password).toBe(inquirer.prompt.prompts.password);
  });

  test('navigates past separators/disabled choices while retaining selected value and detail', () => {
    const { prompt, rendered } = create({ type: 'list', name: 'profile', message: 'Choose profile', default: 'advanced', choices: [
      { name: 'Assisted', value: 'bob', description: 'Guided workflow' },
      new inquirer.Separator(),
      { name: 'Unavailable', value: 'no', disabled: true },
      { name: 'Advanced', value: 'advanced', description: 'Direct agent control' },
    ] });
    prompt.render();
    expect(rendered()).toContain('› (●) Advanced');
    expect(rendered()).toContain('Direct agent control');
    prompt.onUpKey();
    expect(prompt.getCurrentValue()).toBe('bob');
    expect(rendered()).toContain('› (●) Assisted');
    expect(rendered()).toContain('Enter Choose');
  });

  test('distinguishes focus from checked state, supports clearing and answered CLI only', () => {
    const { prompt, rendered } = create({ type: 'checkbox', name: 'selectedIDEs', message: 'Hosts', choices: [
      { name: 'Codex', value: 'codex', checked: true },
      { name: 'Claude', value: 'claude', checked: false },
    ] });
    prompt.onDownKey();
    expect(rendered()).toContain('› [ ] Claude');
    expect(rendered()).toContain('  [x] Codex');
    expect(rendered()).toContain('1 selected');
    prompt.onSpaceKey();
    expect(prompt.getCurrentValue()).toEqual(['codex', 'claude']);
    expect(rendered()).toContain('2 selected');
    prompt.onAllKey();
    expect(prompt.getCurrentValue()).toEqual([]);
    expect(rendered()).toContain('0 selected · CLI only');
    prompt.status = 'answered';
    prompt.render();
    expect(rendered()).toContain('Selected: CLI only');
  });

  test('retains restored checkbox defaults and displays validation errors', () => {
    const { prompt, rendered } = create({ type: 'checkbox', name: 'hosts', message: 'Hosts', default: ['b'], choices: [
      { name: 'Host A', value: 'a' }, { name: 'Host B', value: 'b' },
    ] });
    expect(prompt.getCurrentValue()).toEqual(['b']);
    prompt.onError({ isValid: 'Choose an available host.' });
    expect(rendered()).toContain('Error: Choose an available host.');
  });

  test.each([24, 40, 60, 80, 120])('wraps within %i columns and keeps focused item in a finite viewport', (width) => {
    const { prompt, rendered } = create({ type: 'list', name: 'preset', message: 'Select architecture for 工作區', default: 19, choices: Array.from({ length: 20 }, (_, i) => ({
      name: `Choice ${i} / ${'é團隊'.repeat(4)}`, value: i, description: 'Architecture guidance for the selected technology stack.',
    })) }, width);
    prompt.render();
    expect(rendered()).toContain('› (●) Choice 19');
    expect(rendered()).toContain('More above');
    expect(rendered().split('\n').every((line) => visibleWidth(line) < width)).toBe(true);
    expect(rendered().split('\n').length).toBeLessThanOrEqual(24);
  });
});
