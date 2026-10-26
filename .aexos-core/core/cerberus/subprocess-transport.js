/** Bounded shell-free subprocess transport for an explicitly configured Cerberus worker. */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { CerberusGatewayError } = require('./cerberus-gateway');

function stderrHash(chunks) {
  return crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
}

function minimalProcessEnv(source = process.env) {
  const allowed = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP', 'TMPDIR'];
  return Object.fromEntries(allowed.filter((key) => source[key]).map((key) => [key, source[key]]));
}

function createSubprocessTransport(options = {}) {
  const workerPath = path.resolve(String(options.workerPath || ''));
  if (!path.isAbsolute(String(options.workerPath || '')) || !fs.existsSync(workerPath)) {
    throw new CerberusGatewayError(
      'CERBERUS_WORKER_NOT_FOUND',
      'Cerberus worker must be an existing explicit absolute path.',
    );
  }
  const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 16 * 1024 * 1024) {
    throw new CerberusGatewayError(
      'CERBERUS_LIMIT_INVALID',
      'Cerberus maxOutputBytes must be between 1 and 16777216.',
    );
  }
  const command = path.extname(workerPath).toLowerCase() === '.js' ? process.execPath : workerPath;
  const args = command === process.execPath ? [workerPath, '--aexos-gateway'] : ['--aexos-gateway'];

  return (request, context = {}) => new Promise((resolve, reject) => {
    let settled = false;
    let child;
    let terminalError;
    let terminationFallback;
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (terminationFallback) clearTimeout(terminationFallback);
      if (context.signal) context.signal.removeEventListener('abort', onAbort);
      fn(value);
    };
    const terminate = (code, message, details = {}) => {
      if (settled || terminalError) return;
      terminalError = new CerberusGatewayError(code, message, details);
      if (!child || child.exitCode !== null || child.signalCode !== null) {
        finish(reject, terminalError);
        return;
      }
      const terminationRequested = child.kill();
      if (!terminationRequested) {
        finish(reject, terminalError);
        return;
      }
      // Normal completion waits for `close`, proving stdio and the worker process
      // are closed. The fallback prevents a broken platform adapter from hanging
      // the caller forever, while the gateway's outer deadline remains bounded.
      terminationFallback = setTimeout(() => finish(reject, terminalError), 1000);
      terminationFallback.unref?.();
    };
    const onAbort = () => terminate('CERBERUS_CANCELLED', 'Cerberus worker was cancelled.');
    if (context.signal?.aborted) {
      finish(
        reject,
        new CerberusGatewayError('CERBERUS_CANCELLED', 'Cerberus worker was cancelled.'),
      );
      return;
    }
    try {
      child = spawn(command, args, {
        cwd: options.cwd || path.dirname(workerPath),
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: options.env || minimalProcessEnv(),
      });
    } catch {
      finish(
        reject,
        new CerberusGatewayError('CERBERUS_SPAWN_FAILED', 'Cerberus worker could not be started.'),
      );
      return;
    }
    if (context.signal) context.signal.addEventListener('abort', onAbort, { once: true });
    const collect = (target) => (chunk) => {
      const buffer = Buffer.from(chunk);
      outputBytes += buffer.length;
      target.push(buffer);
      if (outputBytes > maxOutputBytes) {
        terminate('CERBERUS_OUTPUT_LIMIT', 'Cerberus worker exceeded the bounded output limit.');
      }
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', () => terminate(
      'CERBERUS_SPAWN_FAILED',
      'Cerberus worker could not be started.',
    ));
    child.on('close', (code) => {
      if (settled) return;
      if (terminalError) {
        finish(reject, terminalError);
        return;
      }
      if (code !== 0) {
        finish(
          reject,
          new CerberusGatewayError(
            code === 75 ? 'CERBERUS_UNAVAILABLE' : 'CERBERUS_WORKER_EXIT',
            'Cerberus worker exited without a successful response.',
            { exitCode: code, stderrHash: stderrHash(stderr) },
          ),
        );
        return;
      }
      try {
        finish(resolve, JSON.parse(Buffer.concat(stdout).toString('utf8')));
      } catch {
        finish(
          reject,
          new CerberusGatewayError(
            'CERBERUS_PROTOCOL_INVALID',
            'Cerberus worker returned invalid JSON.',
          ),
        );
      }
    });
    child.stdin.on('error', () => terminate(
      'CERBERUS_WORKER_IO',
      'Cerberus worker input failed.',
    ));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

module.exports = { createSubprocessTransport, minimalProcessEnv };
