/** Durable, integrity-bound mission checkpoints for restart-safe execution. */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { validateRequest } = require('../cerberus/cerberus-contract');
const { digest, clone, appendEvent, stateIntegrity, validateEvidence } = require('./durable-evidence');

const MISSION_PROTOCOL = 'aexos.mission/v1';
const MAX_PLAN_BYTES = 16 * 1024 * 1024;
const MAX_STATE_BYTES = 4 * 1024 * 1024;
const schemaPath = path.resolve(__dirname, '../../schemas/mission-v1.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

class DurableMissionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DurableMissionError';
    this.code = code;
    this.details = details;
  }
}

function schemaErrors() {
  return (validateSchema.errors || []).map((error) => ({
    path: error.instancePath || '/',
    keyword: error.keyword,
    message: error.message,
  }));
}

function assertStoryPath(storyPath, projectRoot) {
  if (path.isAbsolute(storyPath)) {
    throw new DurableMissionError(
      'MISSION_STORY_PATH_INVALID',
      'Mission story path must be project-relative.',
    );
  }
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, storyPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new DurableMissionError(
      'MISSION_STORY_PATH_INVALID',
      'Mission story path must remain inside the project root.',
    );
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new DurableMissionError(
      'MISSION_STORY_NOT_FOUND',
      'Mission story file was not found inside the project root.',
    );
  }
  return relative.split(path.sep).join('/');
}

function validateMissionPlan(value, options = {}) {
  const bytes = Buffer.byteLength(JSON.stringify(value || null));
  if (bytes > (options.maxPlanBytes || MAX_PLAN_BYTES)) {
    throw new DurableMissionError('MISSION_PLAN_TOO_LARGE', 'Mission plan exceeds the size limit.');
  }
  if (!validateSchema(value)) {
    throw new DurableMissionError(
      'MISSION_PLAN_INVALID',
      'Mission plan does not match aexos.mission/v1.',
      { errors: schemaErrors() },
    );
  }
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const normalized = clone(value);
  normalized.story.path = assertStoryPath(normalized.story.path, projectRoot);
  const storyContent = fs.readFileSync(path.join(projectRoot, normalized.story.path), 'utf8');
  if (!storyContent.includes(normalized.story.storyId)) {
    throw new DurableMissionError(
      'MISSION_STORY_MISMATCH',
      'Mission story file does not contain the declared story identity.',
    );
  }
  const stepIds = new Set();
  const requestIds = new Set();
  const idempotencyKeys = new Set();
  normalized.steps = normalized.steps.map((step) => {
    if (stepIds.has(step.stepId)) {
      throw new DurableMissionError('MISSION_STEP_DUPLICATE', 'Mission step identities must be unique.');
    }
    stepIds.add(step.stepId);
    const request = validateRequest(step.request);
    if (request.projectId !== normalized.projectId) {
      throw new DurableMissionError(
        'MISSION_PROJECT_MISMATCH',
        'Every Cerberus request must match the mission project.',
      );
    }
    if (requestIds.has(request.requestId) || idempotencyKeys.has(request.idempotencyKey)) {
      throw new DurableMissionError(
        'MISSION_REQUEST_IDENTITY_DUPLICATE',
        'Mission request and idempotency identities must be unique.',
      );
    }
    requestIds.add(request.requestId);
    idempotencyKeys.add(request.idempotencyKey);
    return { stepId: step.stepId, request };
  });
  return Object.freeze({
    ...normalized,
    story: Object.freeze({ ...normalized.story }),
    steps: Object.freeze(normalized.steps.map((step) => Object.freeze(step))),
  });
}

function sanitizeReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || receipt.status !== 'success') {
    throw new DurableMissionError(
      'MISSION_EVIDENCE_REQUIRED',
      'A successful mission step requires a sanitized success receipt.',
    );
  }
  const provenance = receipt.provenance || {};
  const sanitized = {
    protocol: receipt.protocol,
    requestId: receipt.requestId,
    idempotencyHash: receipt.idempotencyHash,
    operation: receipt.operation,
    projectIdHash: receipt.projectIdHash,
    payloadHash: receipt.payloadHash,
    attemptCount: receipt.attemptCount,
    status: receipt.status,
    provenance: {
      workerVersion: provenance.workerVersion,
      sourceHash: provenance.sourceHash,
      processedAt: provenance.processedAt,
    },
  };
  if (
    !sanitized.requestId || !sanitized.operation
    || ![sanitized.idempotencyHash, sanitized.projectIdHash, sanitized.payloadHash]
      .every((hash) => /^[a-f0-9]{64}$/.test(String(hash)))
    || !sanitized.provenance.workerVersion
    || !/^[a-f0-9]{64}$/.test(String(sanitized.provenance.sourceHash))
    || Number.isNaN(Date.parse(sanitized.provenance.processedAt))
  ) {
    throw new DurableMissionError(
      'MISSION_EVIDENCE_INVALID',
      'Mission receipt is incomplete or malformed.',
    );
  }
  return sanitized;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    return null;
  }
}

