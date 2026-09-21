'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.aexos-core',
  'development',
  'scripts',
  'add-tech-doc.js',
);
const { addTechDoc } = require(SCRIPT_PATH);

const VALID_CANDIDATE = `# Example Runtime Preset

## Metadata

\`\`\`yaml
preset:
  id: example-runtime
  name: Example Runtime
  version: 1.0.0
  description: Facts extracted from the source runtime guide
  technologies:
    - Example Runtime
  suitable_for:
    - Example services
\`\`\`

## Design Patterns

### Pattern 1: Explicit boundaries

**Purpose:** Keep boundaries explicit.

## Project Structure

Use the source layout.

## Tech Stack

| Category | Technology | Version | Purpose |
| --- | --- | --- | --- |
| Runtime | Example Runtime | 1.0 | Service runtime |

## Coding Standards

Keep public contracts explicit.

## Testing Strategy

Test public behavior.
`;

describe('add-tech-doc runtime', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos add-tech-doc '));
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
  });

  it('creates a validated preset from extracted source facts and records provenance', async () => {
    const sourcePath = path.join(projectRoot, 'runtime-notes.txt');
    const candidatePath = path.join(projectRoot, 'extracted preset.md');
    const source = 'Example Runtime 1.0 is used for Example services.\n';
    await fs.writeFile(sourcePath, source);
    await fs.writeFile(candidatePath, VALID_CANDIDATE);

    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, sourcePath, 'example-runtime', '--candidate', candidatePath],
      { cwd: projectRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    const destination = path.join(
      projectRoot,
      '.aexos-core',
      'data',
      'tech-presets',
      'example-runtime.md',
    );
    assert.equal(result.stdout.trim(), destination);
    const written = await fs.readFile(destination, 'utf8');
    const expectedHash = crypto.createHash('sha256').update(source).digest('hex');
    assert.match(written, new RegExp(`source=runtime-notes\\.txt; sha256=${expectedHash}`));
    assert.match(written, /## Testing Strategy/);
  });

  it('preserves an existing preset when the destination name collides', async () => {
    const sourcePath = path.join(projectRoot, 'source.md');
    const candidatePath = path.join(projectRoot, 'candidate.md');
    const destination = path.join(
      projectRoot,
      '.aexos-core',
      'data',
      'tech-presets',
      'example-runtime.md',
    );
    await fs.outputFile(sourcePath, 'Source documentation');
    await fs.writeFile(candidatePath, VALID_CANDIDATE);
    await fs.outputFile(destination, 'custom existing preset');

    await assert.rejects(
      addTechDoc({
        projectRoot,
        filePath: sourcePath,
        presetName: 'example-runtime',
        candidatePath,
      }),
      /already exists/,
    );
    assert.equal(await fs.readFile(destination, 'utf8'), 'custom existing preset');
  });

  it('rejects incomplete extracted content without creating a destination', async () => {
    const sourcePath = path.join(projectRoot, 'source.md');
    const candidatePath = path.join(projectRoot, 'candidate.md');
    await fs.writeFile(sourcePath, 'Source documentation');
    await fs.writeFile(candidatePath, '# Incomplete candidate');

    await assert.rejects(
      addTechDoc({
        projectRoot,
        filePath: sourcePath,
        presetName: 'example-runtime',
        candidatePath,
      }),
      /YAML preset metadata block/,
    );
    assert.equal(
      await fs.pathExists(
        path.join(projectRoot, '.aexos-core', 'data', 'tech-presets', 'example-runtime.md'),
      ),
      false,
    );
  });

  it('rejects preset-name traversal before writing', async () => {
    const sourcePath = path.join(projectRoot, 'source.md');
    await fs.writeFile(sourcePath, VALID_CANDIDATE);
    await assert.rejects(
      addTechDoc({ projectRoot, filePath: sourcePath, presetName: '../outside' }),
      /kebab-case/,
    );
    assert.equal(await fs.pathExists(path.join(projectRoot, 'outside.md')), false);
  });
});
