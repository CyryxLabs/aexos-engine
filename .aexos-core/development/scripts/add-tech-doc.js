'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const REQUIRED_SECTIONS = [
  'Design Patterns',
  'Project Structure',
  'Tech Stack',
  'Coding Standards',
  'Testing Strategy',
];

function normalizePresetName(value) {
  const name = String(value || '')
    .trim()
    .replace(/\.md$/i, '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error('Preset name must be a lowercase kebab-case identifier');
  }
  return name;
}

function validatePresetDocument(content, expectedId) {
  if (!content || !content.trim()) {
    throw new Error('Source documentation is empty');
  }

  const metadataMatch = content.match(/```yaml\s*\r?\n([\s\S]*?)```/i);
  if (!metadataMatch) {
    throw new Error('Source documentation must contain a YAML preset metadata block');
  }

  let metadata;
  try {
    metadata = yaml.load(metadataMatch[1]);
  } catch (error) {
    throw new Error(`Invalid preset metadata YAML: ${error.message}`);
  }

  const preset = metadata && metadata.preset;
  if (!preset || typeof preset !== 'object') {
    throw new Error('Preset metadata must define a preset object');
  }

  const requiredFields = ['id', 'name', 'version', 'description', 'technologies', 'suitable_for'];
  const missingFields = requiredFields.filter((field) => {
    const value = preset[field];
    return (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    );
  });
  if (missingFields.length > 0) {
    throw new Error(`Preset metadata is missing required values: ${missingFields.join(', ')}`);
  }

  if (preset.id !== expectedId) {
    throw new Error(
      `Preset metadata id "${preset.id}" must match destination name "${expectedId}"`,
    );
  }

  const missingSections = REQUIRED_SECTIONS.filter(
    (section) => !new RegExp(`^##\\s+${section}(?:\\s|$)`, 'im').test(content),
  );
  if (missingSections.length > 0) {
    throw new Error(
      `Source documentation is missing required sections: ${missingSections.join(', ')}`,
    );
  }

  return preset;
}

async function addTechDoc(options) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const sourcePath = path.resolve(projectRoot, options.filePath);
  const sourceStat = await fs.lstat(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error('Source documentation must be a regular file');
  }

  const derivedName = path.basename(sourcePath, path.extname(sourcePath));
  const presetName = normalizePresetName(options.presetName || derivedName);
  const sourceContent = await fs.readFile(sourcePath, 'utf8');
  const candidatePath = options.candidatePath
    ? path.resolve(projectRoot, options.candidatePath)
    : sourcePath;
  const candidateStat = await fs.lstat(candidatePath);
  if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) {
    throw new Error('Extracted preset must be a regular file');
  }
  const candidateContent = await fs.readFile(candidatePath, 'utf8');
  validatePresetDocument(candidateContent, presetName);

  const sourceHash = crypto.createHash('sha256').update(sourceContent).digest('hex');
  const provenance = `<!-- AEXOS tech-preset provenance: source=${path.basename(sourcePath)}; sha256=${sourceHash} -->\n`;
  const contentWithoutOldProvenance = candidateContent.replace(
    /^<!-- AEXOS tech-preset provenance:[^\r\n]*-->\r?\n/,
    '',
  );
  const content = provenance + contentWithoutOldProvenance;

  const presetDirectory = path.join(projectRoot, '.aexos-core', 'data', 'tech-presets');
  const destinationPath = path.join(presetDirectory, `${presetName}.md`);
  await fs.mkdir(presetDirectory, { recursive: true });

  let handle;
  try {
    handle = await fs.open(destinationPath, 'wx');
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Tech preset already exists: ${destinationPath}`);
    }
    if (handle) {
      await handle.close().catch(() => {});
      handle = null;
      await fs.unlink(destinationPath).catch(() => {});
    }
    throw error;
  } finally {
    if (handle) await handle.close();
  }

  return { presetName, sourcePath, sourceHash, destinationPath };
}

async function main(argv = process.argv.slice(2)) {
  const candidateFlag = argv.indexOf('--candidate');
  const candidatePath = candidateFlag >= 0 ? argv[candidateFlag + 1] : undefined;
  const positional =
    candidateFlag >= 0
      ? argv.filter((_, index) => index !== candidateFlag && index !== candidateFlag + 1)
      : argv;
  const [filePath, presetName] = positional;
  if (!filePath) {
    throw new Error(
      'Usage: add-tech-doc <file-path> [preset-name] [--candidate <extracted-preset-path>]',
    );
  }
  if (candidateFlag >= 0 && !candidatePath) {
    throw new Error('--candidate requires an extracted preset path');
  }
  const result = await addTechDoc({ filePath, presetName, candidatePath });
  process.stdout.write(`${result.destinationPath}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`add-tech-doc: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { addTechDoc, normalizePresetName, validatePresetDocument };
