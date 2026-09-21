#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const UNIX_STATUS_COMMAND = 'bash ~/.claude/statusline-custom.sh';

function parseArgs(argv) {
  const options = { home: os.homedir(), forceStatusline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--home') {
      if (!argv[index + 1]) throw new Error('--home requires a directory');
      options.home = path.resolve(argv[++index]);
    } else if (argument === '--force-statusline') {
      options.forceStatusline = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function readJsonObject(file) {
  if (!fs.existsSync(file)) return {};
  const bytes = fs.readFileSync(file, 'utf8');
  let value;
  try {
    value = JSON.parse(bytes);
  } catch (error) {
    throw new Error(`Cannot merge malformed Claude settings; existing file preserved: ${file}`, {
      cause: error,
    });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Cannot merge non-object Claude settings; existing file preserved: ${file}`);
  }
  return value;
}

function assertRegularOrMissing(file) {
  if (!fs.existsSync(file)) return;
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Statusline destination must be a regular file: ${file}`);
  }
}

function isManagedStatus(currentStatus, managedCommand) {
  if (!currentStatus || typeof currentStatus !== 'object' || Array.isArray(currentStatus)) {
    return false;
  }
  return currentStatus.type === 'command' &&
    [UNIX_STATUS_COMMAND, managedCommand].includes(currentStatus.command);
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function isUnmodified(file, source, recordedHashes) {
  if (!fs.existsSync(file)) return true;
  const expected = recordedHashes[path.basename(file)] || digest(fs.readFileSync(source));
  return digest(fs.readFileSync(file)) === expected;
}

function backup(file, timestamp) {
  if (!fs.existsSync(file)) return null;
  const destination = `${file}.backup.${timestamp}`;
  fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL);
  return destination;
}

function atomicWrite(file, bytes, mode) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode });
    fs.renameSync(temporary, file);
    if (mode !== undefined) fs.chmodSync(file, mode);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
}

function snapshot(file) {
  if (!fs.existsSync(file)) return { exists: false };
  const stat = fs.lstatSync(file);
  return { exists: true, bytes: fs.readFileSync(file), mode: stat.mode };
}

function restore(file, original) {
  if (!original.exists) {
    if (fs.existsSync(file) && fs.lstatSync(file).isFile()) fs.unlinkSync(file);
    return;
  }
  atomicWrite(file, original.bytes, original.mode);
}

function installStatusline(options = {}) {
  const home = path.resolve(options.home || os.homedir());
  const claudeDir = path.join(home, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const wrapperPath = path.join(claudeDir, 'statusline-custom.sh');
  const scriptPath = path.join(claudeDir, 'statusline-script.js');
  const statePath = path.join(claudeDir, '.aexos-statusline.json');
  const wrapperSource = path.join(__dirname, 'statusline-custom.sh');
  const scriptSource = path.join(__dirname, 'statusline-script.js');
  const managedCommand = process.platform === 'win32'
    ? `node "${scriptPath.replace(/"/g, '\\"')}"`
    : UNIX_STATUS_COMMAND;

  if (!fs.existsSync(home) || !fs.lstatSync(home).isDirectory()) {
    throw new Error(`Home directory does not exist: ${home}`);
  }
  if (fs.existsSync(claudeDir)) {
    const claudeStat = fs.lstatSync(claudeDir);
    if (claudeStat.isSymbolicLink() || !claudeStat.isDirectory()) {
      throw new Error(`Claude configuration directory must be a real directory: ${claudeDir}`);
    }
  }

  for (const file of [settingsPath, wrapperPath, scriptPath, statePath]) assertRegularOrMissing(file);
  const settings = readJsonObject(settingsPath);
  const state = readJsonObject(statePath);
  const recordedHashes = state.files || {};
  if (!recordedHashes || typeof recordedHashes !== 'object' || Array.isArray(recordedHashes)) {
    throw new Error(`Invalid statusline installation hashes: ${statePath}`);
  }
  const currentStatus = settings.statusLine;
  const customStatus = currentStatus !== undefined && !isManagedStatus(currentStatus, managedCommand);
  const customWrapper = !isUnmodified(wrapperPath, wrapperSource, recordedHashes);
  const customScript = !isUnmodified(scriptPath, scriptSource, recordedHashes);
  if (!options.forceStatusline && (customStatus || customWrapper || customScript)) {
    return {
      installed: false,
      preservedCustomStatusline: true,
      backups: [],
      settingsPath,
      wrapperPath,
      scriptPath,
    };
  }

  const templateSettings = readJsonObject(path.join(__dirname, 'settings.json'));
  const mergedSettings = {
    ...settings,
    statusLine: {
      ...templateSettings.statusLine,
      command: managedCommand,
    },
  };
  const settingsBytes = `${JSON.stringify(mergedSettings, null, 2)}\n`;
  const wrapperBytes = fs.readFileSync(wrapperSource);
  const scriptBytes = fs.readFileSync(scriptSource);
  const stateBytes = `${JSON.stringify({ version: 1, files: {
    [path.basename(wrapperPath)]: digest(wrapperBytes),
    [path.basename(scriptPath)]: digest(scriptBytes),
  } }, null, 2)}\n`;
  const targets = [settingsPath, wrapperPath, scriptPath, statePath];
  const originals = new Map(targets.map((file) => [file, snapshot(file)]));

  fs.mkdirSync(claudeDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backups = targets.map((file) => backup(file, timestamp)).filter(Boolean);
  try {
    atomicWrite(wrapperPath, wrapperBytes, 0o755);
    atomicWrite(scriptPath, scriptBytes, 0o755);
    atomicWrite(settingsPath, settingsBytes, 0o600);
    atomicWrite(statePath, stateBytes, 0o600);
  } catch (error) {
    const rollbackErrors = [];
    for (const file of [...targets].reverse()) {
      try {
        restore(file, originals.get(file));
      } catch (rollbackError) {
        rollbackErrors.push(`${file}: ${rollbackError.message}`);
      }
    }
    const suffix = rollbackErrors.length ? `; rollback incomplete: ${rollbackErrors.join('; ')}` : '';
    throw new Error(`Statusline installation failed: ${error.message}${suffix}`, { cause: error });
  }

  return {
    installed: true,
    preservedCustomStatusline: false,
    backups,
    settingsPath,
    wrapperPath,
    scriptPath,
  };
}

if (require.main === module) {
  try {
    const result = installStatusline(parseArgs(process.argv.slice(2)));
    if (result.preservedCustomStatusline) {
      console.log('Existing custom Claude statusline preserved. Use --force-statusline to replace it.');
    } else {
      console.log(`AEXOS Claude statusline installed: ${result.settingsPath}`);
      if (result.backups.length) console.log(`Backups: ${result.backups.join(', ')}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { installStatusline, parseArgs };
