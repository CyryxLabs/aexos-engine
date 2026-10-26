'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { PROTOCOL } = require('../../.aexos-core/core/cerberus/cerberus-contract');

const workerPath = path.resolve(__dirname, '..', 'fixtures', 'cerberus-worker.js');

function request(operation) {
  return {
    protocol: PROTOCOL,
    requestId: `req-cli-${operation}`,
    idempotencyKey: `idem-cli-${operation}`,
    operation,
    projectId: 'project-one',
    payload: operation === 'ingest' ? {
      source: { id: 'doc', type: 'markdown', sha256: 'e'.repeat(64) },
      document: { encoding: 'utf8', data: '# fixture' },
    } : { text: 'fixture', limit: 5 },
  };
}

describe('aexos cerberus CLI', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-cerberus-cli-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function run(command, payload, extra = []) {
    const file = path.join(tempDir, 'request.json');
    fs.writeFileSync(file, JSON.stringify(payload));
    return spawnSync(process.execPath, [
      path.join(process.cwd(), 'bin', 'aexos.js'), 'cerberus', command, file,
      '--worker', workerPath, '--json', ...extra,
    ], { cwd: process.cwd(), encoding: 'utf8' });
  }

  it.each(['ingest', 'query'])('runs governed %s end to end', (operation) => {
    const result = run(operation, request(operation));
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      response: { operation, status: 'success' },
      receipt: { operation, status: 'success', attemptCount: 1 },
    });
    expect(JSON.stringify(output)).not.toContain('idem-cli');
  });

  it('rejects command/request operation mismatch before worker execution', () => {
    const result = run('query', request('ingest'));
    expect(result.status).toBe(4);
    expect(result.stderr).toContain('[CERBERUS_OPERATION_MISMATCH]');
  });

  it('fails cleanly when the optional worker is absent', () => {
    const payload = request('ingest');
    const file = path.join(tempDir, 'request.json');
    fs.writeFileSync(file, JSON.stringify(payload));
    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), 'bin', 'aexos.js'), 'cerberus', 'ingest', file,
      '--worker', path.join(tempDir, 'missing-worker.js'),
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status).toBe(4);
    expect(result.stderr).toContain('[CERBERUS_WORKER_NOT_FOUND]');
  });
});
