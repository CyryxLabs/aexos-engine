/**
 * Epic6Executor - QA Loop Executor
 *
 * Story: 0.3 - Epic Executors (AC5)
 * Epic: Epic 0 - ADE Master Orchestrator
 *
 * Wraps qa-loop-orchestrator to execute review → fix → re-review cycles
 * until quality standards are met.
 *
 * @module core/orchestration/executors/epic-6-executor
 * @version 1.0.0
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const EpicExecutor = require('./epic-executor');

/**
 * QA verdict types
 */
const QAVerdict = {
  APPROVED: 'approved',
  NEEDS_REVISION: 'needs_revision',
  BLOCKED: 'blocked',
};

/**
 * Epic 6 Executor - QA Loop
 * Manages quality assurance review cycles
 */
class Epic6Executor extends EpicExecutor {
  constructor(orchestrator) {
    super(orchestrator, 6);
    this.maxIterations = 3;

    // Lazy-load QA orchestrator
    this._qaOrchestrator = null;
  }

  /**
   * Get QA Loop Orchestrator
   * @private
   */
  _getQAOrchestrator() {
    if (!this._qaOrchestrator) {
      try {
        const { QALoopOrchestrator } = require('../../../infrastructure/scripts/qa-loop-orchestrator');
        this._qaOrchestrator = QALoopOrchestrator;
      } catch (error) {
        this._log(`QA Loop Orchestrator not available: ${error.message}`, 'warn');
      }
    }
    return this._qaOrchestrator;
  }

  /**
   * Execute QA Loop
   * @param {Object} context - Execution context
   * @param {Object} context.buildResult - Result from Epic 4
   * @param {Array} context.testResults - Test results
   * @param {Array} context.codeChanges - Code changes to review
   * @returns {Promise<Object>} QA result with verdict
   */
  async execute(context) {
    this._startExecution();

    try {
      const { buildResult, testResults, codeChanges, storyId, techStack } = context;

      this._log(`Starting QA loop for ${storyId}`);

      let iteration = 0;
      let currentVerdict = QAVerdict.NEEDS_REVISION;
      const reviewHistory = [];

      while (iteration < this.maxIterations && currentVerdict === QAVerdict.NEEDS_REVISION) {
        iteration++;
        this._log(`QA iteration ${iteration}/${this.maxIterations}`);

        // Run review
        const reviewResult = await this._runReview({
          storyId,
          buildResult,
          testResults,
          codeChanges,
          iteration,
          techStack,
        });

        reviewHistory.push(reviewResult);
        this._addArtifact('qa-gate', reviewResult.gatePath, {
          gate: reviewResult.gate,
          reviewedRevision: reviewResult.reviewedRevision,
        });

        // Check verdict
        currentVerdict = reviewResult.verdict;

        if (currentVerdict === QAVerdict.BLOCKED) {
          this._log('Review blocked - critical issues found', 'error');
          break;
        }

        if (currentVerdict === QAVerdict.NEEDS_REVISION && iteration < this.maxIterations) {
          this._log('Review needs revision, applying fixes...');
          await this._applyFixes(reviewResult.issues, context);
        }
      }

      // Generate QA report
      const reportPath = await this._generateReport(storyId, reviewHistory, currentVerdict);
      this._addArtifact('qa-report', reportPath);

      const passed = currentVerdict === QAVerdict.APPROVED;
      const result = {
        verdict: currentVerdict,
        passed,
        iterations: iteration,
        reviewHistory,
        reportPath,
        gatePath: reviewHistory.at(-1)?.gatePath,
      };
      if (!passed) {
        return {
          ...this._failExecution(`QA did not approve the build: ${currentVerdict}`),
          ...result,
          blocked: true,
          pendingRequirements: ['An explicit APPROVED verdict from the configured QA executor'],
        };
      }
      return this._completeExecution(result);
    } catch (error) {
      return {
        ...this._failExecution(error),
        blocked: true,
        pendingRequirements: ['Successful real QA agent execution'],
      };
    }
  }

