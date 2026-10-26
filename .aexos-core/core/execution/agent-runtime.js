/**
 * Governed execution boundary for AEXOS agents.
 */

'use strict';

const {
  createDispatchGovernance,
  getDefaultDispatchGovernance,
  hashDispatchIntent,
  redactGovernanceDecision,
} = require('../permissions/dispatch-governance');
const { assertProducedPaths, normalizeTaskContract } = require('./task-contract');
const { verifyTaskOutcome } = require('./outcome-verifier');
const { OperationGuard } = require('../permissions/operation-guard');
const { PermissionMode } = require('../permissions/permission-mode');
const { assertSopRuntimeHooks } = require('../workflow-engineering/sop/runtime-association');
const path = require('path');
const crypto = require('node:crypto');

function governedOperation(operation) {
  if (!operation || typeof operation.contentBase64 !== 'string') return operation;
  const { contentBase64, ...metadata } = operation;
  return { ...metadata, encodedContentLength: contentBase64.length,
    encodedContentSha256: crypto.createHash('sha256').update(contentBase64).digest('hex') };
}

function operationKey(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(operationKey(item))));
  if (value && typeof value === 'object') return JSON.stringify(Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, JSON.parse(operationKey(value[key]))]),
  ));
  return JSON.stringify(value);
}

class AgentRuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AgentRuntimeError';
    this.code = code;
    this.details = details;
  }
}

function hashIntent(request) {
  return hashDispatchIntent(request);
}

function assertGovernanceController(controller) {
  if (!controller || ['evaluate', 'verify', 'settle'].some(
    (method) => typeof controller[method] !== 'function',
  )) {
    throw new AgentRuntimeError(
      'AGENT_RUNTIME_GOVERNANCE_REQUIRED',
      'AgentRuntime requires governance with evaluate(), verify(), and settle().',
    );
  }
  return controller;
}

function assertRuntime(runtime) {
  if (!runtime || typeof runtime.execute !== 'function') {
    throw new AgentRuntimeError(
      'AGENT_RUNTIME_REQUIRED',
      'AEXOS execution requires an AgentRuntime with execute(request).',
    );
  }
  return runtime;
}

class AgentRuntime {
  constructor(options = {}) {
    if (!options.provider || (
      typeof options.provider.execute !== 'function'
      && typeof options.provider.executeWithRetry !== 'function'
    )) {
      throw new AgentRuntimeError(
        'AGENT_RUNTIME_PROVIDER_REQUIRED',
        'AgentRuntime requires an executable provider.',
      );
    }

    this.provider = options.provider;
    this.evidenceSink = options.evidenceSink || (() => {});
    this.projectRoot = options.projectRoot || process.cwd();
    this.operationGuard = new OperationGuard(new PermissionMode(this.projectRoot));
    this.trustedReceiptSink = options.trustedReceiptSink;
    this.trustedReceiptResolver = options.trustedReceiptResolver;
    this.nativePhaseObserver = options.nativePhaseObserver;
    this.nativeFiniteSessionAuthorization = options.nativeFiniteSessionAuthorization;
    this.nativeValidationAuthorization = options.nativeValidationAuthorization;
    this.trustedPublicationAccounting = options.trustedPublicationAccounting;
    this.sopRuntimeHooks = options.sopRuntimeHooks === undefined
      ? null : assertSopRuntimeHooks(options.sopRuntimeHooks);
    this.clock = options.clock || (() => new Date());
    this.capabilityBroker = options.capabilityBroker || null;
    this.outcomeVerifiers = options.outcomeVerifiers || {};
    if (
      this.capabilityBroker
      && ['verify', 'inspect'].some((method) => typeof this.capabilityBroker[method] !== 'function')
    ) {
      throw new AgentRuntimeError(
        'AGENT_RUNTIME_CAPABILITY_BROKER_INVALID',
        'AgentRuntime capabilityBroker requires verify() and inspect().',
      );
    }
    const governanceOptions = {
      clock: this.clock,
      tokenSecret: options.governanceTokenSecret,
      tokenTtlMs: options.governanceTokenTtlMs,
      budgetSink: options.budgetSink,
      flushIntervalMs: options.budgetFlushIntervalMs,
    };
    if (typeof options.governance === 'function') governanceOptions.policy = options.governance;
    const customGovernance = typeof options.governance === 'function'
      || options.governanceTokenSecret !== undefined
      || options.governanceTokenTtlMs !== undefined
      || options.clock !== undefined
      || options.budgetSink !== undefined
      || options.budgetFlushIntervalMs !== undefined;
    this.governance = assertGovernanceController(options.governanceController || (
      customGovernance
        ? createDispatchGovernance(governanceOptions)
        : getDefaultDispatchGovernance()
    ));
  }

