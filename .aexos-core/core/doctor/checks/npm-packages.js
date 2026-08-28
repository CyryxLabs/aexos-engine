/**
 * Doctor Check: npm Packages
 *
 * Validates:
 * 1. node_modules/ exists in project root (quick sanity check)
 * 2. (INS-4.12) .aexos-core/node_modules/ exists and contains all declared deps
 *
 * @module aexos-core/doctor/checks/npm-packages
 * @story INS-4.1, INS-4.12
 */

const path = require('path');
const fs = require('fs');

const name = 'npm-packages';

async function run(context) {
  const projectPackageJson = path.join(context.projectRoot, 'package.json');
  const nodeModulesPath = path.join(context.projectRoot, 'node_modules');
  // Project dependencies belong to the host project, not AEXOS. A fresh init
  // intentionally has no package.json yet, so requiring node_modules here made
  // doctor contradict the installer validation that had just passed.
  if (fs.existsSync(projectPackageJson)) {
    try {
      const projectPackage = JSON.parse(fs.readFileSync(projectPackageJson, 'utf8'));
      const declaredDependencies = [
        ...Object.keys(projectPackage.dependencies || {}),
        ...Object.keys(projectPackage.devDependencies || {}),
        ...Object.keys(projectPackage.optionalDependencies || {}),
      ];

      if (declaredDependencies.length > 0 && !fs.existsSync(nodeModulesPath)) {
        return {
          check: name,
          status: 'FAIL',
          message: 'Project dependencies are declared but node_modules is missing',
          fixCommand: 'npm install',
        };
      }
    } catch {
      // package.json integrity belongs to the project toolchain. Continue with
      // the framework dependency check below instead of hiding that result.
    }
  }

  // Check 2 (INS-4.12): .aexos-core/node_modules/ completeness
  const cyryxCoreDir = path.join(context.projectRoot, '.aexos-core');
  const cyryxCorePackageJson = path.join(cyryxCoreDir, 'package.json');
  const cyryxCoreNodeModules = path.join(cyryxCoreDir, 'node_modules');

  if (fs.existsSync(cyryxCorePackageJson)) {
    // Verify all declared deps are installed
    try {
      const pkg = JSON.parse(fs.readFileSync(cyryxCorePackageJson, 'utf8'));
      const deps = Object.keys(pkg.dependencies || {});
      const missing = [];

      if (deps.length > 0 && !fs.existsSync(cyryxCoreNodeModules)) {
        return {
          check: name,
          status: 'FAIL',
          message: '.aexos-core dependencies are declared but node_modules is missing',
          fixCommand: 'cd .aexos-core && npm install --production',
        };
      }

      for (const dep of deps) {
        const depPath = path.join(cyryxCoreNodeModules, dep);
        if (!fs.existsSync(depPath)) {
          missing.push(dep);
        }
      }

      if (missing.length > 0) {
        return {
          check: name,
          status: 'FAIL',
          message: `node_modules present, but .aexos-core missing deps: ${missing.join(', ')}`,
          fixCommand: 'cd .aexos-core && npm install --production',
        };
      }
    } catch {
      // If we can't parse package.json, just check existence passed above
    }
  }

  return {
    check: name,
    status: 'PASS',
    message:
      (fs.existsSync(projectPackageJson)
        ? 'Project dependency state is consistent'
        : 'No project package.json; project node_modules not required') +
      (fs.existsSync(cyryxCoreNodeModules) ? ', .aexos-core deps complete' : ''),
    fixCommand: null,
  };
}

module.exports = { name, run };
