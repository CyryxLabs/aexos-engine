'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ContextManager = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/orchestration/context-manager',
));

describe('ContextManager terminal failure persistence', () => {
  let tempDir;
  let manager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-context-failure-'));
    manager = new ContextManager('sticky-failure', tempDir);
    await manager.initialize();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('does not reset a failed workflow or emit a handoff for later phase output', async () => {
    await manager.markFailed('phase 1 failed', 1);
    await manager.savePhaseOutput(
      2,
      { result: { success: true, status: 'success' } },
      { handoffTarget: { phase: 3, agent: 'qa' } },
    );

    const state = await fs.readJson(manager.statePath);
    expect(state.status).toBe('failed');
    expect(state.error).toBe('phase 1 failed');
    expect(state.failedPhase).toBe(1);
    expect(state.phases['2']).toEqual(expect.objectContaining({
      blockedByWorkflowFailure: true,
      handoff: null,
    }));
    expect(await fs.pathExists(
      path.join(manager.handoffDir, 'sticky-failure-phase-2.handoff.json'),
    ))
      .toBe(false);
  });

  it('serializes concurrent failure then success mutations without losing terminal state', async () => {
    await Promise.all([
      manager.markFailed('parallel phase failed', 1),
      manager.savePhaseOutput(
        2,
        { result: { success: true, status: 'success' } },
        { handoffTarget: { phase: 3, agent: 'qa' } },
      ),
    ]);

    const state = await fs.readJson(manager.statePath);
    expect(state.status).toBe('failed');
    expect(state.failedPhase).toBe(1);
    expect(state.phases['2'].handoff).toBeNull();
  });

  it('revokes a previously written handoff when a later parallel failure becomes terminal', async () => {
    await manager.savePhaseOutput(
      1,
      { result: { success: true, status: 'success' } },
      { handoffTarget: { phase: 2, agent: 'qa' } },
    );
    const handoffPath = path.join(
      manager.handoffDir,
      'sticky-failure-phase-1.handoff.json',
    );
    expect(await fs.pathExists(handoffPath)).toBe(true);

    await manager.markFailed('parallel sibling failed', 2);

    const state = await fs.readJson(manager.statePath);
    expect(state.status).toBe('failed');
    expect(state.phases['1']).toEqual(expect.objectContaining({
      blockedByWorkflowFailure: true,
      handoff: null,
      blockedHandoff: expect.objectContaining({
        from: expect.objectContaining({ phase: 1 }),
      }),
    }));
    expect(await fs.pathExists(handoffPath)).toBe(false);
  });
});
