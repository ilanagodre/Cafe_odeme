module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/helpers/setupEnv.js"],
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.js"],
  testPathIgnorePatterns: ["/node_modules/", "/frontend/"],
  collectCoverageFrom: [
    "src/routes/**/*.js",
    "src/algorithms/**/*.js",
    "!src/server.js",
  ],
  coverageThreshold: {
    global: { lines: 70, functions: 70, branches: 60, statements: 70 },
    "./src/algorithms/splitAlgorithms.js": {
      lines: 90,
      functions: 90,
      branches: 80,
      statements: 90,
    },
    "./src/routes/auth.js": {
      lines: 85,
      functions: 85,
      branches: 75,
      statements: 85,
    },
    "./src/routes/api.js": {
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80,
    },
    "./src/routes/admin.js": {
      lines: 29,
      functions: 23,
      branches: 20,
      statements: 29,
    },
  },
};
