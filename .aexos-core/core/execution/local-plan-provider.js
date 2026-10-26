'use strict';

// A deterministic operation executor. It does not generate code or impersonate an LLM.
class LocalPlanProvider {
  constructor({ phases, beforePhase, evidenceSink = () => {} }) {
    this.name = 'local-plan';
    this.phases = phases;
    this.beforePhase = beforePhase;
    this.evidenceSink = evidenceSink;
  }

  capabilities() { return { deterministicLocalExecutor: true, liveModelIdentity: false }; }

  async execute(_prompt, options) {
    const phase = this.phases.get(options.request.phaseId);
    if (!phase || typeof options.dispatchFilesystem !== 'function') {
      throw Object.assign(new Error('The selected phase requires the governed filesystem dispatcher.'), { code: 'LOCAL_PLAN_RUNTIME_REQUIRED' });
    }
    await this.beforePhase(phase);
    const produced = [];
    for (const operation of phase.operations) {
      const result = await options.dispatchFilesystem(operation);
      this.evidenceSink({ phaseId: phase.id, operation: operation.operation, target: operation.target,
        success: result.success === true, code: result.code || null,
        state: result.phase || result.state || result.terminalPhase || null,
        effects: result.effects || null, transactionId: result.transactionId || null,
        receipt: result.receipt || null,
      });
      if (result.success !== true) {
        return { success: false, error: { code: result.code || 'LOCAL_PLAN_OPERATION_FAILED' }, produced, metadata: { costUsd: 0, model: null } };
      }
      if (['guarded-create', 'guarded-recoverable-replace'].includes(operation.operation)) produced.push(operation.target);
    }
    return { success: true, output: '', produced, metadata: { costUsd: 0, model: null, tokens: null } };
  }
}

module.exports = { LocalPlanProvider };