  capabilities() {
    const providerCapabilities = typeof this.provider.capabilities === 'function'
      ? this.provider.capabilities()
      : {};
    const governanceCapabilities = typeof this.governance.capabilities === 'function'
      ? this.governance.capabilities()
      : {};
    const brokerCapabilities = typeof this.capabilityBroker?.capabilities === 'function'
      ? this.capabilityBroker.capabilities()
      : {};
    return {
      governed: true,
      structuredResults: true,
      taskContracts: true,
      ...governanceCapabilities,
      ...brokerCapabilities,
      ...providerCapabilities,
    };
  }

  async execute(request = {}) {
    this._validateRequest(request);
    request = structuredClone(request);
    const requiresAcceptance = request.requireAcceptance === true;
    const acceptanceRoot = request.projectRoot || this.projectRoot;
    const acceptanceContract = requiresAcceptance
      ? normalizeTaskContract(structuredClone(request.contract), acceptanceRoot) : null;
    let decision;
    let tokenClaims;
    const governanceRequest = this._buildGovernanceRequest(request);
    const intentHash = hashIntent(governanceRequest);

    try {
      decision = this.governance.evaluate(governanceRequest);
      tokenClaims = this.governance.verify(decision.token, governanceRequest);
    } catch (error) {
      this._recordEvidence({
        type: 'governance_rejected',
        intentHash,
        agentId: request.agentId,
        task: request.task,
        code: error.code || 'DISPATCH_GOVERNANCE_REJECTED',
      });
      throw error;
    }

    let capabilityEvidence;
    try {
      capabilityEvidence = this._verifyCapabilities(request);
    } catch (error) {
      this.governance.settle(tokenClaims, 0);
      this._recordEvidence({
        type: 'capability_rejected',
        intentHash,
        agentId: request.agentId,
        task: request.task,
        code: error.code || 'CAPABILITY_DENIED',
      });
      throw error;
    }

    const publicDecision = redactGovernanceDecision(decision);
    const governanceEvidence = {
      type: 'governance_approved',
      intentHash,
      agentId: request.agentId,
      task: request.task,
      storyId: decision.story?.storyId || null,
      budgetCeilingUsd: decision.budgetCeilingUsd,
      budgetScopeHash: publicDecision.budget?.scopeHash || null,
      budgetPressure: publicDecision.budget?.pressure ?? null,
      capabilities: capabilityEvidence,
      issuedAt: decision.issuedAt,
      expiresAt: decision.expiresAt,
    };
    try {
      this._recordEvidence(governanceEvidence);
    } catch (error) {
      this.governance.settle(tokenClaims, 0);
      throw error;
    }

    let sopAssociation = null;
    if (this.sopRuntimeHooks) {
      try {
        sopAssociation = await this.sopRuntimeHooks.admitPhase({
          request: Object.freeze(structuredClone(request)),
          governanceEvidence: Object.freeze(structuredClone(governanceEvidence)),
          capabilityEvidence: Object.freeze(structuredClone(capabilityEvidence)),
        });
        this.sopRuntimeHooks.revalidatePhase(sopAssociation);
      } catch (error) {
        this.governance.settle(tokenClaims, 0);
        this._recordEvidence({ type: 'sop_association_rejected', intentHash,
          agentId: request.agentId, task: request.task,
          code: error.code || 'SOP_ASSOCIATION_REJECTED' });
        throw error;
      }
    }

    const startedAt = Date.now();
    let providerResult;
    let normalizedResult;
    let executionError;
    let settlement = { status: 'pending', code: null };
    try {
      providerResult = await this._executeProvider(request, capabilityEvidence, () => {
        if (typeof this.governance.revalidate !== 'function') {
          throw new AgentRuntimeError('FILESYSTEM_GOVERNANCE_REVALIDATION_REQUIRED', 'Filesystem suboperations require active phase revalidation.');
        }
        this.governance.revalidate(decision.token, governanceRequest);
        if (sopAssociation) this.sopRuntimeHooks.revalidatePhase(sopAssociation);
      }, governanceEvidence.storyId, { intentHash, budgetCeilingUsd: governanceEvidence.budgetCeilingUsd,
        budgetScopeHash: governanceEvidence.budgetScopeHash, expiresAt: governanceEvidence.expiresAt });
      const result = this._normalizeResult(providerResult, request, {
        ...governanceEvidence,
        durationMs: Date.now() - startedAt,
      });
      normalizedResult = result;

      if (result.success && request.contract) {
        result.produced = assertProducedPaths(
          request.contract,
          result.produced,
          request.projectRoot || this.projectRoot,
        );
      }

      if (requiresAcceptance) {
        const filesystemPhase = request.filesystemOperation !== undefined
          || (request.approvedFilesystemOperations || []).length > 0;
        const acceptanceAuthority = async () => {
          if (!filesystemPhase) return true;
          try {
            await this.operationGuard.revalidateFilesystemAuthority(request.filesystemOperation
              ? [request.filesystemOperation] : request.approvedFilesystemOperations, {
              nativeValidationAuthorization: this.nativeValidationAuthorization,
              nativeFiniteSessionAuthorization: this.nativeFiniteSessionAuthorization,
            });
            this.governance.revalidate(decision.token, governanceRequest);
            this._verifyCapabilities(request);
            if (sopAssociation) this.sopRuntimeHooks.revalidatePhase(sopAssociation);
            return true;
          } catch (error) {
            result.success = false;
            result.status = 'failed';
            result.error = { code: error.code || 'FILESYSTEM_AUTHORITY_EXPIRED', reason: 'Phase authority is no longer valid for acceptance; retained effects require review.' };
            result.acceptance = { accepted: false, code: result.error.code };
            return false;
          }
        };
        if (await acceptanceAuthority()) {
          try {
            result.acceptance = await verifyTaskOutcome({
              contract: acceptanceContract,
              success: result.success,
              produced: result.produced,
            }, {
              projectRoot: acceptanceRoot,
              verifiers: this.outcomeVerifiers,
            });
          } catch (error) {
            if (!filesystemPhase) throw error;
            result.success = false;
            result.status = 'failed';
            result.error = { code: error.code || 'OUTCOME_CHECK_FAILED', reason: 'Outcome verification failed; retained filesystem effects require review.' };
            result.acceptance = { verdict: 'REJECTED', code: result.error.code };
          }
          await acceptanceAuthority();
        }
      }
    } catch (error) {
      if (!providerResult?.filesystemResult && !providerResult?.filesystemResults?.length) executionError = error;
      else {
        normalizedResult = this._normalizeResult({ success: false, produced: [],
          filesystemResult: providerResult.filesystemResult, filesystemResults: providerResult.filesystemResults,
          metadata: providerResult.metadata,
          error: { code: 'FILESYSTEM_PHASE_FINALIZATION_FAILED', reason: 'Phase finalization failed; retained filesystem results require review.' },
        }, request, { ...governanceEvidence, durationMs: Date.now() - startedAt });
        if (requiresAcceptance) normalizedResult.acceptance = { verdict: 'REJECTED', code: 'FILESYSTEM_PHASE_FINALIZATION_FAILED' };
      }
    } finally {
      let terminalAuthorityError = null;
      if (sopAssociation) {
        try { this.sopRuntimeHooks.revalidatePhase(sopAssociation); }
        catch (error) { terminalAuthorityError = error; }
      }
      try {
        this.governance.settle(tokenClaims, providerResult?.metadata?.costUsd);
        settlement = { status: 'settled', code: null };
      }
      catch (error) {
        settlement = { status: 'failed', code: error.code || 'FILESYSTEM_PHASE_SETTLEMENT_FAILED' };
        if (!normalizedResult?.filesystemResult && !normalizedResult?.filesystemResults?.length) executionError ||= error;
        else {
          normalizedResult.success = false;
          normalizedResult.status = 'failed';
          normalizedResult.error = { code: 'FILESYSTEM_PHASE_SETTLEMENT_FAILED', reason: 'Budget settlement failed; retained filesystem results require review.' };
          normalizedResult.acceptance = { verdict: 'REJECTED', code: 'FILESYSTEM_PHASE_SETTLEMENT_FAILED' };
        }
      }
      if (sopAssociation) {
        try { this.sopRuntimeHooks.revalidatePhase(sopAssociation); }
        catch (error) { terminalAuthorityError ||= error; }
      }
      if (terminalAuthorityError) {
        settlement = { status: 'failed', code: terminalAuthorityError.code || 'SOP_ASSOCIATION_AUTHORITY_CHANGED' };
        if (normalizedResult) {
          normalizedResult.success = false;
          normalizedResult.status = 'failed';
          normalizedResult.error = { code: settlement.code,
            reason: 'SOP authority changed at terminal settlement; retained filesystem effects require review.' };
          normalizedResult.acceptance = { verdict: 'REJECTED', code: settlement.code };
        } else executionError ||= terminalAuthorityError;
      }
    }
    if (sopAssociation) {
      const effectsObserved = Boolean(normalizedResult?.filesystemResult
        || normalizedResult?.filesystemResults?.length);
      try {
        const terminal = await this.sopRuntimeHooks.finishPhase(sopAssociation, {
          result: normalizedResult ? Object.freeze(structuredClone(normalizedResult)) : null,
          error: executionError ? { code: executionError.code || 'AGENT_RUNTIME_EXECUTION_FAILED' } : null,
          settlement: Object.freeze({ ...settlement }),
        });
        if (terminal?.accepted === false && normalizedResult) {
          normalizedResult.success = false;
          normalizedResult.status = 'failed';
          normalizedResult.error = { code: terminal.code || 'SOP_ASSOCIATION_OUTCOME_REJECTED',
            reason: 'SOP association did not retain an eligible terminal outcome.' };
          normalizedResult.acceptance = { verdict: 'REJECTED', code: normalizedResult.error.code };
        }
      } catch (error) {
        if (!effectsObserved || !normalizedResult) executionError ||= error;
        else {
          normalizedResult.success = false;
          normalizedResult.status = 'failed';
          normalizedResult.error = { code: 'SOP_ASSOCIATION_RETENTION_FAILED',
            reason: 'SOP terminal retention failed after observed effects; retained effects require review.' };
          normalizedResult.acceptance = { verdict: 'REJECTED', code: 'SOP_ASSOCIATION_RETENTION_FAILED' };
        }
      }
    }
    if (executionError) throw executionError;
    return normalizedResult;
  }