  /**
   * Run a single review cycle
   * @private
   */
  async _runReview(context) {
    const { iteration, techStack: _techStack } = context;

    this._log(`Running review cycle ${iteration}`);

    if (typeof this.orchestrator?.invokeAgent !== 'function') {
      throw new Error('No real QA agent executor configured');
    }
    const invocation = await this.orchestrator.invokeAgentForTask('qa', 'qa-review-story.md', context);
    const output = invocation?.result || {};
    if (!invocation?.success || output.success === false || output.status === 'simulated') {
      throw new Error(invocation?.error || output.error || 'QA executor failed');
    }
    const gate = String(output.gate || '').toUpperCase();
    const verdictMap = {
      PASS: QAVerdict.APPROVED,
      CONCERNS: QAVerdict.APPROVED,
      FAIL: QAVerdict.NEEDS_REVISION,
      WAIVED: QAVerdict.APPROVED,
    };
    const verdict = verdictMap[gate];
    if (!verdict) throw new Error('QA executor did not provide a canonical PASS|CONCERNS|FAIL|WAIVED gate');
    const gateArtifact = await this._validateGateArtifact(output.gatePath, gate);
    if (gate === 'WAIVED') {
      const waiver = gateArtifact.waiver;
      const approver = waiver?.approved_by || waiver?.approver;
      if (waiver?.active !== true || !waiver.reason || !approver) {
        throw new Error('WAIVED gate requires active waiver evidence with reason and approver');
      }
    }
    return {
      ...output,
      iteration,
      gate,
      verdict,
      gatePath: gateArtifact.path,
      reviewedRevision: gateArtifact.reviewedRevision,
      issues: Array.isArray(output.issues) ? output.issues : [],
      timestamp: new Date().toISOString(),
      invocationId: invocation.invocationId,
    };
  }

  async _validateGateArtifact(gatePath, expectedGate) {
    if (!gatePath || typeof gatePath !== 'string') {
      throw new Error('QA executor did not return gatePath');
    }
    const root = path.resolve(this.projectRoot);
    const absolute = path.isAbsolute(gatePath) ? path.resolve(gatePath) : path.resolve(root, gatePath);
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('QA gate artifact must be inside the consumer project');
    }
    const stat = await fs.lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) {
      throw new Error('QA gate artifact must be a regular, non-empty file');
    }
    const [realRoot, realArtifact] = await Promise.all([
      fs.realpath(root),
      fs.realpath(absolute),
    ]);
    const physicalRelative = path.relative(realRoot, realArtifact);
    if (physicalRelative.startsWith('..') || path.isAbsolute(physicalRelative)) {
      throw new Error('QA gate artifact resolves outside the consumer project');
    }
    const parsed = yaml.load(await fs.readFile(absolute, 'utf8'));
    if (!parsed || String(parsed.gate || '').toUpperCase() !== expectedGate) {
      throw new Error('Persisted QA gate does not match the executor verdict');
    }
    if (!parsed.reviewed_revision || !String(parsed.reviewed_revision).trim()) {
      throw new Error('Persisted QA gate is missing reviewed_revision provenance');
    }
    return {
      ...parsed,
      path: absolute,
      reviewedRevision: String(parsed.reviewed_revision),
    };
  }

  /**
   * Apply fixes for found issues
   * @private
   */
  async _applyFixes(issues, context) {
    this._log(`Applying fixes for ${issues.length} issues`);
    if (typeof this.orchestrator?.invokeAgent !== 'function') {
      throw new Error('No real development executor configured for QA fixes');
    }
    const invocation = await this.orchestrator.invokeAgentForTask('dev', 'dev-apply-qa-fixes.md', {
      ...context,
      issues,
    });
    const output = invocation?.result || {};
    if (!invocation?.success || output.success === false || output.status === 'simulated') {
      throw new Error(invocation?.error || output.error || 'QA fix executor failed');
    }
    return output;
  }

  /**
   * Generate QA report
   * @private
   */
  async _generateReport(storyId, reviewHistory, finalVerdict) {
    const reportPath = this._getPath('.aexos', 'qa-reports', `${storyId}-${Date.now()}.md`);

    const verdictEmoji = {
      [QAVerdict.APPROVED]: '✅',
      [QAVerdict.NEEDS_REVISION]: '⚠️',
      [QAVerdict.BLOCKED]: '❌',
    };

    let report = `# QA Report: ${storyId}

**Final Verdict:** ${verdictEmoji[finalVerdict]} ${finalVerdict.toUpperCase()}
**Iterations:** ${reviewHistory.length}
**Generated:** ${new Date().toISOString()}

---

## Review History

`;

    for (const review of reviewHistory) {
      report += `### Iteration ${review.iteration}

**Verdict:** ${verdictEmoji[review.verdict]} ${review.verdict}
**Time:** ${review.timestamp}
**Issues Found:** ${review.issues?.length || 0}

`;

      if (review.issues && review.issues.length > 0) {
        report += '**Issues:**\n\n';
        for (const issue of review.issues) {
          report += `- [${issue.severity}] ${issue.type}: ${issue.message}\n`;
        }
        report += '\n';
      }
    }

    report += `---
*Generated by Epic 6 QA Loop Executor*
`;

    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeFile(reportPath, report);

    return reportPath;
  }
}

module.exports = Epic6Executor;
module.exports.QAVerdict = QAVerdict;
