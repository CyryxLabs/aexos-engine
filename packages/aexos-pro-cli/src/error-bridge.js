// PRO-UX.1 — bridges the license-server error envelope into a canonical
// CYRYXError, using the Pro-specific registry with graceful fallback.
//
// 3-tier message fallback: envelope.message_pt → registry.userMessage →
// envelope.message (server EN technical). Envelopes without the PRO-16 fields
// (older server) still produce a valid CYRYXError via the registry.

const fs = require('node:fs');
const path = require('node:path');

const CORE_PACKAGE_NAMES = [
  '@aexos/core',
  '@cyryxlabs/aexos',
  '@aexos-squads/core',
  'aexos-core',
  '@cyryx/aexos-core',
];

function isCoreRoot(candidate) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8'));
    return CORE_PACKAGE_NAMES.includes(manifest.name) &&
      fs.statSync(path.join(candidate, '.aexos-core', 'core', 'errors')).isDirectory();
  } catch {
    return false;
  }
}

function resolveCoreRoot() {
  // Preserve the bundled checkout contract before consulting hoisted packages.
  // For a published scoped package this resolves to node_modules and does not
  // validate as a core root, so its declared dependency remains authoritative.
  const checkoutRoot = path.resolve(__dirname, '..', '..', '..');
  if (isCoreRoot(checkoutRoot)) return checkoutRoot;

  for (const packageName of CORE_PACKAGE_NAMES) {
    try {
      const root = path.dirname(require.resolve(`${packageName}/package.json`, {
        paths: [process.cwd(), __dirname],
      }));
      if (isCoreRoot(root)) return root;
    } catch {
      // Continue to verified legacy package names.
    }
  }

  throw new Error('AEXOS Core error registry not found. Install @aexos/core.');
}

const coreRoot = resolveCoreRoot();
const { CYRYXError, defaultErrorRegistry } = require(path.join(
  coreRoot, '.aexos-core', 'core', 'errors',
));
const { proErrorRegistry } = require(path.join(
  coreRoot, '.aexos-core', 'core', 'errors', 'pro-error-registry',
));

const DEFAULT_CODE = 'AEXOS_UNKNOWN_ERROR';

/**
 * @param {object} envelope - { error: { code, message, message_pt?, recovery_hint?, support_code?, details? } }
 * @param {object} [options] - { httpStatus?: number }
 * @returns {CYRYXError}
 */
function parseEnvelopeToCYRYXError(envelope, options = {}) {
  const httpStatus = options.httpStatus;
  const errorBody = envelope && typeof envelope === 'object' ? envelope.error : null;

  if (!errorBody || typeof errorBody !== 'object' || !errorBody.code) {
    return new CYRYXError('Erro inesperado ao falar com o servidor.', {
      code: DEFAULT_CODE,
      metadata: { httpStatus, malformedEnvelope: true },
    });
  }

  const code = errorBody.code;

  // Tier lookup: Pro registry → default registry → unknown fallback.
  let definition = null;
  if (proErrorRegistry.has(code)) {
    definition = proErrorRegistry.lookup(code);
  } else if (defaultErrorRegistry.has(code)) {
    definition = defaultErrorRegistry.lookup(code);
  } else {
    definition = defaultErrorRegistry.lookup(DEFAULT_CODE);
  }

  // 3-tier message fallback.
  const userMessage =
    errorBody.message_pt ||
    definition.userMessage ||
    errorBody.message ||
    'Erro inesperado.';

  return new CYRYXError(userMessage, {
    code,
    category: definition.category,
    severity: definition.severity,
    retryable: definition.retryable,
    recovery: definition.recovery,
    exitCode: definition.exitCode,
    userMessage,
    metadata: {
      support_code: errorBody.support_code,
      recovery_hint: errorBody.recovery_hint,
      serverMessage: errorBody.message,
      serverDetails: errorBody.details,
      httpStatus,
    },
  });
}

module.exports = { parseEnvelopeToCYRYXError };
