/**
 * Atomic Write Utility
 *
 * Writes files atomically using write-to-tmp + rename pattern.
 * Prevents file corruption on unexpected exit (crash, kill, power loss).
 *
 * Pattern:
 *   1. Exclusively write data to a unique adjacent temporary file.
 *   2. Rename the temporary file over the destination, without pre-deletion.
 *   3. On failure: preserve the destination and clean up the temporary file.
 *
 * @module core/synapse/utils/atomic-write
 * @version 1.0.0
 * @created Story NOG-12 - State Persistence Hardening
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

/**
 * Write data to a file atomically.
 *
 * Writes to a temporary file first, then renames to the target path.
 * If the process crashes between write and rename, the original file
 * remains intact and the orphaned .tmp file is harmless.
 *
 * @param {string} filePath - Target file path
 * @param {string} data - Data to write
 * @param {string} [encoding='utf8'] - File encoding
 * @throws {Error} If write or rename fails (original file preserved)
 */
function atomicWriteSync(filePath, data, encoding = 'utf8') {
  const tmpPath = `${filePath}.tmp.${process.pid}.${randomUUID()}`;

  try {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Step 1: Write to temporary file
    fs.writeFileSync(tmpPath, data, { encoding, flag: 'wx' });

    // Node's Windows implementation replaces the existing destination. If an
    // open handle or filesystem prevents replacement, keep the original.
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    // Clean up tmp file on failure
    try {
      fs.unlinkSync(tmpPath);
    } catch (_cleanupErr) {
      // Ignore cleanup errors
    }

    console.error(`[atomic-write] Failed to write ${filePath}: ${error.message}`);
    throw error;
  }
}

module.exports = {
  atomicWriteSync,
};
