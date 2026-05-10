/**
 * Mock Database Pool for Testing
 * Provides jest.Mock functions for database queries
 */

const mockPool = {
  query: jest.fn(),
};

afterEach(() => {
  mockPool.query.mockReset();
});

module.exports = mockPool;
