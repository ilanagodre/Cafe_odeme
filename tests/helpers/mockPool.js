/**
 * Mock Database Pool for Testing
 * Supports both pool.query() and pool.connect() / client patterns.
 * BEGIN, COMMIT, ROLLBACK are auto-resolved so tests only need to
 * mock data queries in the same order as before.
 */

const mockPool = {
  query: jest.fn(),
};

const mockClient = {
  query(sql, params) {
    const cmd = (typeof sql === "string" ? sql : "").trim().toUpperCase();
    if (cmd === "BEGIN" || cmd === "COMMIT" || cmd === "ROLLBACK") {
      return Promise.resolve({ rows: [] });
    }
    return mockPool.query(sql, params);
  },
  release: jest.fn(),
};

mockPool.connect = jest.fn().mockResolvedValue(mockClient);

afterEach(() => {
  mockPool.query.mockReset();
  mockClient.release.mockReset();
});

module.exports = mockPool;
