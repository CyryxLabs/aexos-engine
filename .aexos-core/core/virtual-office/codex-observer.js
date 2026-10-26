'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { confinedPath, projectIdentity, submitEvent } = require('./host-bridge');

const LIMITS = Object.freeze({ files: 64, entries: 2048, directories: 128, bytes: 1048576,
  fileBytes: 262144, recordBytes: 65536, records: 2000, intervalMs: 2000 });
const digest = (value) => createHash('sha256').update(value).digest('hex');
const identity = (value) => typeof value === 'string' && /^[a-zA-Z0-9_.:/ -]{1,160}$/.test(value) ? value : null;

function assertUnlinked(target, root) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Observer path escapes sessions root');
  let current = root;
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Observer refuses linked session paths');
  }
}

async function enumerate(root, sessionId) {
  const files = [];
  const pending = [{ directory: root, depth: 0 }];
  let entries = 0;
  let directories = 0;
  while (pending.length && entries < LIMITS.entries && directories < LIMITS.directories && files.length < LIMITS.files) {
    const { directory, depth } = pending.shift();
    assertUnlinked(directory, root);
    const handle = await fs.promises.opendir(directory);
    const children = [];
    try {
      let entry;
      while (entries < LIMITS.entries && (entry = await handle.read())) { entries += 1; children.push(entry); }
    } finally { await handle.close(); }
    directories += 1;
    children.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of children) {
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory() && depth < 3 && /^\d{2,4}$/.test(entry.name)) pending.push({ directory: candidate, depth: depth + 1 });
      const matchesSession = !sessionId || entry.name.endsWith(`-${sessionId}.jsonl`) || entry.name === `${sessionId}.jsonl`;
      if (entry.isFile() && entry.name.endsWith('.jsonl') && matchesSession && files.length < LIMITS.files) files.push(candidate);
    }
  }
  return files;
}