  _buildGovernanceRequest(request) {
    return {
      agentId: request.agentId,
      task: request.task,
      intent: request.filesystemOperation === undefined ? request.prompt
        + (request.approvedFilesystemOperations === undefined ? ''
          : `\nApproved filesystem operations: ${operationKey(request.approvedFilesystemOperations.map(governedOperation))}`)
        : `${request.prompt}\nStructured filesystem intent: ${operationKey(governedOperation(request.filesystemOperation))}`,
      story: request.story,
      budgetCeilingUsd: request.budgetCeilingUsd,
      budgetScope: request.budgetScope,
      estimatedCostUsd: request.estimatedCostUsd,
      requiresStory: request.requiresStory === true
        || String(request.filesystemOperation?.operation || '').startsWith('guarded-')
        || (request.approvedFilesystemOperations || []).some((operation) => String(operation.operation || '').startsWith('guarded-')),
      requiredCapabilities: request.requiredCapabilities,
      projectRoot: request.projectRoot || this.projectRoot,
    };
  }

  _verifyCapabilities(request) {
    if (request.requiredCapabilities === undefined) return [];
    if (!Array.isArray(request.requiredCapabilities)) {
      throw new AgentRuntimeError(
        'AGENT_RUNTIME_CAPABILITY_REQUEST_INVALID',
        'requiredCapabilities must be an array.',
      );
    }
    if (request.requiredCapabilities.length > 0 && !this.capabilityBroker) {
      throw new AgentRuntimeError(
        'AGENT_RUNTIME_CAPABILITY_BROKER_REQUIRED',
        'AgentRuntime requires a capability broker for declared capabilities.',
      );
    }
    return request.requiredCapabilities.map((requirement) => {
      if (!requirement || typeof requirement !== 'object' || !requirement.token) {
        throw new AgentRuntimeError(
          'AGENT_RUNTIME_CAPABILITY_REQUEST_INVALID',
          'Each capability requirement must contain a lease token and exact use identity.',
        );
      }
      return this.capabilityBroker.verify(requirement.token, {
        agentId: request.agentId,
        task: request.task,
        capability: requirement.capability,
        action: requirement.action,
        resource: requirement.resource,
        scope: requirement.scope,
      });
    });
  }

