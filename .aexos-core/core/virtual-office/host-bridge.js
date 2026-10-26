'use strict';

const fs = require('fs');
const path = require('path');
const { createHash, randomBytes } = require('crypto');
const { normalizeEvent } = require('./event-normalizer');

function projectIdentity(root) {
  return createHash('sha256').update(fs.realpathSync(root)).digest('hex').slice(0, 32);
}

function confinedPath(root, name) {
  const resolvedRoot = fs.realpathSync(root);
  const directory = path.join(resolvedRoot, '.aexos', 'dashboard');
  for (const candidate of [path.join(resolvedRoot, '.aexos'), directory, path.join(directory, name)]) {
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) {
      throw new Error('Virtual Office runtime paths must not contain symbolic links or junctions');
    }
  }
  return path.join(directory, name);
}

function producerToken(root, create = false) {
  const file = confinedPath(root, 'producer-token');
  if (!fs.existsSync(file) && create) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { fs.writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;
}

async function submitEvent(root, source, options = {}) {
  const event = normalizeEvent({ ...source, projectId: projectIdentity(root) });
  const target = new URL(options.url || 'http://127.0.0.1:4001/events');
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
    throw new Error('Virtual Office producer only supports local HTTP collectors');
  }
  try {
    const response = await fetch(target, {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        Authorization: `Bearer ${producerToken(root) || ''}` },
      body: JSON.stringify(event), signal: globalThis.AbortSignal.timeout(options.timeoutMs || 1000),
    });
    if (!response.ok) {
      const error = new Error(`Collector rejected event: HTTP ${response.status}`);
      error.rejected = true;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (!options.queue || error.rejected) throw error;
    const file = confinedPath(root, 'events.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > 4 * 1024 * 1024) fs.writeFileSync(file, '');
    fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
    return { accepted: false, queued: true, id: event.id };
  }
}

module.exports = { confinedPath, producerToken, projectIdentity, submitEvent };
