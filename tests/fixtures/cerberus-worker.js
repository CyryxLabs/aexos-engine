'use strict';

const crypto = require('crypto');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const mode = process.env.CERBERUS_FIXTURE_MODE || 'success';
  if (mode === 'exit') process.exit(75);
  if (mode === 'invalid') {
    process.stdout.write('not-json');
    return;
  }
  if (mode === 'overflow') {
    process.stdout.write('x'.repeat(4096));
    return;
  }
  if (mode === 'hang') return;
  const request = JSON.parse(input);
  const sourceHash = request.operation === 'ingest'
    ? request.payload.source.sha256
    : crypto.createHash('sha256').update(request.payload.text).digest('hex');
  process.stdout.write(JSON.stringify({
    protocol: request.protocol,
    requestId: request.requestId,
    operation: request.operation,
    status: 'success',
    data: request.operation === 'ingest' ? { revision: 1 } : { results: [] },
    provenance: {
      workerVersion: 'fixture-1.0.0',
      sourceHash,
      processedAt: '2026-09-04T00:00:00.000Z',
    },
  }));
});