  _validateRequest(request) {
    if (request.approvedFilesystemOperations !== undefined && (
      !Array.isArray(request.approvedFilesystemOperations)
      || request.approvedFilesystemOperations.length > 64
      || request.approvedFilesystemOperations.some((operation) => !operation
        || typeof operation !== 'object' || Array.isArray(operation))
      || (request.projectRoot && path.resolve(request.projectRoot) !== path.resolve(this.projectRoot))
    )) throw new AgentRuntimeError('FILESYSTEM_REQUEST_INVALID', 'Approved operations must be a bounded array bound to the runtime root.');
    if (request.filesystemOperation !== undefined && (
      !request.filesystemOperation || typeof request.filesystemOperation !== 'object'
      || Array.isArray(request.filesystemOperation)
      || (request.projectRoot && path.resolve(request.projectRoot) !== path.resolve(this.projectRoot))
    )) throw new AgentRuntimeError('FILESYSTEM_REQUEST_INVALID', 'Structured operations require a valid request bound to the runtime authorized project root.');
    if (request.requireAcceptance !== undefined && typeof request.requireAcceptance !== 'boolean') {
      throw new AgentRuntimeError('OUTCOME_POLICY_INVALID', 'requireAcceptance must be boolean.');
    }
    if (request.requireAcceptance === true && !request.contract) {
      throw new AgentRuntimeError('OUTCOME_CONTRACT_REQUIRED', 'Required acceptance needs a task contract before dispatch.');
    }
    for (const field of ['agentId', 'task', 'prompt']) {
      if (!request[field] || typeof request[field] !== 'string') {
        throw new AgentRuntimeError(
          'AGENT_RUNTIME_REQUEST_INVALID',
          `AgentRuntime request requires a non-empty ${field}.`,
          { field },
        );
      }
    }
  }

