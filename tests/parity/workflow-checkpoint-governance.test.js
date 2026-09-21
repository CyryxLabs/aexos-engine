'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { WorkflowExecutor, PhaseStatus } = require('../../.aexos-core/core/orchestration/workflow-executor');
const spawner = require('../../.aexos-core/core/orchestration/terminal-spawner');

describe('persisted workflow human checkpoints', () => {
  let root, story;
  const create = () => new WorkflowExecutor(root, { useSessionState: false });
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-checkpoint-'));
    await fs.copy(path.resolve(__dirname, '../../.aexos-core/development/workflows/development-cycle.yaml'),
      path.join(root, '.aexos-core/development/workflows/development-cycle.yaml'));
    story = path.join(root, 'story.md');
    await fs.writeFile(story, '# Story\n```yaml\nexecutor: "@dev"\nquality_gate: "@qa"\n```\n');
    const initial = create();
    await initial.initializeState(story);
    initial.state.currentPhase = '6_checkpoint';
    await initial.saveState();
  });
  afterEach(async () => { jest.restoreAllMocks(); await fs.remove(root); });

  test('yields without an invented GO and stays waiting after process restart', async () => {
    const first = await create().execute(story);
    expect(first).toMatchObject({ success: false, status: 'waiting_for_input', awaiting_input: true });
    expect(first.phaseResults['6_checkpoint'].decision).toBeNull();
    const resumed = await create().execute(story);
    expect(resumed.status).toBe('waiting_for_input');
    expect(resumed.state.currentPhase).toBe('6_checkpoint');
  });

  test('separates same-named stories, migrates a matching legacy state and preserves a failed write', async () => {
    const first = create();
    await first.initializeState(story);
    const sibling = path.join(root, 'another/story.md');
    const second = create();
    await second.initializeState(sibling);
    expect(second.getStateFilePath(sibling)).not.toBe(first.getStateFilePath(story));
    expect(second.state.currentPhase).toBe('1_validation');
    const legacy = path.join(first.statePath, `${path.basename(story, '.story.md')}-state.yaml`);
    await fs.move(first.getStateFilePath(story), legacy);
    expect((await create().initializeState(story)).currentPhase).toBe('6_checkpoint');
    await first.saveState();
    const original = await fs.readFile(first.getStateFilePath(story));
    const rename = jest.spyOn(require('fs'), 'renameSync').mockImplementation(() => { throw new Error('Injected rename failure'); });
    first.state.currentPhase = null;
    await expect(first.saveState()).rejects.toThrow('Injected rename failure');
    expect(await fs.readFile(first.getStateFilePath(story))).toEqual(original);
    rename.mockRestore();
  });

  test('consumes an explicit GO once and completes without repeating story phases', async () => {
    await create().execute(story);
    await create().submitCheckpointDecision(story, 'GO', 'next-story.md');
    const approved = await create().execute(story);
    expect(approved).toMatchObject({ success: true, status: 'completed', next_story: 'next-story.md' });
    expect(approved.state.currentPhase).toBeNull();
    expect(approved.state.checkpointResponse).toBeUndefined();
    const resumed = await create().execute(story);
    expect(resumed.success).toBe(true);
    expect(Object.keys(resumed.phaseResults)).toEqual(['6_checkpoint']);
  });

  test('review yields again, pause persists, and only a new explicit decision resumes', async () => {
    await create().submitCheckpointDecision(story, 'REVIEW');
    expect(await create().execute(story)).toMatchObject({ status: 'waiting_for_input', awaiting_input: true });
    await create().submitCheckpointDecision(story, 'PAUSE');
    expect(await create().execute(story)).toMatchObject({ success: false, status: 'paused' });
    expect(await create().execute(story)).toMatchObject({ success: false, status: 'paused' });
    await create().submitCheckpointDecision(story, 'ABORT');
    expect(await create().execute(story)).toMatchObject({ success: false, status: 'aborted' });
    await expect(create().submitCheckpointDecision(story, 'GO')).rejects.toThrow('not waiting');
  });

  test('supports a supplied human-input adapter and rejects invalid decisions', async () => {
    const executor = new WorkflowExecutor(root, { useSessionState: false, checkpointHandler: async () => 'GO' });
    expect((await executor.execute(story)).success).toBe(true);
    await expect(create().submitCheckpointDecision(story, 'UNKNOWN')).rejects.toThrow('Invalid');
  });

  test('terminal failures cannot be reported as success', async () => {
    const executor = create();
    executor.executePhase = async () => ({ status: PhaseStatus.FAILED, error: 'Actual phase failure' });
    const result = await executor.execute(story);
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
  });

  test.each(['executeDevelopmentPhase', 'executeQualityGatePhase', 'executePushPhase'])(
    '%s waits when execution is unavailable or lacks completion evidence', async method => {
      const executor = create();
      await executor.initializeState(story);
      executor.state.executor = '@dev';
      const manual = await executor[method]({}, '@qa', story);
      expect(manual.status).toBe(PhaseStatus.WAITING);
      expect(manual.review_result).toBeUndefined();
      jest.spyOn(spawner, 'isSpawnerAvailable').mockReturnValue(true);
      jest.spyOn(spawner, 'spawnAgent').mockResolvedValue({ success: true, output: 'Process exited' });
      const unverified = await executor[method]({ spawn_in_terminal: true }, '@qa', story);
      expect(unverified.status).toBe(PhaseStatus.WAITING);
    },
  );

  test('uses the actual structured QA verdict and never fabricates a score', async () => {
    const executor = create();
    await executor.initializeState(story);
    executor.state.executor = '@dev';
    jest.spyOn(spawner, 'isSpawnerAvailable').mockReturnValue(true);
    const review = { verdict: 'APPROVED', findings: [], recommendations: ['Maintain contract'] };
    const launch = jest.spyOn(spawner, 'spawnAgent').mockResolvedValue({ success: true,
      output: JSON.stringify({ review_result: review }) });
    const approved = await executor.executeQualityGatePhase({ spawn_in_terminal: true }, '@qa', story);
    expect(approved).toMatchObject({ status: PhaseStatus.COMPLETED, review_result: review });
    expect(approved.review_result.score).toBeUndefined();
    launch.mockResolvedValue({ success: true, result: { review_result: { ...review, verdict: 'NEEDS_WORK' } } });
    expect((await executor.executeQualityGatePhase({ spawn_in_terminal: true }, '@qa', story)).status)
      .toBe(PhaseStatus.FAILED);
  });

  test('rejects invented implementation paths and accepts real consumer files', async () => {
    const executor = create();
    const implementation = { files_created: ['output.js'], files_modified: [], tests_added: [] };
    expect(await executor.verifyImplementation(implementation)).toBe(false);
    expect(await executor.verifyImplementation({ ...implementation, files_created: [42] })).toBe(false);
    expect(await executor.verifyImplementation({ ...implementation, files_created: ['../outside.js'] })).toBe(false);
    await fs.writeFile(path.join(root, 'output.js'), 'module.exports = 42;\n');
    expect(await executor.verifyImplementation(implementation)).toBe(true);
    expect(await executor.verifyImplementation({ files_created: [], files_modified: [], tests_added: [] })).toBe(false);
  });

  test('plausible publication JSON cannot replace remote execution evidence', async () => {
    const executor = create();
    // No remote or host call occurs: the isolated directory has no Git repository.
    expect(await executor.verifyPublication({ push_result: { commit_hash: 'a'.repeat(40), branch: 'main' },
      pr_url: 'https://example.invalid/owner/repo/pull/1' })).toBe(false);
  });

  test('publication verification binds branch and PR to the same repository and commit', async () => {
    const publication = { push_result: { commit_hash: 'b'.repeat(40), branch: 'feature/actual' },
      pr_url: 'https://example.invalid/owner/repo/pull/7' };
    let remoteCommit = publication.push_result.commit_hash;
    let prCommit = remoteCommit;
    const execute = jest.spyOn(require('child_process'), 'execFile').mockImplementation((command, args, options, callback) => {
      expect(options.shell).toBeUndefined();
      let stdout = '';
      if (command === 'git' && args[0] === 'remote') stdout = 'git@example.invalid:owner/repo.git\n';
      if (command === 'git' && args[0] === 'ls-remote') stdout = `${remoteCommit}\trefs/heads/feature/actual\n`;
      if (command === 'gh') stdout = JSON.stringify({ url: publication.pr_url, headRefOid: prCommit,
        headRefName: 'feature/actual', state: 'OPEN' });
      callback(null, { stdout });
    });
    expect(await create().verifyPublication(publication)).toBe(true);
    expect(execute.mock.calls.map(call => call[0])).toEqual(['git', 'git', 'git', 'gh']);
    remoteCommit = 'c'.repeat(40);
    expect(await create().verifyPublication(publication)).toBe(false);
    remoteCommit = publication.push_result.commit_hash;
    prCommit = 'd'.repeat(40);
    expect(await create().verifyPublication(publication)).toBe(false);
    expect(await create().verifyPublication({ ...publication, pr_url: 'https://example.invalid/other/repo/pull/7' })).toBe(false);
  });
});
