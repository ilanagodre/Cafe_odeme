/**
 * Unit Tests for Authentication Functions
 * Testing: hasPermission function from auth.js
 */

const { hasPermission } = require('../../src/routes/auth');

describe('Authentication Functions', () => {

  describe('hasPermission', () => {

    test('should allow owner to access any role', () => {
      expect(hasPermission('owner', 'owner')).toBe(true);
      expect(hasPermission('owner', 'head_waiter')).toBe(true);
      expect(hasPermission('owner', 'waiter')).toBe(true);
    });

    test('should allow head_waiter to access head_waiter and waiter', () => {
      expect(hasPermission('head_waiter', 'head_waiter')).toBe(true);
      expect(hasPermission('head_waiter', 'waiter')).toBe(true);
    });

    test('should not allow head_waiter to access owner', () => {
      expect(hasPermission('head_waiter', 'owner')).toBe(false);
    });

    test('should allow waiter to access waiter only', () => {
      expect(hasPermission('waiter', 'waiter')).toBe(true);
    });

    test('should not allow waiter to access head_waiter or owner', () => {
      expect(hasPermission('waiter', 'head_waiter')).toBe(false);
      expect(hasPermission('waiter', 'owner')).toBe(false);
    });

    test('should handle invalid roles conservatively', () => {
      expect(hasPermission('invalid_role', 'waiter')).toBe(false);
      expect(hasPermission('owner', 'invalid_role')).toBe(false);
      expect(hasPermission('invalid_role', 'invalid_role')).toBe(false);
    });

    test('should enforce role hierarchy: waiter(1) < head_waiter(2) < owner(3)', () => {
      // Hierarchy check
      expect(hasPermission('waiter', 'waiter')).toBe(true);
      expect(hasPermission('waiter', 'head_waiter')).toBe(false);
      expect(hasPermission('waiter', 'owner')).toBe(false);

      expect(hasPermission('head_waiter', 'waiter')).toBe(true);
      expect(hasPermission('head_waiter', 'head_waiter')).toBe(true);
      expect(hasPermission('head_waiter', 'owner')).toBe(false);

      expect(hasPermission('owner', 'waiter')).toBe(true);
      expect(hasPermission('owner', 'head_waiter')).toBe(true);
      expect(hasPermission('owner', 'owner')).toBe(true);
    });

  });

});