  _verifyFilesystemCapability(request, operation) {
    const root = path.resolve(this.projectRoot);
    if (!operation || typeof operation.target !== 'string' || typeof operation.operation !== 'string') {
      throw new AgentRuntimeError('FILESYSTEM_REQUEST_INVALID', 'Filesystem operation requires a target and action.');
    }
    const resource = path.resolve(root, operation.target);
    const requirement = request.requiredCapabilities?.find((entry) => entry.capability === 'filesystem'
      && entry.action === operation.operation && entry.resource === resource && entry.scope === root);
    if (!requirement || !this.capabilityBroker) {
      throw new AgentRuntimeError('FILESYSTEM_CAPABILITY_REQUIRED', 'Exact filesystem operation lease is required.');
    }
    return this.capabilityBroker.verify(requirement.token, {
      agentId: request.agentId, task: request.task, capability: 'filesystem',
      action: operation.operation, resource, scope: root,
    });
  }

  async _executeProvider(request, capabilityEvidence = [], verifyGovernance = () => {}, storyId = null, phaseAuthority = {}) {
    if (request.filesystemOperation !== undefined) {
      verifyGovernance();
      let lease;
      if (['guarded-create', 'guarded-recoverable-replace', 'guarded-recover'].includes(request.filesystemOperation.operation)) {
        lease = this._verifyFilesystemCapability(request, request.filesystemOperation);
      }
      return this.operationGuard.dispatchFilesystem(request.filesystemOperation, {
        verifyAuthority: () => { verifyGovernance(); this._verifyFilesystemCapability(request, request.filesystemOperation); },
        trustedReceiptSink: this.trustedReceiptSink,
        trustedReceiptResolver: this.trustedReceiptResolver,
        nativePhaseObserver: this.nativePhaseObserver,
        nativeFiniteSessionAuthorization: this.nativeFiniteSessionAuthorization,
        nativeValidationAuthorization: this.nativeValidationAuthorization,
        trustedPublicationAccounting: this.trustedPublicationAccounting,
        authority: { ...phaseAuthority, agentId: request.agentId, task: request.task, story: storyId, leaseId: lease?.leaseId },
      }).then((result) => {
        let authorityError;
        try {
          verifyGovernance();
          if (lease) this._verifyFilesystemCapability(request, request.filesystemOperation);
        } catch (error) {
          authorityError = { code: error.code || 'FILESYSTEM_AUTHORITY_EXPIRED',
            reason: 'Phase authority is no longer valid; retained filesystem effects require review.' };
        }
        // Authority loss rejects acceptance, not the already observed effect evidence.
        return {
          success: !authorityError && result.success, output: !authorityError && result.success ? result.data || '' : '',
          error: authorityError || (result.success ? null : { code: result.code, reason: result.reason }),
          filesystemResult: result, produced: [], metadata: { costUsd: 0 },
        };
      });
    }
    const method = typeof this.provider.executeWithRetry === 'function'
      ? 'executeWithRetry'
      : 'execute';
    const providerRequest = {
      ...request,
      requiredCapabilities: capabilityEvidence,
    };
    const approved = (request.approvedFilesystemOperations || []).map(operationKey);
    const consumed = new Set();
    const pending = new Set();
    const filesystemResults = [];
    const filesystemOperationEvidence = [];
    let active = true;
    let failed = false;
    const dispatchFilesystem = (operation) => {
      const promise = (async () => {
        if (!active) throw new AgentRuntimeError('FILESYSTEM_PHASE_CLOSED', 'Filesystem phase is closed.');
        const snapshot = structuredClone(operation);
        const index = approved.indexOf(operationKey(snapshot));
        if (index < 0 || consumed.has(index)) {
          throw new AgentRuntimeError('FILESYSTEM_INTENT_MISMATCH', 'Operation must exactly match an unused approved intent.');
        }
        consumed.add(index);
        verifyGovernance();
        const lease = this._verifyFilesystemCapability(request, snapshot);
        const result = await this.operationGuard.dispatchFilesystem(snapshot, {
          verifyAuthority: () => { verifyGovernance(); this._verifyFilesystemCapability(request, snapshot); },
          trustedReceiptSink: this.trustedReceiptSink,
          trustedReceiptResolver: this.trustedReceiptResolver,
          nativePhaseObserver: this.nativePhaseObserver,
          nativeFiniteSessionAuthorization: this.nativeFiniteSessionAuthorization,
          nativeValidationAuthorization: this.nativeValidationAuthorization,
          trustedPublicationAccounting: this.trustedPublicationAccounting,
          authority: { ...phaseAuthority, agentId: request.agentId, task: request.task, story: storyId, leaseId: lease.leaseId },
        });
        try { verifyGovernance(); this._verifyFilesystemCapability(request, snapshot); }
        catch (error) {
          result.success = false;
          result.acceptanceCode = error.code || 'FILESYSTEM_AUTHORITY_EXPIRED';
        }
        filesystemResults.push(result);
        filesystemOperationEvidence.push({ index, operationHash: crypto.createHash('sha256')
          .update(operationKey(snapshot)).digest('hex'), success: result.success === true,
        finalized: result.success === true });
        if (!result.success) failed = true;
        return result;
      })();
      pending.add(promise);
      promise.then(() => pending.delete(promise), () => { failed = true; pending.delete(promise); });
      return promise;
    };
    let result;
    let providerError;
    try { result = await this.provider[method](request.prompt, {
      workingDir: request.projectRoot || this.projectRoot,
      timeout: request.timeout,
      jsonOutput: request.jsonOutput,
      request: providerRequest,
      dispatchFilesystem,
    }); } catch (error) {
      providerError = error;
    } finally {
      active = false;
      await Promise.allSettled([...pending]);
    }
    if (providerError) {
      if (filesystemResults.length === 0) throw providerError;
      return { success: false, produced: [], filesystemResults,
        filesystemOperationEvidence,
        error: { code: 'FILESYSTEM_PROVIDER_FAILED', reason: 'Provider failed after filesystem activity; retained results require review.' } };
    }
    if (failed) result = { ...result, success: false,
      error: { code: 'FILESYSTEM_PHASE_FAILED', reason: 'A governed filesystem operation did not complete successfully.' } };
    return { ...result, filesystemResults, filesystemOperationEvidence: filesystemOperationEvidence.sort((a, b) => a.index - b.index) };
  }

