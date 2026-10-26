/** Doctor dependency health for project and framework manifests. */
const fs = require('fs');
const path = require('path');
const semver = require('semver');

const name = 'npm-packages';

function findInstalledManifest(directory, dep) {
  let candidate = directory;
  while (true) {
    const installed = path.join(candidate, 'node_modules', dep, 'package.json');
    if (fs.existsSync(installed)) return installed;
    const parent = path.dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

function inspectManifest(directory, label, fixCommand, includeDev) {
  const manifest = path.join(directory, 'package.json');
  if (!fs.existsSync(manifest)) return { count: 0, unverified: [] };
  try {
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('expected an object');
    const groups = [pkg.dependencies, ...(includeDev ? [pkg.devDependencies] : [])];
    const deps = new Map();
    for (const group of groups) {
      if (group === undefined) continue;
      if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error('dependencies must be an object');
      for (const [dep, spec] of Object.entries(group)) {
        if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(dep) || dep === '..') throw new Error('invalid dependency name');
        if (typeof spec !== 'string' || !spec.trim()) throw new Error(`${dep} dependency spec must be a nonempty string`);
        if (!Object.hasOwn(pkg.optionalDependencies || {}, dep)) deps.set(dep, spec);
      }
    }
    const errors = [];
    const unverified = [];
    for (const [dep, spec] of deps) {
      const installed = findInstalledManifest(directory, dep);
      if (!installed) {
        errors.push(`${dep} missing`);
        continue;
      }
      let actual;
      try {
        actual = JSON.parse(fs.readFileSync(installed, 'utf8'));
      } catch (error) {
        errors.push(`${dep} installed manifest unreadable: ${error.message}`);
        continue;
      }
      if (!actual || typeof actual !== 'object' || !semver.valid(actual.version)) {
        errors.push(`${dep} installed manifest has no valid version`);
        continue;
      }
      if (semver.validRange(spec)) {
        if (!semver.satisfies(actual.version, spec)) errors.push(`${dep}@${actual.version} does not satisfy ${spec}`);
      } else {
        unverified.push(`${dep} (${spec})`);
      }
    }
    if (errors.length) return { error: `${label} dependency errors: ${errors.join(', ')}`, fixCommand };
    return { count: deps.size, unverified };
  } catch (error) {
    return { error: `Cannot validate ${label} package.json: ${error.message}`, fixCommand: null };
  }
}

async function run(context) {
  const project = inspectManifest(context.projectRoot, 'Project', 'npm install', true);
  const core = inspectManifest(path.join(context.projectRoot, '.aexos-core'), '.aexos-core', 'npm install --prefix .aexos-core --omit=dev', false);
  const errors = [project, core].filter((result) => result.error);
  if (errors.length) return { check: name, status: 'FAIL', message: errors.map((result) => result.error).join('; '), fixCommand: errors[0].fixCommand };
  const count = project.count + core.count;
  const unverified = [...project.unverified, ...core.unverified];
  if (unverified.length) return { check: name, status: 'WARN', message: `Installed dependencies found, but source/tag requirements need package-manager verification: ${unverified.join(', ')}. Run npm ls in the declaring package directory.`, fixCommand: null };
  return {
    check: name,
    status: count ? 'PASS' : 'INFO',
    message: count ? `${count} declared required dependencies installed with matching versions` : 'No required dependencies declared; node_modules is not required',
    fixCommand: null,
  };
}

module.exports = { name, run };
