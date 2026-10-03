module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 30000,
  // Tests share one test database; running them serially keeps state predictable.
  maxWorkers: 1,
  verbose: true,
};
