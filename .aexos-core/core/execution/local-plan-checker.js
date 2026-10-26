'use strict';

const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { relativeFile } = require(path.resolve(__dirname, 'execution-binding'));
const { inspectPlanningEvidence, verifyPlanningSelection } = require(path.resolve(__dirname, 'brownfield-planning'));

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function fail(code, message) { throw Object.assign(new Error(message), { code }); }

/** Fixed Node test launcher. The explicit process capability authorizes code execution,
 * not a child-process filesystem sandbox. Only caller-approved test bytes may execute. */
async function nodeTest(target, projectRoot) {
  return new Promise((resolve, reject) => {
    const env = {};
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
    env.PATH = path.dirname(process.execPath);
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', target], {
      cwd: projectRoot, shell: false, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let bytes = 0;
    const stdout = [];
    const stderr = [];
    let limit = null;
    const timer = setTimeout(() => { limit = 'LOCAL_CHECK_TIMEOUT'; child.kill(); }, 30000);
    const capture = (chunks) => (chunk) => {
      bytes += chunk.length;
      if (bytes > 256 * 1024) { limit = 'LOCAL_CHECK_OUTPUT_LIMIT'; child.kill(); }
      else chunks.push(chunk);
    };
    child.stdout.on('data', capture(stdout));
    child.stderr.on('data', capture(stderr));
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (limit) return reject(Object.assign(new Error('Local test resource limit exceeded.'), { code: limit }));
      const output = Buffer.concat(stdout);
      const count = (name) => Number(output.toString('utf8').match(new RegExp(`^# ${name} (\\d+)\\r?$`, 'm'))?.[1] || 0);
      const testNames = [...output.toString('utf8').matchAll(/^# Subtest: (.+)\r?$/gm)].map((match) => match[1].trim());
      const fileKey = (value) => {
        const absolute = path.resolve(projectRoot, value);
        return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
      };
      // Node counts successful loading of an empty file as a passing file-level
      // subtest. That wrapper cannot prove a declared behavioral test ran.
      const namedTests = testNames.filter((name) => fileKey(name) !== fileKey(target));
      return resolve({ exitCode, signal, stdoutHash: hash(output), stderrHash: hash(Buffer.concat(stderr)), bytes,
        tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'), cancelled: count('cancelled'),
        testNames, namedTests,
      });
    });
  });
}

class LocalPlanChecker {
  constructor({ projectRoot, capabilityBroker, getGuard, phases, evidenceSink = () => {} }) {
    this.projectRoot = projectRoot;
    this.broker = capabilityBroker;
    this.getGuard = getGuard;
    this.evidenceSink = evidenceSink;
    this.phases = phases;
    this.bindings = new Map();
  }

  bind(phaseId, binding) { this.bindings.set(phaseId, binding); }

  authorize(phase, capability, action, target) {
    const binding = this.bindings.get(phase.id);
    const resource = path.resolve(this.projectRoot, target);
    const lease = binding?.requiredCapabilities.find((entry) => entry.capability === capability
      && entry.action === action && entry.resource === resource && entry.scope === this.projectRoot);
    if (!lease) fail('LOCAL_CHECK_CAPABILITY_REQUIRED', 'Declared check requires an exact operation lease.');
    this.broker.verify(lease.token, { ...lease, agentId: binding.agentId, task: binding.task });
  }

  async read(phase, target, maxBytes) {
    relativeFile(this.projectRoot, target, { mustExist: true });
    this.authorize(phase, 'filesystem', 'read', target);
    const result = await this.getGuard().dispatchFilesystem({ operation: 'read', target, ...(maxBytes ? { maxBytes } : {}) });
    if (result.success !== true) fail('LOCAL_CHECK_READ_DENIED', 'Declared check could not read its confined artifact.');
    return result.data;
  }

