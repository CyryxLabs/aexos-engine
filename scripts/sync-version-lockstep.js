#!/usr/bin/env node
/**
 * Version Lockstep Sync
 *
 * The publish safety gate (bin/utils/validate-publish.js → Check 5 /
 * scripts/validate-aexos-core-namespace.js) requires `.aexos-core/package.json`
 * to match the root package.json version. semantic-release only bumps the
 * root manifest (in the release working tree), so every release was blocked
 * at prepublishOnly with version drift. This script is the missing `prepare`
 * step: it syncs every public distribution manifest, the internal manifest,
 * the legacy compatibility wrapper, and their direct lockfile entries to the
 * target version. Workspace dependencies stay on compatible 1.x-style ranges;
 * the compatibility wrapper keeps an exact core pin.
 *
 * Wired into .releaserc.json via @semantic-release/exec:
 *   prepareCmd: node scripts/sync-version-lockstep.js ${nextRelease.version}
 *
 * Also usable standalone (release-bump PRs, e.g. chore(release) commits):
 *   node scripts/sync-version-lockstep.js           # target = root version
 *   node scripts/sync-version-lockstep.js 1.0.0     # explicit target
 *
 * Exit codes: 0 = synced (or already in sync), 1 = invalid input / IO error
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** Current name of the core package the compat wrapper re-exports. */
const CORE_DEP_NAME = '@aexos/core';
/**
 * Names the core package shipped under before the scope was consolidated.
 * Deliberately NOT rewritten to the current scope — these are the stale keys
 * this script has to find and remove.
 */
