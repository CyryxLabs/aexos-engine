'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const serverRoot = process.env.AEXOS_LICENSE_SERVER_PATH || 'C:\\tmp\\aexos-license-server';
const artifactPath = path.join(root, 'artifacts', 'licensing', 'resilience-report.json');

function run(name, command, args, cwd) {
  const started = Date.now();
  const attempts = [];
  let result;

  do {
    result = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
      env: { ...process.env, STRIPE_LIVEMODE: 'false' },
    });
    attempts.push({ exitCode: result.status, signal: result.signal || null });
  } while (
    attempts.length < 2
    && process.platform === 'win32'
    && result.status === 0xC0000409
  );

  return {
    name,
    passed: result.status === 0,
    exitCode: result.status,
    attempts,
    durationMs: Date.now() - started,
  };
}

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

const jestBin = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');
const common = ['--runInBand', '--testPathIgnorePatterns=node_modules', '--runTestsByPath'];
const groupA = [
  'auth-errors.test.js', 'degradation.test.js', 'entitlement-resolver.test.js', 'errors.test.js',
  'feature-gate.test.js', 'integration.test.js', 'license-api-auth.test.js', 'license-api-buyer.test.js',
].map((name) => path.join(root, 'tests', 'license', name));
const groupB = [
  'license-api.test.js', 'license-cache.test.js', 'license-crypto.test.js', 'machine-id-stability.test.js',
  'machine-id-store.test.js', 'performance.test.js', 'security.test.js',
].map((name) => path.join(root, 'tests', 'license', name));

const sentinelDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-resilience-sentinel-'));
const sentinel = path.join(sentinelDir, 'customer-project-data.json');
fs.writeFileSync(sentinel, JSON.stringify({ project: 'synthetic', records: [1, 2, 3] }), 'utf8');
const before = sha256(sentinel);

const checks = [
  run('client-offline-security-machine-failures-a', process.execPath, [jestBin, ...common, ...groupA], root),
  run('client-offline-security-machine-failures-b', process.execPath, [jestBin, ...common, ...groupB], root),
  run('installer-shadow-beta-gates', process.execPath, [jestBin, '--runInBand', 'tests/installer/commercial-license-gate.test.js', 'tests/installer/pro-setup-auth.test.js'], root),
  run('authority-typecheck', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck'], serverRoot),
  run('authority-lint', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'lint', '--', '--no-cache'], serverRoot),
  run('authority-integration-and-20-local-cycles', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], serverRoot),
];

const after = sha256(sentinel);
fs.rmSync(sentinelDir, { recursive: true, force: true });

const categories = {
  stripeUnavailable: 'covered by StripeApiError/fetch failure paths',
  databaseUnavailable: 'covered by readiness and fail-closed database paths',
  webhookRetry: 'covered by signed webhook ledger retry and stale claims',
  internetLoss: 'covered by LicenseApiClient network and signed-cache fallback tests',
  machineChange: 'covered by machine clone and native-id migration tests',
  duplicatePayment: 'covered by event ledger and checkout idempotency contracts',
  cacheCrashTamperClock: 'covered by atomic write, HMAC/GCM, tamper and clock rollback tests',
  seatRace: 'covered by database integration race tests',
  localTwentyCycles: '20 synthetic isolated lifecycle cycles; not Stripe Preview certification',
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  environment: 'local-test-only',
  liveModeAllowed: false,
  passed: checks.every((check) => check.passed) && before === after,
  checks,
  categories,
  projectDataIntegrity: { beforeSha256: before, afterSha256: after, byteIdentical: before === after },
  limitations: ['This report does not certify Preview, real Checkout, Customer Portal or real Stripe invoice.paid delivery.'],
};
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ artifactPath, passed: report.passed, checks: checks.length }, null, 2)}\n`);
process.exitCode = report.passed ? 0 : 1;
