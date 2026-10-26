'use strict';

const fs = require('node:fs');

/**
 * Keep one compatibility predicate for bundled Core and standalone installer.
 * Explicit scaffold/unimplemented metadata is unavailable; legacy metadata is
 * preserved. This is availability detection, never licensing authority.
 * @param {string} packagePath - Absolute package.json path
 * @returns {boolean} Whether implemented or legacy package metadata is readable
 */
function isImplementedPackage(packagePath) {
  try {
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const metadata = packageData.aexosPro;
    return !(metadata && (metadata.scaffold === true || metadata.implemented === false));
  } catch {
    return false;
  }
}

module.exports = { isImplementedPackage };