  async verify(phase, stage) {
    if (stage === 'before' && phase.inputs?.brownfieldEvidence) {
      await inspectPlanningEvidence(phase, { projectRoot: this.projectRoot,
        read: (target, limit) => this.read(phase, target, limit) });
    }
    const checks = phase.checks.filter((check) => check.stage === stage);
    for (const [index, check] of checks.entries()) {
      const content = await this.read(phase, check.target);
      if (hash(Buffer.from(content, 'utf8')) !== check.sha256) {
        fail('LOCAL_CHECK_HASH_MISMATCH', 'Checked UTF-8 artifact differs from the operator-approved hash.');
      }
      let observation = { type: check.type, target: check.target, sha256: check.sha256 };
      if (check.type === 'node-test') {
        this.authorize(phase, 'process', 'node-test', check.target);
        const permission = await this.getGuard().guard('Bash', { command: `node --test ${check.target}` });
        if (permission.proceed !== true) fail('LOCAL_CHECK_PROCESS_DENIED', 'Permission mode does not authorize the declared local test.');
        // Recheck bytes immediately before the fixed argv launch. This is not a
        // sandbox or a defense against a hostile same-user process changing code.
        if (hash(Buffer.from(await this.read(phase, check.target), 'utf8')) !== check.sha256) {
          fail('LOCAL_CHECK_CHANGED', 'Approved test changed before execution.');
        }
        const result = await nodeTest(check.target, this.projectRoot);
        observation = { ...observation, ...result };
        const passed = result.exitCode === check.expectedExit && result.signal === null && result.tests === check.expectedTests
          && result.namedTests.length > 0 && check.testNames.every((name) => result.namedTests.includes(name))
          && result.skipped === 0 && result.cancelled === 0 && (check.expectedExit === 0 ? result.failed === 0 && result.passed > 0 : result.failed > 0);
        this.evidenceSink({ phaseId: phase.id, stage, index, ...observation, passed });
        if (!passed) fail('LOCAL_CHECK_TEST_FAILED', 'The actual nonempty local test outcome did not match the declared requirement.');
      } else {
        this.evidenceSink({ phaseId: phase.id, stage, index, ...observation, passed: true });
      }
    }
    if (stage === 'after') await this.verifySemanticArtifact(phase);
    return true;
  }

  async verifySemanticArtifact(phase) {
    if (phase.id === 'create-story' || phase.id === 'validate-story') {
      const target = phase.id === 'create-story' ? phase.inputs.output : this.phases.get('create-story').inputs.output;
      const story = await this.read(phase, target);
      if (!/^# Story [A-Za-z0-9._-]+/m.test(story)
        || !/^## Status\r?\n+\s*(Ready|Draft)\b/m.test(story)
        || !/^## Acceptance Criteria\r?\n[\s\S]*^- \[[ x]\] .+/m.test(story)) {
        fail('LOCAL_STORY_ARTIFACT_INVALID', 'The created story must declare identity, lifecycle status and concrete acceptance criteria.');
      }
      this.evidenceSink({ phaseId: phase.id, type: 'story-structure', target, passed: true });
    }
    if (phase.id === 'plan-implementation') {
      let plan;
      try { plan = JSON.parse(await this.read(phase, phase.inputs.output)); }
      catch { fail('LOCAL_PLAN_ARTIFACT_INVALID', 'Implementation plan must be valid structured JSON.'); }
      const implementation = this.phases.get('implement-story');
      const source = implementation.operations.find((operation) => operation.target === implementation.inputs.source);
      const test = this.phases.get('run-tests').checks.find((check) => check.type === 'node-test');
      if (plan.planVersion !== 1 || plan.source !== source.target
        || plan.afterSha256 !== hash(Buffer.from(source.contentBase64, 'base64')) || plan.testFile !== test.target) {
        fail('LOCAL_PLAN_ARTIFACT_INVALID', 'Implementation plan must match the approved source change and actual behavioral test.');
      }
      const proof = await inspectPlanningEvidence(phase, { projectRoot: this.projectRoot,
        read: (target, limit) => this.read(phase, target, limit) });
      const selection = verifyPlanningSelection(proof, plan.brownfield, source.target);
      if (selection) this.evidenceSink({ phaseId: phase.id, ...selection });
      this.evidenceSink({ phaseId: phase.id, type: 'implementation-plan', target: phase.inputs.output, passed: true });
    }
  }
}

module.exports = { LocalPlanChecker, nodeTest };
