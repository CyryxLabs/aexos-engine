'use strict';

const { normalizeEvent } = require('../../../.aexos-core/core/virtual-office/event-normalizer');
const { VirtualOfficeProjector } = require('../../../.aexos-core/core/virtual-office/state-projector');

function catalog() {
  return {
    version: '1.0.0',
    squadCount: 1,
    agentCount: 2,
    squads: [{
      id: 'engineering',
      name: 'Engineering',
      domain: 'software',
      description: 'Builds the system',
      entryAgent: 'dev',
      agents: [
        { key: 'engineering/dev', id: 'dev', name: 'Vulcan', title: 'Developer', squadId: 'engineering' },
        { key: 'engineering/qa', id: 'qa', name: 'Argus', title: 'QA', squadId: 'engineering' },
      ],
    }],
  };
}

describe('Virtual Office event projection', () => {
  it('allowlists event metadata and removes raw prompts, environment, and results', () => {
    const normalized = normalizeEvent({
      id: 'evt-1',
      type: 'CommandStart',
      timestamp: 1000,
      cyryx_agent: '@dev',
      data: {
        command: '*develop',
        task: 'Implement the story',
        prompt: 'private prompt',
        env: { TOKEN: 'secret' },
        result: 'unbounded output',
      },
    }, 2000);

    expect(normalized.data).toMatchObject({ agentId: 'dev', command: '*develop', task: 'Implement the story' });
    expect(normalized.data).not.toHaveProperty('prompt');
    expect(normalized.data).not.toHaveProperty('env');
    expect(normalized.data).not.toHaveProperty('result');
    expect(normalized.state).toBe('running');
  });

  it('redacts credential-shaped values from accepted text fields', () => {
    const normalized = normalizeEvent({
      type: 'CommandError',
      timestamp: 1000,
      agent: 'dev',
      data: { error: 'token=top-secret-value Bearer abc.def.ghi' },
    }, 1000);
    expect(normalized.data.message).toBe('token=[REDACTED] Bearer [REDACTED]');
  });

  it('projects only explicitly public collaboration text into the meeting transcript', () => {
    const normalized = normalizeEvent({
      id: 'meeting-message-1',
      type: 'AgentCollaborationMessage',
      timestamp: 1000,
      agent: 'dev',
      data: {
        storyId: 'AEX-3.6',
        public_message: 'Argus, I finished the route. token=private-value',
        prompt: 'never expose this prompt',
        tool_output: 'never expose tool output',
      },
    }, 1000);

    expect(normalized.state).toBe(null);
    expect(normalized.data.collaborationMessage)
      .toBe('Argus, I finished the route. token=[REDACTED]');
    expect(normalized.data).not.toHaveProperty('prompt');
    expect(normalized.data).not.toHaveProperty('tool_output');

    const projector = new VirtualOfficeProjector(catalog());
    projector.apply(normalized);
    expect(projector.getSnapshot().events[0]).toMatchObject({
      type: 'AgentCollaborationMessage',
      storyId: 'AEX-3.6',
      collaborationMessage: 'Argus, I finished the route. token=[REDACTED]',
    });
  });

  it('clamps far-future timestamps to receipt time to prevent ghost leases', () => {
    const normalized = normalizeEvent({
      type: 'CommandStart',
      timestamp: 9999999999999,
      agent: 'dev',
    }, 5000);
    expect(normalized.timestamp).toBe(5000);
  });

  it.each([
    ['AgentActivated', {}, 'assigned'],
    ['AgentCollaborationMessage', { public_message: 'Working together' }, null],
    ['CommandStart', {}, 'running'],
    ['AgentWaiting', {}, 'waiting'],
    ['AgentBlocked', {}, 'blocked'],
    ['CommandComplete', { success: true }, 'completed'],
    ['CommandComplete', { success: false }, 'failed'],
    ['AgentOffline', {}, 'offline'],
    ['AgentDeactivated', {}, 'offline'],
  ])('maps %s to the explicit projected state', (type, data, expected) => {
    const normalized = normalizeEvent({ type, timestamp: 1000, agent: 'dev', data }, 2000);
    expect(normalized.state).toBe(expected);
  });

  it('supports explicit state-change envelopes', () => {
    expect(normalizeEvent({
      type: 'AgentStateChange',
      timestamp: 1000,
      agent: 'dev',
      data: { status: 'waiting' },
    }).state).toBe('waiting');
  });

  it('does not treat a Codex turn ending as proof of task success', () => {
    const event = normalizeEvent({ type: 'CommandComplete', host: 'codex',
      evidence: 'local-session-log', agentId: 'dev', sessionId: 'session-1', runId: 'turn-1' });
    expect(event.state).toBe('available');
    expect(event.data.success).toBeUndefined();
    const projector = new VirtualOfficeProjector(catalog());
    projector.apply(event);
    expect(projector.getSnapshot().events[0].state).toBe('available');
  });

  it.each([
    [{ host: 'codex', evidence: 'local-session-log', success: true }, 'completed'],
    [{ host: 'codex', evidence: 'local-session-log', success: false }, 'failed'],
    [{ host: 'cli', evidence: 'runtime' }, 'completed'],
  ])('preserves completion semantics for other outcomes and sources', (data, state) => {
    expect(normalizeEvent({ type: 'CommandComplete', ...data }).state).toBe(state);
  });

  it('accepts the nested envelope emitted by DashboardEmitter', () => {
    const normalized = normalizeEvent({
      type: 'CommandStart',
      timestamp: 1000,
      data: {
        agentId: 'dev',
        command: '*develop',
        session_id: 'session-1',
        cyryx_agent: 'dev',
        cyryx_story_id: 'AEX-3.6',
      },
    }, 1000);
    expect(normalized.data).toMatchObject({
      agentId: 'dev',
      command: '*develop',
      sessionId: 'session-1',
      storyId: 'AEX-3.6',
    });
  });

  it('rejects unknown event types and malformed payloads', () => {
    expect(() => normalizeEvent(null)).toThrow(/JSON object/i);
    expect(() => normalizeEvent({ type: 'InventedActivity' })).toThrow(/unsupported event type/i);
  });

  it('starts every catalog agent as offline and only promotes observed agents', () => {
    const projector = new VirtualOfficeProjector(catalog(), { projectName: 'AEXOS' });
    expect(projector.getCounts()).toMatchObject({ total: 2, offline: 2, running: 0 });

    projector.apply(normalizeEvent({
      id: 'run-1',
      type: 'CommandStart',
      timestamp: 1000,
      cyryx_agent: 'dev',
      data: { command: '*develop', storyId: 'AEX-3.6' },
    }, 1000));

    expect(projector.getCounts()).toMatchObject({ offline: 1, running: 1 });
    expect(projector.getSnapshot().squads[0].agents.find((agent) => agent.id === 'dev'))
      .toMatchObject({ state: 'running', command: '*develop', storyId: 'AEX-3.6' });
  });

  it('expires active leases to stale and recent terminal states to available', () => {
    const projector = new VirtualOfficeProjector(catalog(), {
      heartbeatTtlMs: 1000,
      recentCompletionMs: 500,
    });
    projector.apply(normalizeEvent({ id: 'run', type: 'CommandStart', timestamp: 1000, agent: 'dev' }, 1000));
    projector.tick(2001);
    expect(projector.getCounts().stale).toBe(1);

    projector.apply(normalizeEvent({
      id: 'complete',
      type: 'CommandComplete',
      timestamp: 3000,
      agent: 'dev',
      data: { success: true },
    }, 3000));
    expect(projector.getCounts().completed).toBe(1);
    projector.tick(3501);
    expect(projector.getCounts().available).toBe(1);
  });

  it('deduplicates IDs, bounds history, and ignores state regression from old events', () => {
    const projector = new VirtualOfficeProjector(catalog(), { eventHistoryLimit: 2 });
    const newest = normalizeEvent({ id: 'new', type: 'CommandStart', timestamp: 3000, agent: 'dev' }, 3000);
    expect(projector.apply(newest).duplicate).toBe(false);
    expect(projector.apply(newest).duplicate).toBe(true);
    projector.apply(normalizeEvent({ id: 'old', type: 'AgentDeactivated', timestamp: 1000, agent: 'dev' }, 3000));
    projector.apply(normalizeEvent({ id: 'third', type: 'SessionStart', timestamp: 4000 }, 4000));
    expect(projector.getCounts().running).toBe(1);
    expect(projector.getSnapshot().events).toHaveLength(2);
    expect(projector.getSnapshot().events.find((event) => event.id === 'old').ignoredReason)
      .toBe('out-of-order');
  });
});
