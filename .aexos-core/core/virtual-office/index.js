'use strict';

const { loadConfig } = require('./config-loader');
const { normalizeEvent } = require('./event-normalizer');
const { loadRegistry } = require('./registry-loader');
const { createVirtualOfficeServer } = require('./server');
const { VirtualOfficeProjector } = require('./state-projector');

module.exports = {
  VirtualOfficeProjector,
  createVirtualOfficeServer,
  loadConfig,
  loadRegistry,
  normalizeEvent,
};

