/**
 * Unit Tests for Split Algorithms
 * Testing: calculateEqualSplit and calculateItemBased functions
 */

const { calculateEqualSplit, calculateItemBased } = require('../../src/algorithms/splitAlgorithms');
const { mockOrders, mockParticipants } = require('../helpers/fixtures');

describe('Split Algorithms', () => {

  describe('calculateEqualSplit', () => {

    test('should split equally among active participants (who ordered)', () => {
      const orders = mockOrders.slice(0, 2); // 100 + 30 = 130 total
      const participants = mockParticipants.slice(0, 2); // Ali (ordered) and Aylin (ordered)

      const result = calculateEqualSplit(orders, participants);

      expect(result.strategy).toBe('equal_split');
      expect(result.total).toBe(130);
      expect(result.splits).toHaveLength(2);
      expect(result.splits[0].amount).toBe(65);
      expect(result.splits[1].amount).toBe(65);
    });

    test('should handle remainder correctly (last person pays extra)', () => {
      const orders = [
        { id: '1', total_price: '100', ordered_by: 'p1' },
        { id: '2', total_price: '0.5', ordered_by: 'p2' },
        { id: '3', total_price: '0.5', ordered_by: 'p3' }
      ]; // 101 total / 3 people = 33.66 per person (perPerson = 33.66), remainder = 0.02
      const participants = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
        { id: 'p3', name: 'Charlie' }
      ];

      const result = calculateEqualSplit(orders, participants);

      expect(result.total).toBe(101);
      const sum = result.splits[0].amount + result.splits[1].amount + result.splits[2].amount;
      expect(sum).toBe(101);
      // Last person gets remainder: 33.66 + 0.02 = 33.68
      expect(result.splits[2].amount).toBeGreaterThanOrEqual(result.splits[0].amount);
    });

    test('should only count participants who actually ordered', () => {
      const orders = [{ id: '1', total_price: '100', ordered_by: mockParticipants[0].id }]; // Only Ali ordered
      const participants = mockParticipants; // All 3 participants

      const result = calculateEqualSplit(orders, participants);

      // Only Ali should pay, others should have 0
      expect(result.splits[0].amount).toBe(100); // Ali pays all
      expect(result.splits[1].amount).toBe(0); // Aylin pays nothing
      expect(result.splits[2].amount).toBe(0); // Kerem pays nothing
    });

    test('should handle zero total correctly', () => {
      const orders = [];
      const participants = mockParticipants;

      const result = calculateEqualSplit(orders, participants);

      expect(result.total).toBe(0);
      expect(result.splits.every(s => s.amount === 0)).toBe(true);
    });

    test('should handle empty participants list', () => {
      const orders = mockOrders;
      const participants = [];

      const result = calculateEqualSplit(orders, participants);

      expect(result.error).toBe('No participants');
    });

    test('should include all orders in items breakdown', () => {
      const orders = mockOrders.slice(0, 2);
      const participants = mockParticipants.slice(0, 2);

      const result = calculateEqualSplit(orders, participants);

      // Ali and Aylin both ordered
      expect(result.splits[0].items).toHaveLength(2); // Both orders
      expect(result.splits[1].items).toHaveLength(2); // Both orders
    });

  });

  describe('calculateItemBased', () => {

    test('should split based on item claims', () => {
      const orders = [
        { id: 'o1', total_price: '100', name: 'Kahve' },
        { id: 'o2', total_price: '100', name: 'Çay' }
      ];
      const participants = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' }
      ];
      const itemClaims = {
        'o1': ['p1'], // Alice claims coffee (pays 100)
        'o2': ['p2']  // Bob claims tea (pays 100)
      };

      const result = calculateItemBased(orders, participants, itemClaims);

      expect(result.strategy).toBe('item_based');
      expect(result.total).toBe(200);
      expect(result.splits[0].amount).toBe(100); // Alice
      expect(result.splits[1].amount).toBe(100); // Bob
    });

    test('should split item equally among multiple claimants', () => {
      const orders = [{ id: 'o1', total_price: '100', name: 'Kahve' }];
      const participants = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
        { id: 'p3', name: 'Charlie' }
      ];
      const itemClaims = {
        'o1': ['p1', 'p2', 'p3'] // All three split the coffee
      };

      const result = calculateItemBased(orders, participants, itemClaims);

      expect(result.total).toBeCloseTo(100, 1);
      // Each person should pay ~33.33
      result.splits.forEach(split => {
        if (split.amount > 0) {
          expect(split.amount).toBeCloseTo(33.33, 1);
        }
      });
    });

    test('should handle no claims (distribute to everyone)', () => {
      const orders = [{ id: 'o1', total_price: '100', name: 'Kahve' }];
      const participants = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' }
      ];
      const itemClaims = {}; // No claims

      const result = calculateItemBased(orders, participants, itemClaims);

      // Should default to all participants
      expect(result.splits[0].amount).toBe(50);
      expect(result.splits[1].amount).toBe(50);
    });

    test('should sum multiple items for same person', () => {
      const orders = [
        { id: 'o1', total_price: '100', name: 'Kahve' },
        { id: 'o2', total_price: '50', name: 'Pasta' }
      ];
      const participants = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' }
      ];
      const itemClaims = {
        'o1': ['p1', 'p2'], // Both split coffee
        'o2': ['p1']        // Only Alice pays for pasta
      };

      const result = calculateItemBased(orders, participants, itemClaims);

      // Alice: 50 (coffee/2) + 50 (pasta) = 100
      // Bob: 50 (coffee/2) = 50
      expect(result.splits[0].amount).toBe(100);
      expect(result.splits[1].amount).toBe(50);
    });

    test('should initialize all participants even with no claims', () => {
      const orders = [];
      const participants = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' }
      ];
      const itemClaims = {};

      const result = calculateItemBased(orders, participants, itemClaims);

      expect(result.splits).toHaveLength(2);
      expect(result.splits.every(s => s.amount === 0)).toBe(true);
    });

    test('should ignore invalid participant IDs in claims', () => {
      const orders = [{ id: 'o1', total_price: '100', name: 'Kahve' }];
      const participants = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' }
      ];
      const itemClaims = {
        'o1': ['p1', 'p999'] // p999 doesn't exist
      };

      const result = calculateItemBased(orders, participants, itemClaims);

      // Only p1 (Alice) should be counted
      const alice = result.splits.find(s => s.participantId === 'p1');
      expect(alice.amount).toBe(100);
    });

  });

});
