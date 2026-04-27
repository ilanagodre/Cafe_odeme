/**
 * Integration Tests for Order Endpoints
 * Testing: /api/order
 */

const request = require('supertest');
const express = require('express');
const mockPool = require('../helpers/mockPool');
const { SESSION_ID, SESSION_TOKEN, PARTICIPANT_ID_1, ORDER_ID_1, mockOrder1 } = require('../helpers/fixtures');

jest.mock('../../src/config/database', () => require('../helpers/mockPool'));

const apiRouter = require('../../src/routes/api');

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

describe('Order Endpoints', () => {

  beforeEach(() => {
    mockPool.query.mockClear();
  });

  describe('POST /api/order', () => {

    test('should place order successfully', async () => {
      const orderData = {
        sessionToken: SESSION_TOKEN,
        itemName: 'Kahve',
        quantity: 2,
        price: 50,
        orderedBy: PARTICIPANT_ID_1
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ id: ORDER_ID_1, name: 'Kahve', quantity: 2, total_price: '100' }] }) // Insert order
        .mockResolvedValueOnce({ rows: [] }); // Update session total_bill

      const res = await request(app)
        .post('/api/order')
        .send(orderData);

      expect(res.status).toBe(200);
      expect(res.body.order.name).toBe('Kahve');
      expect(res.body.order.quantity).toBe(2);
      expect(res.body.order.total_price).toBe('100');
    });

    test('should return 404 for inactive session', async () => {
      const orderData = {
        sessionToken: 'INVALID-TOKEN',
        itemName: 'Kahve',
        quantity: 1,
        price: 50,
        orderedBy: PARTICIPANT_ID_1
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }); // Active session not found

      const res = await request(app)
        .post('/api/order')
        .send(orderData);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('should calculate total price correctly', async () => {
      const orderData = {
        sessionToken: SESSION_TOKEN,
        itemName: 'Çay',
        quantity: 5,
        price: 30,
        orderedBy: PARTICIPANT_ID_1
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ ...orderData, total_price: '150.00' }] }) // Insert order
        .mockResolvedValueOnce({ rows: [] }); // Update session total_bill

      const res = await request(app)
        .post('/api/order')
        .send(orderData);

      expect(res.status).toBe(200);
      expect(res.body.order.total_price).toBe('150.00');
    });

  });

});