  _normalizeResult(providerResult, request, evidence) {
    if (!providerResult || typeof providerResult.success !== 'boolean') {
      throw new AgentRuntimeError(
        'AGENT_RUNTIME_RESULT_INVALID',
        'Provider result must declare a boolean success value.',
      );
    }

    const produced = providerResult.produced || providerResult.metadata?.produced || [];
    if (!Array.isArray(produced)) {
      throw new AgentRuntimeError(
        'AGENT_RUNTIME_RESULT_INVALID',
        'Provider result produced value must be an array.',
      );
    }

    return {
      success: providerResult.success,
      status: providerResult.success ? 'success' : 'failed',
      output: providerResult.output || '',
      error: providerResult.error || null,
      produced,
      ...(providerResult.filesystemResult ? { filesystemResult: providerResult.filesystemResult } : {}),
      ...(providerResult.filesystemResults ? { filesystemResults: providerResult.filesystemResults } : {}),
      ...(providerResult.filesystemOperationEvidence
        ? { filesystemOperationEvidence: providerResult.filesystemOperationEvidence } : {}),
      usage: {
        tokens: providerResult.metadata?.tokens ?? null,
        costUsd: providerResult.metadata?.costUsd ?? null,
        model: providerResult.metadata?.model ?? null,
      },
      evidence: {
        ...evidence,
        provider: this.provider.name || 'custom',
        contractVersion: request.contract?.contractVersion || null,
      },
    };
  }

