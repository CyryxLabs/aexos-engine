/** Windows process-lifetime writer lease for durable research coordination. */
'use strict';

const crypto = require('crypto');
const net = require('net');

const LEASE_NAMESPACE = 'aexos.research-writer-lease/v1';
const leases = new WeakMap();

function unavailable() {
  return Object.assign(new Error('Research recovery coordination is unavailable.'), {
    code: 'RESEARCH_RECOVERY_UNAVAILABLE',
  });
}

function pipeName(rootIdentity, runId) {
  if (process.platform !== 'win32') throw unavailable();
  if (!rootIdentity || typeof rootIdentity.dev !== 'string'
    || typeof rootIdentity.ino !== 'string' || rootIdentity.dev === '0'
    || rootIdentity.ino === '0') {
    throw unavailable();
  }
  const key = JSON.stringify({
    namespace: LEASE_NAMESPACE,
    rootIdentity: { dev: rootIdentity.dev, ino: rootIdentity.ino },
    runId,
  });
  const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
  return `\\\\.\\pipe\\aexos-research-${hash}`;
}

async function acquireWriterLease({ rootIdentity, runId }) {
  const namespace = pipeName(rootIdentity, runId);
  const identity = {};
  const sockets = new Set();
  const state = { active: false, namespace, server: null, sockets };
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.destroy();
  });
  state.server = server;
  server.maxConnections = 1;
  leases.set(identity, state);

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      state.active = false;
      if (error?.code === 'EADDRINUSE') {
        reject(Object.assign(new Error('Research run already has an exclusive writer.'), {
          code: 'RESEARCH_BUSY',
        }));
      } else reject(unavailable());
    };
    const onListening = () => {
      server.removeListener('error', onError);
      state.active = true;
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    try { server.listen(namespace); }
    catch (_error) {
      server.removeListener('error', onError);
      server.removeListener('listening', onListening);
      reject(unavailable());
    }
  });

  server.on('error', () => { state.active = false; });
  server.on('close', () => { state.active = false; });
  return { identity, namespace };
}

function assertWriterLease(lease) {
  const state = lease && leases.get(lease.identity);
  if (!state || lease.namespace !== state.namespace || !state.active
    || !state.server.listening) {
    throw Object.assign(new Error('Research writer lease is not active.'), {
      code: 'RESEARCH_LOCK_CHANGED',
    });
  }
  return state;
}

async function closeWriterLease(lease) {
  const state = lease && leases.get(lease.identity);
  if (!state) {
    throw Object.assign(new Error('Research writer lease is not recognized.'), {
      code: 'RESEARCH_LOCK_REQUIRED',
    });
  }
  leases.delete(lease.identity);
  state.active = false;
  for (const socket of state.sockets) socket.destroy();
  if (!state.server.listening) return;
  await new Promise((resolve) => state.server.close(resolve));
}

module.exports = {
  LEASE_NAMESPACE,
  acquireWriterLease,
  assertWriterLease,
  closeWriterLease,
  pipeName,
};
