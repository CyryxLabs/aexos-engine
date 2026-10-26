'use strict';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const SubagentDispatcher = require('../../../.aexos-core/core/execution/subagent-dispatcher');

test('legacy CLI retains native permissions and times out even without close event', async () => {
  jest.useFakeTimers();
  const child = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), { write: jest.fn(), end: jest.fn() });
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  spawn.mockReturnValue(child);
  const dispatcher = new SubagentDispatcher({ claudeTimeout: 20 });
  const result = dispatcher.executeClaude('bounded task');
  const rejection = expect(result).rejects.toThrow('timed out');
  expect(spawn.mock.calls[0][1]).toEqual(['--print']);
  jest.advanceTimersByTime(21);
  await rejection;
  expect(child.kill).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
