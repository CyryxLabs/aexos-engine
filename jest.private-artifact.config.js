'use strict';

// Local private runtime fixture contracts, not authenticated provider acceptance.
// These suites deliberately fail to load when pro/artifact-service is absent.
const publicConfig = require('./jest.config');

module.exports = {
  ...publicConfig,
  displayName: 'private-artifact-contracts',
  testMatch: [
    '<rootDir>/tests/unit/licensing/paid-squad-artifact-service.test.js',
    '<rootDir>/tests/integration/paid-squad-artifact-http.test.js',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
};
