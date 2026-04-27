/**
 * Mock Database Pool for Testing
 * Provides jest.Mock functions for database queries
 */

const mockPool = {
  query: jest.fn()
};

// Reset all mocks after each test
afterEach(() => {
  mockPool.query.mockClear();
});

module.exports = mockPool;
