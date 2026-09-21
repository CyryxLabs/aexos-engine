'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');

async function createManifestProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-manifest-consumer-'));
  const source = path.resolve(__dirname, '../../.aexos-core');
  await fs.cp(source, path.join(root, '.aexos-core'), {
    recursive: true,
    filter: (file) => !path.relative(source, file).split(path.sep).includes('node_modules'),
  });
  return root;
}

module.exports = { createManifestProject };
