'use strict';

const { initializeDecisionLogging, recordDecision, getCurrentContext } = require('../../.aexos-core/development/scripts/decision-recorder');

test('disabling a new decision session detaches the previous session', async () => {
  const previous = await initializeDecisionLogging('dev', 'previous-story.md', { enabled: true });
  recordDecision({ description: 'previous', reason: 'fixture' });
  expect(previous.decisions).toHaveLength(1);
  expect(await initializeDecisionLogging('qa', 'private-story.md', { enabled: false })).toBeNull();
  expect(getCurrentContext()).toBeNull();
  expect(recordDecision({ description: 'must not leak', reason: 'disabled' })).toBeNull();
  expect(previous.decisions).toHaveLength(1);
});
