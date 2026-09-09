'use strict';

const { PassThrough } = require('stream');
const { promptPlainQuestions } = require('../../packages/installer/src/wizard/install-experience');
const { getReviewQuestion, withQuestionDefaults, getIDEQuestions } = require('../../packages/installer/src/wizard/questions');

function terminalInputs(values) {
  const input = new PassThrough();
  const output = new PassThrough();
  output.columns = 40;
  let transcript = '';
  output.on('data', (buffer) => {
    const text = buffer.toString();
    transcript += text;
    if (/Choice \(Enter keeps selection\): $|Continue\? \[[^\]]+\] $/.test(text)) {
      const value = values.shift();
      setImmediate(() => value === null ? input.end() : input.write(`${value}\n`));
    }
  });
  return { input, output, transcript: () => transcript };
}

describe('Plain installer keyboard interaction', () => {
  test('accepts review with Enter without ANSI or cursor output', async () => {
    const terminal = terminalInputs(['']);
    const result = await promptPlainQuestions([getReviewQuestion()], {}, terminal);
    expect(result.reviewAction).toBe('install');
    expect(terminal.transcript()).not.toContain('\x1b');
  });

  test('edits checkbox selection to CLI only and preserves that default', async () => {
    const terminal = terminalInputs(['0', '']);
    const initial = await promptPlainQuestions(getIDEQuestions(), {}, terminal);
    expect(initial.selectedIDEs).toEqual([]);
    const updated = await promptPlainQuestions(withQuestionDefaults(getIDEQuestions(), initial), {}, terminal);
    expect(updated.selectedIDEs).toEqual([]);
    expect(terminal.transcript()).not.toContain('\x1b');
  });

  test('rejects unlisted numbers before accepting cancel', async () => {
    const terminal = terminalInputs(['99', '3']);
    expect(await promptPlainQuestions([getReviewQuestion()], {}, terminal)).toMatchObject({ reviewAction: 'cancel' });
    expect(terminal.transcript()).toContain('Choose a listed number.');
  });

  test.each(['q', null])('closed or cancelled input %s rejects with the cancellation code', async (value) => {
    const terminal = terminalInputs([value]);
    await expect(promptPlainQuestions([getReviewQuestion()], {}, terminal)).rejects.toMatchObject({ code: 'AEXOS_INSTALL_CANCELLED', exitCode: 130 });
  });
});
