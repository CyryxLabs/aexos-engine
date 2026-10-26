#!/usr/bin/env node
'use strict';

const validator = require('../.aexos-core/infrastructure/scripts/grok-skills-sync/validate');

if (require.main === module) validator.main();

module.exports = validator;
