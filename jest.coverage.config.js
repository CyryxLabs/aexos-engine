'use strict';

const base = require('./jest.config');

module.exports = {
  ...base,
  testPathIgnorePatterns: [
    ...(base.testPathIgnorePatterns || []),
    '<rootDir>/tests/integration/agent-activation-performance.test.js',
  ],
};