class CodexSessionObserver {
  constructor(projectRoot, options = {}) {
    this.projectRoot = fs.realpathSync(projectRoot);
    this.sessionsRoot = path.resolve(options.sessionsRoot || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions'));
    if (options.sessionId !== undefined && !identity(options.sessionId)) throw new Error('Invalid Codex session filter');
    this.options = { ...options, agentId: options.agentId?.replace(/^@/, '') };
    this.checkpoint = confinedPath(projectRoot, 'codex-observer.json');
    this.binding = digest(JSON.stringify([projectIdentity(projectRoot), this.sessionsRoot, options.sessionId || null, this.options.agentId || null]));
    this.cursors = {};
    this.timer = null;
    this.nextFile = 0;
    this.work = null;
    this.status = { status: 'stopped', observed: 0, evidence: 'local-session-log' };
    if (fs.existsSync(this.checkpoint) && fs.statSync(this.checkpoint).size <= 262144) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.checkpoint, 'utf8'));
        if (saved.binding === this.binding && saved.cursors && typeof saved.cursors === 'object') this.cursors = saved.cursors;
      } catch (_error) { /* Invalid checkpoints cause bounded replay, never new liveness timestamps. */ }
    }
  }

  async readFile(file, remaining) {
    assertUnlinked(file, this.sessionsRoot);
    const handle = await fs.promises.open(file, 'r');
    try {
      const stat = await handle.stat();
      let header = Buffer.alloc(Math.min(stat.size, 4096));
      await handle.read(header, 0, header.length, 0);
      if (header.indexOf(10) < 0 && stat.size > header.length) {
        header = Buffer.alloc(Math.min(stat.size, LIMITS.recordBytes));
        await handle.read(header, 0, header.length, 0);
      }
      const end = header.indexOf(10);
      if (end < 0) return header.length;
      let metadata;
      try { metadata = JSON.parse(header.subarray(0, end).toString('utf8')); } catch (_error) { return header.length; }
      if (!metadata || typeof metadata !== 'object') return header.length;
      const payload = metadata.payload;
      if (metadata.type !== 'session_meta' || !payload || !identity(payload.id) || typeof payload.cwd !== 'string') return header.length;
      if (this.options.sessionId && payload.id !== this.options.sessionId) return header.length;
      let cwd;
      try { cwd = fs.realpathSync(payload.cwd); } catch (_error) { return header.length; }
      if (cwd !== this.projectRoot) return header.length;
      const originator = identity(payload.originator);
      if (!['CodexDesktop', 'Codex Desktop', 'codex_cli_rs', 'codex_exec', 'codex_vscode', 'codex-cli'].includes(originator)) return header.length;
      const fileKey = digest(path.relative(this.sessionsRoot, file));
      const fingerprint = digest(header.subarray(0, end));
      let cursor = this.cursors[fileKey];
      let anchorMatches = true;
      if (cursor && Number.isSafeInteger(cursor.offset) && cursor.offset > 0 && cursor.offset <= stat.size && cursor.anchor) {
        const anchor = Buffer.alloc(Math.min(64, cursor.offset));
        await handle.read(anchor, 0, anchor.length, cursor.offset - anchor.length);
        anchorMatches = digest(anchor) === cursor.anchor;
      }
      if (!anchorMatches || !cursor || cursor.fingerprint !== fingerprint || cursor.inode !== stat.ino ||
          !Number.isSafeInteger(cursor.offset) || cursor.offset < end + 1 || cursor.offset > stat.size) {
        const offset = Math.max(end + 1, stat.size - LIMITS.fileBytes);
        cursor = { fingerprint, inode: stat.ino, offset, discarding: offset > end + 1, turnId: null, bootstrap: offset > end + 1 };
      }
      const bytes = Math.min(stat.size - cursor.offset, LIMITS.fileBytes, remaining);
      const buffer = Buffer.alloc(bytes);
      await handle.read(buffer, 0, bytes, cursor.offset);
      let initialPosition = 0;
      if (cursor.bootstrap && !cursor.turnId) {
        let position = buffer.indexOf(10) + 1;
        let found = null;
        let inspected = 0;
        while (position > 0 && position < bytes && inspected < LIMITS.records && this.cycleRecords < LIMITS.records) {
          const newline = buffer.indexOf(10, position);
          if (newline < 0) break;
          if (newline - position <= LIMITS.recordBytes) {
            try {
              const row = JSON.parse(buffer.subarray(position, newline).toString('utf8'));
              if (identity(row?.payload?.turn_id) && (row.type === 'turn_context' ||
                (row.type === 'event_msg' && ['task_started', 'task_complete'].includes(row.payload.type)))) {
                if (found?.turnId !== row.payload.turn_id) found = { turnId: row.payload.turn_id, offset: position };
              }
            } catch (_error) { /* Content is neither retained nor forwarded. */ }
          }
          position = newline + 1; inspected += 1; this.cycleRecords += 1;
        }
        if (!found && cursor.offset > end + 1) {
          cursor.offset = Math.max(end + 1, cursor.offset - LIMITS.fileBytes);
          cursor.discarding = cursor.offset > end + 1;
          delete cursor.anchor;
          this.cursors[fileKey] = cursor;
          return bytes + header.length;
        }
        cursor.bootstrap = false;
        if (found) { cursor.turnId = found.turnId; cursor.discarding = false; initialPosition = found.offset; }
      }
      let position = initialPosition;
      let records = 0;
      while (position < bytes && records < LIMITS.records && this.cycleRecords < LIMITS.records) {
        const newline = buffer.indexOf(10, position);
        if (newline < 0) {
          if (bytes - position > LIMITS.recordBytes || cursor.discarding) { cursor.discarding = true; position = bytes; }
          break;
        }
        const start = position;
        position = newline + 1;
        records += 1;
        this.cycleRecords += 1;
        if (cursor.discarding) { cursor.discarding = false; continue; }
        if (newline - start > LIMITS.recordBytes) continue;
        let record;
        try { record = JSON.parse(buffer.subarray(start, newline).toString('utf8')); } catch (_error) { continue; }
        if (!record || typeof record !== 'object') continue;
        const data = record.payload || {};
        if (record.type === 'turn_context' && identity(data.turn_id)) cursor.turnId = data.turn_id;
        let type;
        let toolName;
        if (record.type === 'event_msg' && ['task_started', 'task_complete'].includes(data.type) && identity(data.turn_id)) {
          cursor.turnId = data.turn_id;
          type = data.type === 'task_started' ? 'CommandStart' : 'CommandComplete';
        } else if (record.type === 'response_item' && ['function_call', 'custom_tool_call'].includes(data.type) && identity(data.name) && cursor.turnId) {
          type = 'PreToolUse'; toolName = data.name;
        }
        if (!type) continue;
        const timestamp = Date.parse(record.timestamp);
        if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > Date.now() + 60000) continue;
        const event = { id: digest(`${this.options.agentId || ''}:${payload.id}:${cursor.turnId}:${type}:${timestamp}:${identity(data.call_id) || ''}`),
          type, timestamp, host: 'codex', evidence: 'local-session-log', originator,
          sessionId: payload.id, runId: cursor.turnId, agentId: this.options.agentId,
          toolName, ...(type === 'CommandComplete' ? { success: true } : {}) };
        try {
          const result = await (this.options.submit || submitEvent)(this.projectRoot, event, { url: this.options.url, timeoutMs: 500 });
          if (!result.accepted) throw new Error('Observation not accepted');
          this.status.observed += 1;
        } catch (_error) {
          position = start;
          this.status.status = 'delivery-unavailable';
          break;
        }
      }
      cursor.offset += position;
      const anchor = Buffer.alloc(Math.min(64, cursor.offset));
      await handle.read(anchor, 0, anchor.length, cursor.offset - anchor.length);
      cursor.anchor = digest(anchor);
      this.cursors[fileKey] = cursor;
      return bytes + header.length;
    } finally { await handle.close(); }
  }

  async scan() {
    if (this.work) return this.work;
    this.work = (async () => {
      this.status.status = 'observing';
      this.cycleRecords = 0;
      try {
        let ancestor = this.sessionsRoot;
        while (true) {
          if (fs.lstatSync(ancestor).isSymbolicLink()) throw new Error('Linked sessions root');
          const parent = path.dirname(ancestor);
          if (parent === ancestor) break;
          ancestor = parent;
        }
        assertUnlinked(this.sessionsRoot, this.sessionsRoot);
        let remaining = LIMITS.bytes;
        const discovered = await enumerate(this.sessionsRoot, this.options.sessionId);
        const start = discovered.length ? this.nextFile % discovered.length : 0;
        const files = [...discovered.slice(start), ...discovered.slice(0, start)];
        let processed = 0;
        for (const file of files) {
          if (remaining <= LIMITS.recordBytes) break;
          processed += 1;
          remaining -= await this.readFile(file, remaining - LIMITS.recordBytes);
          if (this.status.status === 'delivery-unavailable') break;
        }
        this.nextFile = discovered.length ? (start + processed) % discovered.length : 0;
        this.cursors = Object.fromEntries(Object.entries(this.cursors).slice(-LIMITS.files));
        const checkpoint = confinedPath(this.projectRoot, 'codex-observer.json');
        const temporary = confinedPath(this.projectRoot, `codex-observer-${process.pid}.tmp`);
        fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
        fs.writeFileSync(temporary, JSON.stringify({ binding: this.binding, cursors: this.cursors }));
        fs.renameSync(temporary, checkpoint);
      } catch (_error) { this.status.status = 'unavailable'; }
      return { ...this.status };
    })();
    try { return await this.work; } finally { this.work = null; }
  }

  async start() {
    const result = await this.scan();
    this.timer = setInterval(() => { this.scan(); }, LIMITS.intervalMs);
    return result;
  }

  async stop() {
    clearInterval(this.timer);
    await this.work;
    this.status.status = 'stopped';
  }
}

module.exports = { CodexSessionObserver, LIMITS, assertUnlinked, enumerate };
