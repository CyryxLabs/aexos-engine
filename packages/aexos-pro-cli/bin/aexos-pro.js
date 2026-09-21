#!/usr/bin/env node

/**
 * aexos-pro CLI
 *
 * Thin CLI wrapper for AEXOS Pro setup and delegated commands.
 * Provides a clean npx interface: npx @aexos/pro-cli install
 *
 * Commands:
 *   install             Run authenticated Pro setup in the current project
 *   update              Update AEXOS Pro and re-sync assets
 *   activate --key X    Activate a license key
 *   deactivate          Deactivate the current license
 *   status              Show license status
 *   features            List available pro features
 *   validate            Force online license revalidation
 *   recover             Recover lost license key via email
 *   help                Show help
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { recoverLicense } = require('../src/recover');

const VERSION = require('../package.json').version;

const args = process.argv.slice(2);
const command = args[0];

// ─── Helpers ────────────────────────────────────────────────────────────────

const CORE_PACKAGE_NAMES = [
  '@aexos/core',
  '@cyryxlabs/aexos',
  '@aexos-squads/core',
  'aexos-core',
  '@cyryx/aexos-core',
];

function packageRootFor(packageName) {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`, {
      paths: [process.cwd(), __dirname],
    }));
  } catch {
    return null;
  }
}

function coreCliFromRoot(packageRoot) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    if (!CORE_PACKAGE_NAMES.includes(manifest.name)) return null;
    const bins = typeof manifest.bin === 'string' ? { aexos: manifest.bin } : manifest.bin || {};
    const preferredNames = ['aexos', 'aexos-core', 'core', 'cyryx', 'aiox', 'aiox-core'];
    const relativeBin = preferredNames.map((name) => bins[name]).find(Boolean);
    if (!relativeBin) return null;
    const entrypoint = path.resolve(packageRoot, relativeBin);
    if (!fs.statSync(entrypoint).isFile()) return null;
    return { command: process.execPath, prefixArgs: [entrypoint] };
  } catch {
    return null;
  }
}

function findCyryxCli() {
  // In the source workspace, the enclosing core is authoritative even if an
  // older published @aexos/core happens to be hoisted into node_modules.
  // In an installed Pro package this candidate is node_modules and fails the
  // package-root validation, then normal dependency resolution applies.
  const enclosingCore = coreCliFromRoot(path.resolve(__dirname, '..', '..', '..'));
  if (enclosingCore) return enclosingCore;

  for (const packageName of CORE_PACKAGE_NAMES) {
    const packageRoot = packageRootFor(packageName);
    const resolved = packageRoot && coreCliFromRoot(packageRoot);
    if (resolved) return resolved;
  }

  return null;
}

function delegateToCyryx(subcommand) {
  const cyryx = findCyryxCli();
  if (!cyryx) {
    console.error('AEXOS Core CLI not found.');
    console.error('Install it first: npm install @aexos/core');
    process.exit(1);
  }

  const spawnArgs = [...cyryx.prefixArgs, 'pro', subcommand, ...args.slice(1)];
  const result = spawnSync(cyryx.command, spawnArgs, { stdio: 'inherit' });
  if (result.error) {
    console.error(`Unable to run AEXOS Core CLI: ${result.error.message}`);
    process.exit(1);
  }
  if (!Number.isInteger(result.status)) {
    console.error('AEXOS Core CLI ended without an exit status.');
    process.exit(1);
  }
  process.exit(result.status);
}

/**
 * Get value of a CLI argument (e.g., --key VALUE).
 *
 * @param {...string} flags - Flag names (e.g., '--key', '-k')
 * @returns {string|null} Value or null
 */
function getArgValue(...flags) {
  for (const flag of flags) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
  }
  return null;
}

/**
 * Run the Pro Installation Wizard.
 *
 * @param {string} [key] - Pre-provided license key
 */
function runProWizard(key) {
  // Lazy import to avoid requiring installer when not needed
  let proSetup;
  try {
    try {
      proSetup = require('@aexos/installer/pro-setup');
    } catch {
      proSetup = require('../../installer/src/wizard/pro-setup');
    }
  } catch {
    console.error('Pro wizard module not found.');
    console.error('Ensure aexos-core installer is available.\n');
    process.exit(1);
  }

  const options = {};
  if (key) {
    options.key = key;
  }

  proSetup
    .runProWizard(options)
    .then((result) => {
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(`\n  Wizard failed: ${err.message}\n`);
      process.exit(1);
    });
}

// ─── Commands ───────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
aexos-pro v${VERSION} — AEXOS Pro CLI

Usage:
  npx -y @aexos/pro-cli@latest <command> [options]

Commands:
  install              Run authenticated Pro setup in the current project
  update               Update AEXOS Pro and re-sync assets
  setup, wizard        Run Pro setup wizard (license gate + scaffold + verify)
  activate --key KEY   Activate a license key
  deactivate           Deactivate the current license
  status               Show license status
  features             List available pro features
  validate             Force online license revalidation
  recover              Recover lost license key via email
  reset-password       Reset your password (alias for recover)
  help                 Show this help message

Examples:
  npx -y @aexos/pro-cli@latest install
  npx -y @aexos/pro-cli@latest update
  npx -y @aexos/pro-cli@latest setup
  npx -y @aexos/pro-cli@latest wizard --key PRO-XXXX-XXXX-XXXX-XXXX
  npx -y @aexos/pro-cli@latest install -k PRO-XXXX-XXXX-XXXX-XXXX
  npx -y @aexos/pro-cli@latest activate --key PRO-XXXX-XXXX-XXXX-XXXX
  npx -y @aexos/pro-cli@latest status
  npx -y @aexos/pro-cli@latest recover

Documentation: https://cyryx.ai/pro/docs
`);
}

function installPro() {
  runProWizard(getArgValue('--key', '-k'));
}

// ─── Main ───────────────────────────────────────────────────────────────────

if (!command || command === 'help' || command === '--help' || command === '-h') {
  showHelp();
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(`aexos-pro v${VERSION}`);
  process.exit(0);
}

switch (command) {
  case 'install': {
    installPro();
    break;
  }

  case 'setup':
  case 'wizard': {
    // Run the Pro Installation Wizard with license gate
    const wizardKey = getArgValue('--key', '-k');
    runProWizard(wizardKey);
    break;
  }

  case 'recover':
  case 'reset-password':
    recoverLicense().catch((err) => {
      console.error(`\n  Recovery failed: ${err.message}\n`);
      process.exit(1);
    });
    break;

  case 'activate':
  case 'deactivate':
  case 'status':
  case 'features':
  case 'validate':
  case 'update':
    delegateToCyryx(command);
    break;

  default:
    console.error(`Unknown command: ${command}\n`);
    showHelp();
    process.exit(1);
}
