'use strict';

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { ConfinedFilesystem } = require('../../../core/permissions/confined-filesystem');
const {
  analyzeBrownfield,
  exportBrownfieldEvidence,
  prepareBrownfieldEvidencePublication,
} = require('../../../core/code-intel/brownfield');

function diagnostic(error) {
  return {
    protocol: 'aexos.brownfield-diagnostic/v1',
    status: 'error',
    code: error?.code || 'BROWNFIELD_ANALYSIS_FAILED',
  };
}

function absoluteProjectRoot(value) {
  if (!path.isAbsolute(value)) {
    throw Object.assign(new Error('Absolute project root required.'), {
      code: 'BROWNFIELD_ROOT_INVALID',
    });
  }
  return path.resolve(value);
}

function readRequest(requestFile) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(requestFile), 'utf8'));
  } catch (_error) {
    throw Object.assign(new Error('Request must be valid local JSON.'), {
      code: 'BROWNFIELD_REQUEST_INVALID',
    });
  }
}

function createBrownfieldCommand(dependencies = {}) {
  const analyze = dependencies.analyzeBrownfield || analyzeBrownfield;
  const createReadBoundary = dependencies.createReadBoundary
    || ((projectRoot) => new ConfinedFilesystem({ projectRoot }));
  const brownfield = new Command('brownfield');
  brownfield.description('Produce bounded static evidence from an authorized existing project');

  brownfield
    .command('analyze')
    .description('Analyze an immutable, project-confined source snapshot and print evidence')
    .argument('<request-file>', 'Strict aexos.brownfield-analysis/v1 JSON contract')
    .requiredOption('--project-root <absolute>', 'Separately authorized absolute project root')
    .option('--format <format>', 'json or markdown', 'json')
    .action(async (requestFile, options) => {
      try {
        if (!['json', 'markdown'].includes(options.format)) {
          throw Object.assign(new Error('Unsupported format.'), { code: 'BROWNFIELD_EXPORT_FORMAT' });
        }
        const projectRoot = absoluteProjectRoot(options.projectRoot);
        const result = await analyze(readRequest(requestFile), {
          authorizedProjectRoot: projectRoot,
          readBoundary: createReadBoundary(projectRoot),
        });
        process.stdout.write(exportBrownfieldEvidence(result.canonicalEvidence, options.format));
        process.exitCode = result.canonicalEvidence.coverage.status === 'blocked' ? 4 : 0;
      } catch (error) {
        process.stdout.write(`${JSON.stringify(diagnostic(error))}\n`);
        process.exitCode = 4;
      }
    });

  brownfield
    .command('validate')
    .description('Analyze and validate exact source lineage without publishing')
    .argument('<request-file>', 'Strict aexos.brownfield-analysis/v1 JSON contract')
    .requiredOption('--project-root <absolute>', 'Separately authorized absolute project root')
    .action(async (requestFile, options) => {
      try {
        const projectRoot = absoluteProjectRoot(options.projectRoot);
        const result = await analyze(readRequest(requestFile), {
          authorizedProjectRoot: projectRoot,
          readBoundary: createReadBoundary(projectRoot),
        });
        const publicationInput = prepareBrownfieldEvidencePublication(result.canonicalEvidence, result.snapshot);
        process.stdout.write(`${JSON.stringify({
          protocol: 'aexos.brownfield-validation/v1',
          status: 'valid',
          analysisId: result.canonicalEvidence.analysisId,
          inputDigest: result.canonicalEvidence.inputDigest,
          evidenceHash: publicationInput.evidenceHash,
          publicationStatus: result.canonicalEvidence.publication.status,
        })}\n`);
        process.exitCode = 0;
      } catch (error) {
        process.stdout.write(`${JSON.stringify(diagnostic(error))}\n`);
        process.exitCode = 4;
      }
    });
  return brownfield;
}

module.exports = {
  absoluteProjectRoot,
  createBrownfieldCommand,
  diagnostic,
  readRequest,
};
