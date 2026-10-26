'use strict';

const path = require('path');
const crypto = require('crypto');
const { getCyryxCorePackageRoot } = require('../utils/package-paths');
const { recordShadowDecision: defaultRecordShadowDecision } = require('./shadow-telemetry');

const INSTALL_MODES = Object.freeze({
  LEGACY: 'legacy',
  SHADOW: 'shadow',
  BETA: 'beta',
  ENFORCE: 'enforce',
});

class CommercialLicenseRequiredError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'CommercialLicenseRequiredError';
    this.code = options.code || 'AEXOS_LICENSE_REQUIRED';
    this.recoverable = true;
  }
}

function loadCommercialConfig(packageRoot = null) {
  try {
    const authoritativeRoot = packageRoot || getCyryxCorePackageRoot();
    const packageJson = require(path.join(authoritativeRoot, 'package.json'));
    const config = packageJson.aexosCommercial || {};
    const installMode = config.installMode || INSTALL_MODES.LEGACY;

    if (!Object.values(INSTALL_MODES).includes(installMode)) {
      throw new Error(`Unsupported aexosCommercial.installMode: ${installMode}`);
    }

    return {
      installMode,
      shadowEnabled: config.shadowEnabled === true,
      betaCohortHashes: Array.isArray(config.betaCohortHashes) ? config.betaCohortHashes : [],
      purchaseUrl: config.purchaseUrl || 'https://aexos.cyryxlabs.com/aexos',
      supportUrl: config.supportUrl || 'https://cyryxlabs.com/contact',
    };
  } catch (error) {
    if (error instanceof CommercialLicenseRequiredError) {
      throw error;
    }
    throw new Error(`Unable to load AEXOS commercial configuration: ${error.message}`);
  }
}

function resolveCredentialOptions(options = {}, env = process.env) {
  return {
    key: options.licenseKey || env.AEXOS_LICENSE_KEY || env.AEXOS_PRO_KEY,
    email: options.licenseEmail || env.AEXOS_LICENSE_EMAIL || env.AEXOS_PRO_EMAIL,
    password: options.licensePassword || env.AEXOS_LICENSE_PASSWORD || env.AEXOS_PRO_PASSWORD,
  };
}

function redactCredentialValues(message, credentials) {
  let safeMessage = String(message || '');
  for (const value of Object.values(credentials || {})) {
    if (typeof value === 'string' && value.length > 0) {
      safeMessage = safeMessage.split(value).join('[REDACTED]');
    }
  }
  return safeMessage;
}

async function enforceCommercialInstallGate(options = {}) {
  const config = options.config || loadCommercialConfig(options.packageRoot);
  const credentials = resolveCredentialOptions(options, options.env || process.env);
  const emailHash = credentials.email
    ? crypto.createHash('sha256').update(credentials.email.trim().toLowerCase()).digest('hex')
    : null;
  const betaHashes = new Set([
    ...(config.betaCohortHashes || []),
    ...String((options.env || process.env).AEXOS_BETA_COHORT_HASHES || '').split(',').map((v) => v.trim()).filter(Boolean),
  ]);
  const inBeta = config.installMode === INSTALL_MODES.BETA && emailHash && betaHashes.has(emailHash);
  const shouldEvaluate = config.shadowEnabled || config.installMode === INSTALL_MODES.SHADOW || inBeta;

  if (config.installMode === INSTALL_MODES.LEGACY && !shouldEvaluate) {
    return {
      required: false,
      admitted: true,
      mode: config.installMode,
    };
  }

  const runLicenseWizard = options.runLicenseWizard || require('../wizard/pro-setup').runProWizard;
  const targetDir = path.resolve(options.targetDir || process.cwd());

  if ((config.installMode === INSTALL_MODES.SHADOW || config.shadowEnabled || config.installMode === INSTALL_MODES.BETA) && !inBeta) {
    let decision = 'credential_missing';
    if (credentials.key || (credentials.email && credentials.password)) {
      try {
        const shadow = await runLicenseWizard({
          targetDir, key: credentials.key, email: credentials.email, password: credentials.password,
          quiet: true, force: false, validationOnly: true,
        });
        decision = shadow?.success === true && shadow?.licenseValidated === true ? 'would_admit' : 'would_deny';
      } catch { decision = 'evaluation_error'; }
    }
    const recorder = options.recordShadowDecision || defaultRecordShadowDecision;
    await recorder(
      { mode: config.installMode, decision, entrypoint: options.entrypoint || 'installer', cohort: Boolean(inBeta) },
      targetDir,
    );
    return { required: false, admitted: true, mode: config.installMode, shadowDecision: decision };
  }

  if (config.installMode === INSTALL_MODES.BETA && !inBeta) {
    return { required: false, admitted: true, mode: config.installMode, cohort: false };
  }

  if (config.installMode !== INSTALL_MODES.ENFORCE && !inBeta) {
    return { required: false, admitted: true, mode: config.installMode };
  }

  let result;
  try {
    result = await runLicenseWizard({
      targetDir,
      key: credentials.key,
      email: credentials.email,
      password: credentials.password,
      quiet: Boolean(options.quiet),
      force: Boolean(options.force),
    });
  } catch (error) {
    const safeReason = redactCredentialValues(error.message, credentials);
    throw new CommercialLicenseRequiredError(
      `AEXOS license validation could not complete. ${safeReason} Purchase: ${config.purchaseUrl} Support: ${config.supportUrl}`,
      { code: 'AEXOS_LICENSE_VALIDATION_ERROR' },
    );
  }

  if (!result || result.success !== true || result.licenseValidated !== true) {
    const reason =
      result && result.error ? ` ${redactCredentialValues(result.error, credentials)}` : '';
    throw new CommercialLicenseRequiredError(
      `A paid AEXOS license is required before installation.${reason} Purchase: ${config.purchaseUrl} Support: ${config.supportUrl}`,
    );
  }

  return {
    required: true,
    admitted: true,
    mode: config.installMode,
    result,
  };
}

module.exports = {
  CommercialLicenseRequiredError,
  INSTALL_MODES,
  enforceCommercialInstallGate,
  loadCommercialConfig,
  redactCredentialValues,
  resolveCredentialOptions,
};
