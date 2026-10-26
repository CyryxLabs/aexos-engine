'use strict';

const fs = require('fs');
const path = require('path');

function evaluatePromotion(evidence, packageConfig) {
  const checks = {
    packageStillLegacy: packageConfig?.installMode === 'legacy',
    previewCertified: evidence?.preview?.certified === true,
    restrictedStripeKey: evidence?.preview?.stripeCredentialType === 'restricted',
    sandboxCycles: Number(evidence?.preview?.completedCycles || 0) >= 20,
    checkoutPortalInvoice: ['checkout', 'portal', 'invoice.paid'].every((item) => evidence?.preview?.flows?.includes(item)),
    shadowCoverage: evidence?.shadow?.unknownEntrypoints === 0 && evidence?.shadow?.coverage === 1,
    restrictedBetaCertified: evidence?.beta?.certified === true,
    zeroHighDefects: Number(evidence?.quality?.critical || 0) === 0 && Number(evidence?.quality?.high || 0) === 0,
    recoverySafe: evidence?.quality?.destructiveRecoveryFindings === 0,
    signedArtifact: evidence?.artifact?.signed === true && typeof evidence?.artifact?.sha256 === 'string',
    independentQa: evidence?.approvals?.independentQa === true,
    legal: evidence?.approvals?.legal === true,
    commercial: evidence?.approvals?.commercial === true,
    founder: evidence?.approvals?.founder === true,
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { eligible: failed.length === 0, checks, failed };
}

if (require.main === module) {
  const evidencePath = path.resolve(process.argv[2] || 'artifacts/licensing/promotion-evidence.json');
  const packagePath = path.resolve(__dirname, '..', 'package.json');
  const evidence = fs.existsSync(evidencePath) ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) : {};
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const result = evaluatePromotion(evidence, pkg.aexosCommercial || {});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.eligible ? 0 : 1;
}

module.exports = { evaluatePromotion };
