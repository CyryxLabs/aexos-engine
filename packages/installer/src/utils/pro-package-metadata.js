'use strict';

const fs = require('node:fs');
const semver = require('semver');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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
    if (!isObject(packageData) || packageData.name !== '@aexos/pro'
      || typeof packageData.version !== 'string' || !semver.valid(packageData.version)) {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(packageData, 'aexosPro')) return true;
    const metadata = packageData.aexosPro;
    if (!isObject(metadata)) return false;
    for (const flag of ['scaffold', 'implemented']) {
      if (Object.prototype.hasOwnProperty.call(metadata, flag) && typeof metadata[flag] !== 'boolean') {
        return false;
      }
    }
    return metadata.scaffold !== true && metadata.implemented !== false;
  } catch {
    return false;
  }
}

module.exports = { isImplementedPackage };
