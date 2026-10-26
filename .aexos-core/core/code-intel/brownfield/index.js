'use strict';

const { analyzeBrownfield } = require('./analyze');
const {
  BrownfieldContractError,
  CONTRACT_PROTOCOL,
  DEFAULT_LIMITS,
  VIEWS,
  validateBrownfieldContract,
} = require('./contract');
const {
  EVIDENCE_PROTOCOL,
  computeFindingId,
  computeRelationshipId,
  computeSourceId,
  validateBrownfieldEvidence,
} = require('./evidence');
const {
  exportBrownfieldEvidence,
  prepareBrownfieldEvidencePublication,
} = require('./export');
const { createBrownfieldSnapshot, createSnapshotFs } = require('./snapshot');

module.exports = {
  BrownfieldContractError,
  CONTRACT_PROTOCOL,
  DEFAULT_LIMITS,
  EVIDENCE_PROTOCOL,
  VIEWS,
  analyzeBrownfield,
  createBrownfieldSnapshot,
  createSnapshotFs,
  computeFindingId,
  computeRelationshipId,
  computeSourceId,
  exportBrownfieldEvidence,
  prepareBrownfieldEvidencePublication,
  validateBrownfieldContract,
  validateBrownfieldEvidence,
};
