'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { PROTOCOL } = require('../../.aexos-core/core/cerberus/cerberus-contract');
const { MISSION_PROTOCOL } = require('../../.aexos-core/core/execution/durable-mission');

const cli = path.join(process.cwd(), 'bin', 'aexos.js');
const worker = path.resolve(__dirname, '..', 'fixtures', 'cerberus-worker.js');

describe('aexos cerberus durable mission CLI', () => {
  let tempDir;
  let missionFile;
  let stateDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-cerberus-mission-cli-'));
    stateDir = path.join(tempDir, 'state');
    const story = path.join(tempDir, 'story.md');
    fs.writeFileSync(story, '# STORY-AEX-2.10\nStatus: InProgress\n');
    missionFile = path.join(tempDir, 'mission.json');
    fs.writeFileSync(missionFile, JSON.stringify({
      protocol: MISSION_PROTOCOL,
      missionId: 'cli-mission',
      projectId: 'project-one',
      story: { storyId: 'AEX-2.10', path: 'story.md' },
      steps: [{
        stepId: 'ingest-fixture',
        request: {
          protocol: PROTOCOL,
          requestId: 'request-cli-mission',
          idempotencyKey: 'idempotency-cli-mission',
          operation: 'ingest',
          projectId: 'project-one',
          payload: {
            source: { id: 'fixture', type: 'txt', sha256: 'c'.repeat(64) },
            document: { encoding: 'utf8', data: 'mission private fixture' },
          },
        },
      }],
    }));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function run(args) {
    return spawnSync(process.execPath, [cli, 'cerberus', 'mission', ...args], {
      cwd: tempDir,
      encoding: 'utf8',
    });
  }

  it('runs, reports and safely resumes a completed ingest mission', () => {
    const started = run([
      'run', missionFile, '--worker', worker, '--state-dir', stateDir, '--json',
    ]);
    if (started.status !== 0) {
      throw new Error(`mission run failed: ${started.stderr || started.stdout}`);
    }
    expect(JSON.parse(started.stdout)).toMatchObject({
      missionId: 'cli-mission',
      status: 'completed',
      steps: [{ stepId: 'ingest-fixture', status: 'completed', attempts: 1 }],
    });
    expect(started.stdout).not.toContain('mission private fixture');
    expect(started.stdout).not.toContain('idempotency-cli-mission');

    const status = run(['status', 'cli-mission', '--state-dir', stateDir, '--json']);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({ status: 'completed', revision: 4 });

    const resumed = run([
      'resume', missionFile, '--worker', worker, '--state-dir', stateDir, '--json',
    ]);
    expect(resumed.status).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({
      status: 'completed',
      steps: [{ attempts: 1 }],
    });
  });

  it('rejects a second run and requires an explicit worker', () => {
    const initial = run(['run', missionFile, '--worker', worker, '--state-dir', stateDir]);
    if (initial.status !== 0) {
      throw new Error(`mission run failed: ${initial.stderr || initial.stdout}`);
    }
    const duplicate = run(['run', missionFile, '--worker', worker, '--state-dir', stateDir]);
    expect(duplicate.status).toBe(4);
    expect(duplicate.stderr).toContain('[MISSION_ALREADY_EXISTS]');

    const absent = run(['resume', missionFile, '--state-dir', stateDir]);
    expect(absent.status).not.toBe(0);
    expect(absent.stderr).toContain("required option '--worker <path>' not specified");
  });
});
