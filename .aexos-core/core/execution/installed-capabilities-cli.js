'use strict';

const { generateCapabilityManifest, readCapabilityManifest, verifyCapabilityManifest, verifyInstalledCapabilities, inspectHostEvidence } = require('./installed-capabilities');

async function runInstalledCapabilities(argv) {
  const options = {};
  for (const argument of argv) {
    const match = /^--(archive|manifest|installed-root|project-root)=(.+)$/.exec(argument);
    if (!match || Object.hasOwn(options, match[1])) throw new Error('Use capabilities installed --archive=<tgz> [--manifest=<json>] [--installed-root=<npm-package>] [--project-root=<project>].');
    options[match[1]] = match[2];
  }
  if (!options.archive) throw new Error('An actual npm archive is required.');
  let manifest;
  if (options.manifest) {
    manifest = readCapabilityManifest(options.manifest);
    await verifyCapabilityManifest(manifest, options.archive);
  } else manifest = await generateCapabilityManifest(options.archive);
  const result = options['installed-root']
    ? await verifyInstalledCapabilities(manifest, options.archive, options['installed-root']) : manifest;
  const output = { result, hosts: options['project-root'] ? inspectHostEvidence(options['project-root']) : [],
    sourceCatalog: 'not-inferred-from-installed-payload', readOnly: true };
  console.log(JSON.stringify(output, null, 2));
  return output;
}

module.exports = { runInstalledCapabilities };
