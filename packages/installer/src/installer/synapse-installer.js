'use strict';

const fs = require('fs-extra');
const path = require('path');
const { resolveCyryxCorePath } = require('../utils/package-paths');

const SYNAPSE_FILES = [
  '.gitignore',
  'agent-aexos-master',
  'agent-analyst',
  'agent-architect',
  'agent-data-engineer',
  'agent-dev',
  'agent-devops',
  'agent-pm',
  'agent-po',
  'agent-qa',
  'agent-sm',
  'agent-squad-creator',
  'agent-ux',
  'commands',
  'constitution',
  'context',
  'global',
  'manifest',
  'workflow-arch-review',
  'workflow-epic-create',
  'workflow-story-dev',
];

async function lstatIfPresent(filePath, fsImpl) {
  try {
    return await fsImpl.lstat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readPackagedFiles(sourceDir, fsImpl) {
  const entries = [];
  for (const name of SYNAPSE_FILES) {
    let sourcePath = path.join(sourceDir, name);
    let stat = await lstatIfPresent(sourcePath, fsImpl);
    // npm renames packaged .gitignore to .npmignore during extraction. Keep the
    // canonical consumer filename and original bytes in either source layout.
    if (!stat && name === '.gitignore') {
      sourcePath = path.join(sourceDir, '.npmignore');
      stat = await lstatIfPresent(sourcePath, fsImpl);
    }
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Required packaged SYNAPSE file is missing or invalid: ${sourcePath}`);
    }
    entries.push({ name, content: await fsImpl.readFile(sourcePath) });
  }
  return entries;
}

async function assertSafeTarget(targetDir, fsImpl) {
  const targetSynapse = path.join(targetDir, '.synapse');
  const stat = await lstatIfPresent(targetSynapse, fsImpl);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new Error(`Refusing unsafe SYNAPSE destination: ${targetSynapse}`);
  }
  return targetSynapse;
}

async function existingRegularFile(destination, fsImpl) {
  const stat = await lstatIfPresent(destination, fsImpl);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
    throw new Error(`Refusing invalid required SYNAPSE destination: ${destination}`);
  }
  return Boolean(stat);
}

/** Copy the immutable shipped domains while retaining every consumer-owned file. */
async function installSynapseDomains(options = {}) {
  const targetDir = path.resolve(options.targetDir || process.cwd());
  const sourceDir = path.resolve(options.sourceDir || resolveCyryxCorePath('.synapse'));
  const transaction = options.transaction || { newFiles: [], overwrittenFiles: [] };
  const fsImpl = options.fsImpl || fs;
  if (!Array.isArray(transaction.newFiles) || !Array.isArray(transaction.overwrittenFiles)) {
    throw new TypeError('SYNAPSE installation requires a valid rollback transaction');
  }

  // Validate and buffer every required source before the first destination write.
  const entries = await readPackagedFiles(sourceDir, fsImpl);
  const targetSynapse = await assertSafeTarget(targetDir, fsImpl);
  for (const entry of entries) await existingRegularFile(path.join(targetSynapse, entry.name), fsImpl);
  await fsImpl.ensureDir(targetSynapse);

  const copied = [];
  const preserved = [];
  for (const entry of entries) {
    const destination = path.join(targetSynapse, entry.name);
    if (await existingRegularFile(destination, fsImpl)) {
      preserved.push(destination);
      continue;
    }

    // Journal before opening so a partial write is removed by the outer rollback.
    transaction.newFiles.push(destination);
    try {
      await fsImpl.writeFile(destination, entry.content, { flag: 'wx' });
      copied.push(destination);
    } catch (error) {
      if (error.code === 'EEXIST') {
        transaction.newFiles.pop();
        await existingRegularFile(destination, fsImpl);
        preserved.push(destination);
        continue;
      }
      throw new Error(`Required SYNAPSE installation failed for ${destination}: ${error.message}`, {
        cause: error,
      });
    }
  }

  return {
    count: copied.length,
    copied,
    preserved,
    newFiles: copied,
    rollbackSnapshots: [],
  };
}

module.exports = { SYNAPSE_FILES, installSynapseDomains };