  _recordEvidence(record) {
    this.evidenceSink(Object.freeze({ ...record }));
  }
}

function createLegacyRuntime(dispatchSubagent, options = {}) {
  if (typeof dispatchSubagent !== 'function') return null;
  const provider = {
    name: 'legacy-dispatch-adapter',
    execute: async (_prompt, providerOptions) => {
      const request = providerOptions.request;
      const result = await dispatchSubagent(request.legacyPayload || request);
      if (result && typeof result.success === 'boolean') return result;
      const status = String(result?.status || '').toLowerCase();
      if (['success', 'completed', 'done'].includes(status)) {
        return { success: true, output: result, metadata: result.metadata };
      }
      if (['failed', 'failure', 'error'].includes(status)) {
        return {
          success: false,
          output: result,
          error: result.error || result.message || 'Legacy dispatch failed.',
          metadata: result.metadata,
        };
      }
      throw new AgentRuntimeError(
        'AGENT_RUNTIME_RESULT_INVALID',
        'Legacy dispatch result must declare boolean success or a terminal status.',
      );
    },
  };
  const runtime = new AgentRuntime({
    provider,
    projectRoot: options.projectRoot,
    governance: options.governance,
    governanceController: options.governanceController,
    governanceTokenSecret: options.governanceTokenSecret,
    governanceTokenTtlMs: options.governanceTokenTtlMs,
    clock: options.clock,
    evidenceSink: options.evidenceSink,
    budgetSink: options.budgetSink,
    budgetFlushIntervalMs: options.budgetFlushIntervalMs,
    capabilityBroker: options.capabilityBroker,
  });
  const capabilities = runtime.capabilities.bind(runtime);
  runtime.deprecated = true;
  runtime.capabilities = () => ({
    ...capabilities(),
    legacyDispatchAdapter: true,
  });
  return runtime;
}

module.exports = {
  AgentRuntime,
  AgentRuntimeError,
  assertRuntime,
  createLegacyRuntime,
  hashIntent,
};
