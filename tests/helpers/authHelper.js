/**
 * Authentication Helper for Tests
 * Utilities for creating and managing test auth context
 */

const { makeToken, STAFF_ID } = require('./fixtures');

/**
 * Create Authorization header value for API requests
 * @param {string} role - User role: 'owner', 'head_waiter', 'waiter'
 * @param {string} userId - Optional user ID, defaults to STAFF_ID
 * @returns {string} Bearer token
 */
function getToken(role = 'owner', userId = STAFF_ID) {
  return makeToken(role, userId);
}

/**
 * Get bearer token for a specific role
 * Used with .set('Authorization', token) in supertest
 */
function authAsOwner() {
  return `Bearer ${getToken('owner')}`;
}

function authAsHeadWaiter() {
  return `Bearer ${getToken('head_waiter')}`;
}

function authAsWaiter() {
  return `Bearer ${getToken('waiter')}`;
}

module.exports = {
  getToken,
  authAsOwner,
  authAsHeadWaiter,
  authAsWaiter
};
