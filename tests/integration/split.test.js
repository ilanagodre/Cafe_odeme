/**
 * Integration Tests for Split Calculation Endpoints
 * Testing: /api/split/calculate
 */

const request = require('supertest');
const express = require('express');
const mockPool = require('../helpers/mockPool');
const { SESSION_ID, SESSION_TOKEN, mockOrders, mockParticipants } = require('../helpers/fixtures');

jest.mock('../../src/config/database', () => require('../helpers/mockPool'));

const apiRouter = require('../../src/routes/api');

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

describe('Split Calculation Endpoints', () => {

  beforeEach(() => {
    mockPool.query.mockReset();
  });

  describe('POST /api/split/calculate', () => {

    test('should calculate equal split correctly', async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        strategy: 'equal_split'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: mockParticipants }) // Get participants
        .mockResolvedValueOnce({ rows: mockOrders }); // Get orders

      const res = await request(app)
        .post('/api/split/calculate')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.strategy).toBe('equal_split');
      expect(res.body.splits).toBeDefined();
      expect(res.body.total).toBe(300); // 100 + 30 + 170
    });

    test('should calculate item-based split correctly', async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        strategy: 'item_based',
        itemClaims: {
          [mockOrders[0].id]: [mockParticipants[0].id],
          [mockOrders[1].id]: [mockParticipants[1].id],
          [mockOrders[2].id]: [mockParticipants[2].id]
        }
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: mockParticipants }) // Get participants
        .mockResolvedValueOnce({ rows: mockOrders }); // Get orders

      const res = await request(app)
        .post('/api/split/calculate')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.strategy).toBe('item_based');
      expect(res.body.splits).toBeDefined();
      expect(res.body.total).toBe(300);
    });

    test('should return 404 for inactive session', async () => {
      const payload = {
        sessionToken: 'INVALID-TOKEN',
        strategy: 'equal_split'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }); // Active session not found

      const res = await request(app)
        .post('/api/split/calculate')
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('should return 400 for invalid strategy', async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        strategy: 'invalid_strategy'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: mockParticipants }) // Get participants
        .mockResolvedValueOnce({ rows: mockOrders }); // Get orders

      const res = await request(app)
        .post('/api/split/calculate')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/strategy/i);
    });

  });

});