const LEGACY_CORE_DEP_NAMES = ['@cyryxlabs/aexos', '@aexos-squads/core', '@cyryx/aexos-core'];
const PUBLIC_WORKSPACES = [
  'packages/aexos-install',
  'packages/aexos-pro-cli',
  'packages/installer',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`);
}

function compatibleRange(version) {
  return `^${version}`;
}

function syncTextVersion(relativePath, pattern, replacement) {
  const filePath = path.join(ROOT, relativePath);
  const current = fs.readFileSync(filePath, 'utf8');
  if (!pattern.test(current)) {
    throw new Error(`Version field not found in ${relativePath}`);
  }
  const next = current.replace(pattern, replacement);
  if (next !== current) {
    fs.writeFileSync(filePath, next);
    console.log(`synced: ${relativePath}`);
  } else {
    console.log(`ok: ${relativePath}`);
  }
}

function main() {
  const rootPkg = readJson(path.join(ROOT, 'package.json'));
  const version = process.argv[2] || rootPkg.version;

  if (!SEMVER_RE.test(version)) {
    console.error(`FAIL: invalid semver target "${version}"`);
    process.exit(1);
  }

  // 1. .aexos-core/package.json — version lockstep with root
  //    (validate-aexos-core-namespace.js rule 4: root is SOT)
  const internalPath = path.join(ROOT, '.aexos-core', 'package.json');
  const internal = readJson(internalPath);
  if (internal.version !== version) {
    internal.version = version;
    writeJson(internalPath, internal);
    console.log(`synced: .aexos-core/package.json -> ${version}`);
  } else {
    console.log(`ok: .aexos-core/package.json already ${version}`);
  }

  // 2. compat/aexos-core/package.json — legacy wrapper version + exact
  //    dependency pin on the scoped package (published by npm-publish.yml)
  const compatPath = path.join(ROOT, 'compat', 'aexos-core', 'package.json');
  const compat = readJson(compatPath);
  let compatChanged = false;
  if (compat.version !== version) {
    compat.version = version;
    compatChanged = true;
  }
  if (compat.dependencies) {
    // Drop any dependency pin left behind by an earlier scope. Writing the
    // current key without removing the old one is how the wrapper ended up
    // depending on a package name that was never published.
    for (const legacy of LEGACY_CORE_DEP_NAMES) {
      if (legacy in compat.dependencies) {
        delete compat.dependencies[legacy];
        compatChanged = true;
      }
    }
    if (compat.dependencies[CORE_DEP_NAME] !== version) {
      compat.dependencies[CORE_DEP_NAME] = version;
      compatChanged = true;
    }
  }
  if (compatChanged) {
    writeJson(compatPath, compat);
    console.log(`synced: compat/aexos-core/package.json -> ${version} (version + dependency pin)`);
  } else {
    console.log(`ok: compat/aexos-core/package.json already ${version}`);
  }

  // 3. Public workspace packages ship as one coordinated distribution. Keep
  //    their versions aligned and update direct workspace dependency ranges.
  for (const relativeDir of PUBLIC_WORKSPACES) {
    const manifestPath = path.join(ROOT, relativeDir, 'package.json');
    const manifest = readJson(manifestPath);
    let changed = false;

    if (manifest.version !== version) {
      manifest.version = version;
      changed = true;
    }

    for (const field of ['dependencies', 'peerDependencies']) {
      if (!manifest[field]) continue;
      for (const dependency of [CORE_DEP_NAME, '@aexos/installer']) {
        if (dependency in manifest[field] && manifest[field][dependency] !== compatibleRange(version)) {
          manifest[field][dependency] = compatibleRange(version);
          changed = true;
        }
      }
    }

    if (changed) {
      writeJson(manifestPath, manifest);
      console.log(`synced: ${relativeDir}/package.json -> ${version}`);
    } else {
      console.log(`ok: ${relativeDir}/package.json already ${version}`);
    }
  }

  // The bundled Gemini extension is private, but its manifest is shipped in
  // the core tarball and therefore carries the active distribution identity.
  const geminiPath = path.join(ROOT, 'packages', 'gemini-aexos-extension', 'package.json');
  const gemini = readJson(geminiPath);
  if (gemini.version !== version) {
    gemini.version = version;
    writeJson(geminiPath, gemini);
    console.log(`synced: packages/gemini-aexos-extension/package.json -> ${version}`);
  } else {
    console.log(`ok: packages/gemini-aexos-extension/package.json already ${version}`);
  }

  // Active framework metadata consumed at runtime and during installation.
  syncTextVersion(
    '.aexos-core/framework-config.yaml',
    /^ {2}framework_version:.*$/m,
    `  framework_version: "${version}"`,
  );
  syncTextVersion(
    '.aexos-core/core-config.yaml',
    /^ {2}installedFrameworkVersion:.*$/m,
    `  installedFrameworkVersion: ${version}`,
  );
  syncTextVersion('.aexos-core/install-manifest.yaml', /^version:.*$/m, `version: ${version}`);

  // 4. Keep only first-party lockfile metadata in sync. Registry-resolved
  //    dependency entries and integrity hashes are intentionally untouched.
  const lockPath = path.join(ROOT, 'package-lock.json');
  const lock = readJson(lockPath);
  lock.version = version;
  lock.packages[''].version = version;
  // Workspace packages depend on the root core package. Represent that edge
  // as a local link so `npm ci` does not require an already-published copy of
  // the version currently being prepared.
  lock.packages['node_modules/@aexos/core'] = { resolved: '.', link: true };
  lock.packages['.aexos-core'] && (lock.packages['.aexos-core'].version = version);
  lock.packages['compat/aexos-core'] && (lock.packages['compat/aexos-core'].version = version);

  for (const relativeDir of PUBLIC_WORKSPACES) {
    const lockEntry = lock.packages[relativeDir];
    const manifest = readJson(path.join(ROOT, relativeDir, 'package.json'));
    if (!lockEntry) continue;
    lockEntry.version = version;
    for (const field of ['dependencies', 'peerDependencies']) {
      if (!lockEntry[field] || !manifest[field]) continue;
      for (const dependency of [CORE_DEP_NAME, '@aexos/installer']) {
        if (dependency in manifest[field]) {
          lockEntry[field][dependency] = manifest[field][dependency];
        }
      }
    }
  }
  if (lock.packages['packages/gemini-aexos-extension']) {
    lock.packages['packages/gemini-aexos-extension'].version = version;
  }
  writeJson(lockPath, lock);

  console.log(`PASS: public distribution version lockstep at ${version}`);
}

main();
