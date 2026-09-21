'use strict';

const { deepMerge, isPlainObject } = require('./merge-utils');

// Only migrated L4 files opt individual legacy paths into literal-null behavior.
// Remove a path from this list to use the normal layered null-as-delete rule.
const MIGRATION_KEY = '_aexos_migration';
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function validatePaths(metadata) {
  if (!isPlainObject(metadata) || metadata.version !== 1
    || Object.keys(metadata).some(key => !['version', 'literal_null_paths'].includes(key))
    || !Array.isArray(metadata.literal_null_paths)
    || metadata.literal_null_paths.some(parts => !Array.isArray(parts) || parts.length === 0
      || parts.some(key => typeof key !== 'string' || UNSAFE_KEYS.has(key))
      || parts[0] === MIGRATION_KEY)) {
    throw new Error(`Invalid ${MIGRATION_KEY} literal-null metadata in local config`);
  }
  return metadata.literal_null_paths;
}

function withMigrationCompatibility(config) {
  if (own(config, MIGRATION_KEY)) {
    throw new Error(`Cannot migrate: legacy config already uses reserved key ${MIGRATION_KEY}`);
  }
  const paths = [];
  function visit(value, parents) {
    for (const [key, child] of Object.entries(value)) {
      const parts = [...parents, key];
      if (child === null) paths.push(parts);
      else if (isPlainObject(child)) visit(child, parts);
    }
  }
  visit(config, []);
  if (paths.length === 0) return config;
  const metadata = { version: 1, literal_null_paths: paths };
  validatePaths(metadata);
  return { ...config, [MIGRATION_KEY]: metadata };
}

function hasLiteralNull(config, parts) {
  let current = config;
  for (const key of parts) {
    if (!isPlainObject(current) || !own(current, key)) return false;
    current = current[key];
  }
  return current === null;
}

function restoreNull(config, parts, index = 0) {
  const key = parts[index];
  // Copy each ancestor: deepMerge may share untouched objects with lower layers.
  const result = { ...config };
  if (index === parts.length - 1) result[key] = null;
  else if (isPlainObject(config[key])) result[key] = restoreNull(config[key], parts, index + 1);
  return result;
}

function mergeLocalConfig(base, local) {
  if (!own(local, MIGRATION_KEY)) return deepMerge(base, local);
  const paths = validatePaths(local[MIGRATION_KEY]);
  const overrides = { ...local };
  delete overrides[MIGRATION_KEY];
  let merged = deepMerge(base, overrides);
  for (const parts of paths) {
    // Metadata cannot resurrect deleted keys or override subsequent user edits.
    if (hasLiteralNull(overrides, parts)) merged = restoreNull(merged, parts);
  }
  return merged;
}

module.exports = { MIGRATION_KEY, withMigrationCompatibility, mergeLocalConfig };