class MissionStore {
  constructor(options = {}) {
    this.root = path.resolve(options.root || path.join(process.cwd(), '.aexos', 'missions'));
    this.clock = options.clock || (() => new Date());
    this.maxStateBytes = options.maxStateBytes || MAX_STATE_BYTES;
    this.pid = options.pid || process.pid;
    this.randomId = options.randomId || (() => crypto.randomUUID());
  }

  _paths(missionId) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(String(missionId))) {
      throw new DurableMissionError('MISSION_ID_INVALID', 'Mission identity is invalid.');
    }
    const missionRoot = path.join(this.root, missionId);
    return {
      missionRoot,
      checkpoints: path.join(missionRoot, 'checkpoints'),
      lock: path.join(missionRoot, 'mission.lock'),
    };
  }

  exists(missionId) {
    const { checkpoints } = this._paths(missionId);
    return fs.existsSync(checkpoints)
      && fs.readdirSync(checkpoints).some((name) => /^\d{8}-[a-f0-9]{64}\.json$/.test(name));
  }

  acquireLock(missionId) {
    const paths = this._paths(missionId);
    fs.mkdirSync(paths.missionRoot, { recursive: true });
    const lock = {
      protocol: MISSION_PROTOCOL,
      missionId,
      pid: this.pid,
      token: this.randomId(),
      acquiredAt: this.clock().toISOString(),
    };
    const write = () => fs.writeFileSync(paths.lock, `${JSON.stringify(lock)}\n`, {
      encoding: 'utf8', flag: 'wx',
    });
    try {
      write();
      return { lock, reclaimed: false };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    let owner;
    try {
      owner = JSON.parse(fs.readFileSync(paths.lock, 'utf8'));
    } catch {
      throw new DurableMissionError(
        'MISSION_LOCK_UNVERIFIABLE',
        'Mission lock owner cannot be verified.',
      );
    }
    const alive = isProcessAlive(owner.pid);
    if (alive !== false) {
      throw new DurableMissionError(
        alive ? 'MISSION_LOCKED' : 'MISSION_LOCK_UNVERIFIABLE',
        'Mission is locked by another or unverifiable process.',
        { ownerPid: Number.isInteger(owner.pid) ? owner.pid : null },
      );
    }
    fs.unlinkSync(paths.lock);
    try {
      write();
      return { lock, reclaimed: true, previousOwnerPid: owner.pid };
    } catch {
      throw new DurableMissionError('MISSION_LOCKED', 'Mission lock was acquired concurrently.');
    }
  }

  releaseLock(handle) {
    if (!handle?.lock) return;
    const paths = this._paths(handle.lock.missionId);
    try {
      const current = JSON.parse(fs.readFileSync(paths.lock, 'utf8'));
      if (current.token === handle.lock.token && current.pid === handle.lock.pid) {
        fs.unlinkSync(paths.lock);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  load(missionId) {
    const { checkpoints } = this._paths(missionId);
    if (!fs.existsSync(checkpoints)) {
      throw new DurableMissionError('MISSION_NOT_FOUND', 'Mission state was not found.');
    }
    const files = fs.readdirSync(checkpoints)
      .filter((name) => /^\d{8}-[a-f0-9]{64}\.json$/.test(name))
      .sort();
    if (files.length === 0) {
      throw new DurableMissionError('MISSION_NOT_FOUND', 'Mission state was not found.');
    }
    const revisions = files.map((name) => name.slice(0, 8));
    if (new Set(revisions).size !== revisions.length) {
      throw new DurableMissionError('MISSION_STATE_FORK', 'Mission state contains a revision fork.');
    }
    const latest = files.at(-1);
    const filePath = path.join(checkpoints, latest);
    const filenameRevision = Number(latest.slice(0, 8));
    const bytes = fs.statSync(filePath).size;
    if (bytes > this.maxStateBytes) {
      throw new DurableMissionError('MISSION_STATE_TOO_LARGE', 'Mission state exceeds the size limit.');
    }
    let state;
    try {
      state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      throw new DurableMissionError('MISSION_STATE_INVALID', 'Mission state is not valid JSON.');
    }
    const filenameHash = latest.slice(9, 73);
    if (
      state.protocol !== MISSION_PROTOCOL
      || state.missionId !== missionId
      || state.revision !== filenameRevision
      || state.integrityHash !== filenameHash
      || stateIntegrity(state) !== state.integrityHash
      || !validateEvidence(state.evidence)
      || !Array.isArray(state.steps)
      || !['pending', 'running', 'failed', 'completed'].includes(state.status)
      || state.steps.some((step) => (
        !step || typeof step.stepId !== 'string'
        || !/^[a-f0-9]{64}$/.test(String(step.requestHash))
        || !/^[a-f0-9]{64}$/.test(String(step.idempotencyHash))
        || !['pending', 'running', 'failed', 'completed'].includes(step.status)
        || !Number.isInteger(step.attempts) || step.attempts < 0
      ))
    ) {
      throw new DurableMissionError('MISSION_STATE_TAMPERED', 'Mission state integrity check failed.');
    }
    return state;
  }

  save(state) {
    const next = clone(state);
    next.revision = (state.revision || 0) + 1;
    next.updatedAt = this.clock().toISOString();
    delete next.integrityHash;
    next.integrityHash = stateIntegrity(next);
    const content = `${JSON.stringify(next, null, 2)}\n`;
    if (Buffer.byteLength(content) > this.maxStateBytes) {
      throw new DurableMissionError('MISSION_STATE_TOO_LARGE', 'Mission state exceeds the size limit.');
    }
    const { checkpoints } = this._paths(next.missionId);
    fs.mkdirSync(checkpoints, { recursive: true });
    const filename = `${String(next.revision).padStart(8, '0')}-${next.integrityHash}.json`;
    const target = path.join(checkpoints, filename);
    const temporary = path.join(checkpoints, `.${filename}.${this.randomId()}.tmp`);
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, 'wx');
      fs.writeFileSync(descriptor, content, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, target);
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      try { fs.unlinkSync(temporary); } catch { /* best effort temp cleanup */ }
      if (error.code === 'EEXIST') {
        throw new DurableMissionError('MISSION_STATE_FORK', 'Mission revision already exists.');
      }
      throw error;
    }
    return next;
  }
}

function initialState(plan, clock) {
  const createdAt = clock().toISOString();
  return {
    protocol: MISSION_PROTOCOL,
    missionId: plan.missionId,
    projectId: plan.projectId,
    story: clone(plan.story),
    planHash: digest(plan),
    status: 'pending',
    revision: 0,
    createdAt,
    updatedAt: createdAt,
    steps: plan.steps.map((step) => ({
      stepId: step.stepId,
      requestHash: digest(step.request),
      idempotencyHash: digest(step.request.idempotencyKey),
      status: 'pending',
      attempts: 0,
      receipt: null,
      errorCode: null,
    })),
    evidence: [],
  };
}

function missionSummary(state) {
  return {
    protocol: state.protocol,
    missionId: state.missionId,
    projectId: state.projectId,
    story: clone(state.story),
    status: state.status,
    revision: state.revision,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    evidenceHead: state.evidence.at(-1)?.hash || null,
    steps: state.steps.map((step) => ({
      stepId: step.stepId,
      requestHash: step.requestHash,
      idempotencyHash: step.idempotencyHash,
      status: step.status,
      attempts: step.attempts,
      receipt: step.receipt,
      errorCode: step.errorCode,
    })),
  };
}

class DurableMissionRunner {
  constructor(options = {}) {
    if (!options.store || ['acquireLock', 'releaseLock', 'load', 'save', 'exists']
      .some((method) => typeof options.store[method] !== 'function')) {
      throw new DurableMissionError('MISSION_STORE_REQUIRED', 'Durable mission store is required.');
    }
    if (typeof options.executor !== 'function') {
      throw new DurableMissionError('MISSION_EXECUTOR_REQUIRED', 'Durable mission executor is required.');
    }
    this.store = options.store;
    this.executor = options.executor;
    this.clock = options.clock || (() => new Date());
    this.projectRoot = path.resolve(options.projectRoot || process.cwd());
  }

  run(plan) {
    return this._execute(plan, false);
  }

  resume(plan) {
    return this._execute(plan, true);
  }

  async _execute(input, resume) {
    const plan = validateMissionPlan(input, { projectRoot: this.projectRoot });
    const handle = this.store.acquireLock(plan.missionId);
    try {
      let state;
      if (this.store.exists(plan.missionId)) {
        if (!resume) {
          throw new DurableMissionError(
            'MISSION_ALREADY_EXISTS',
            'Mission already exists; use resume to continue it.',
          );
        }
        state = this.store.load(plan.missionId);
        if (state.planHash !== digest(plan)) {
          throw new DurableMissionError(
            'MISSION_PLAN_DRIFT',
            'Mission plan changed after execution started.',
          );
        }
        if (state.status === 'completed') return missionSummary(state);
        if (handle.reclaimed) {
          appendEvent(state, 'lock_reclaimed', {
            previousOwnerPidHash: digest(handle.previousOwnerPid),
          }, this.clock);
        }
        appendEvent(state, 'mission_resumed', { planHash: state.planHash }, this.clock);
        state.status = 'running';
        state = this.store.save(state);
      } else {
        if (resume) {
          throw new DurableMissionError('MISSION_NOT_FOUND', 'Mission state was not found.');
        }
        state = initialState(plan, this.clock);
        appendEvent(state, 'mission_created', { planHash: state.planHash }, this.clock);
        state.status = 'running';
        state = this.store.save(state);
      }

      for (const [index, step] of plan.steps.entries()) {
        const progress = state.steps[index];
        if (
          progress.stepId !== step.stepId
          || progress.requestHash !== digest(step.request)
          || progress.idempotencyHash !== digest(step.request.idempotencyKey)
        ) {
          throw new DurableMissionError('MISSION_PLAN_DRIFT', 'Mission step identity changed.');
        }
        if (progress.status === 'completed') continue;
        if (progress.status === 'running') {
          progress.status = 'pending';
          appendEvent(state, 'step_recovered', {
            stepId: step.stepId,
            requestHash: progress.requestHash,
            idempotencyHash: progress.idempotencyHash,
          }, this.clock);
          state = this.store.save(state);
        } else if (progress.status === 'failed') {
          progress.status = 'pending';
          appendEvent(state, 'step_retry_scheduled', {
            stepId: step.stepId,
            requestHash: progress.requestHash,
            idempotencyHash: progress.idempotencyHash,
          }, this.clock);
          state = this.store.save(state);
        }

        const active = state.steps[index];
        active.status = 'running';
        active.attempts += 1;
        active.errorCode = null;
        appendEvent(state, 'step_started', {
          stepId: step.stepId,
          attempt: active.attempts,
          requestHash: active.requestHash,
          idempotencyHash: active.idempotencyHash,
        }, this.clock);
        state = this.store.save(state);

        let receipt;
        try {
          const result = await this.executor(step.request, {
            missionId: plan.missionId,
            stepId: step.stepId,
            attempt: state.steps[index].attempts,
            projectId: plan.projectId,
            story: plan.story,
          });
          receipt = sanitizeReceipt(result?.receipt);
          if (
            receipt.requestId !== step.request.requestId
            || receipt.operation !== step.request.operation
            || receipt.idempotencyHash !== digest(step.request.idempotencyKey)
          ) {
            throw new DurableMissionError(
              'MISSION_EVIDENCE_MISMATCH',
              'Mission receipt does not match the dispatched step.',
            );
          }
        } catch (error) {
          const failed = state.steps[index];
          failed.status = 'failed';
          failed.errorCode = error.code || 'MISSION_STEP_FAILED';
          appendEvent(state, 'step_failed', {
            stepId: step.stepId,
            attempt: failed.attempts,
            code: failed.errorCode,
          }, this.clock);
          state.status = 'failed';
          state = this.store.save(state);
          return missionSummary(state);
        }

        // Deliberately outside the executor catch: if this durable write fails,
        // the preceding `running` checkpoint remains authoritative for resume.
        const completed = state.steps[index];
        completed.status = 'completed';
        completed.receipt = receipt;
        completed.errorCode = null;
        appendEvent(state, 'step_completed', {
          stepId: step.stepId,
          attempt: completed.attempts,
          receipt,
        }, this.clock);
        state = this.store.save(state);
      }

      state.status = 'completed';
      appendEvent(state, 'mission_completed', {
        completedSteps: state.steps.length,
      }, this.clock);
      state = this.store.save(state);
      return missionSummary(state);
    } finally {
      this.store.releaseLock(handle);
    }
  }
}

module.exports = {
  DurableMissionError,
  DurableMissionRunner,
  MissionStore,
  MISSION_PROTOCOL,
  digest,
  missionSummary,
  sanitizeReceipt,
  stateIntegrity,
  validateEvidence,
  validateMissionPlan,
};
