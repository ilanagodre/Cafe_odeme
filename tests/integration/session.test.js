/**
 * Integration Tests for Session Endpoints
 * Testing: /api/session/join, /api/session/:sessionToken
 */

const request = require('supertest');
const express = require('express');
const mockPool = require('../helpers/mockPool');
const { SESSION_ID, TABLE_ID, PARTICIPANT_ID_1, PARTICIPANT_ID_2, SESSION_TOKEN, mockSession, mockParticipant1, mockParticipant2 } = require('../helpers/fixtures');

// Mock database before importing routes
jest.mock('../../src/config/database', () => require('../helpers/mockPool'));

const apiRouter = require('../../src/routes/api');

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

describe('Session Endpoints', () => {

  beforeEach(() => {
    mockPool.query.mockReset();
  });

  describe('POST /api/session/join', () => {

    test('should join session successfully with first participant as host', async () => {
      const qrCode = 'QR-12345';
      const participantName = 'Ali';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: TABLE_ID }] }) // Find table
        .mockResolvedValueOnce({ rows: [] }) // No active session found
        .mockResolvedValueOnce({ rows: [{ max_num: 0 }] }) // Get max session number
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, session_token: SESSION_TOKEN, session_number: 1 }] }) // Create new session
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Count participants
        .mockResolvedValueOnce({ rows: [{ ...mockParticipant1, is_host: true }] }); // Add participant

      const res = await request(app)
        .post('/api/session/join')
        .send({ qrCode, participantName });

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(SESSION_ID);
      expect(res.body.sessionToken).toBe(SESSION_TOKEN);
      expect(res.body.participant.is_host).toBe(true);
    });

    test('should return 404 for invalid QR code', async () => {
      const qrCode = 'INVALID-QR';

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }); // Table not found

      const res = await request(app)
        .post('/api/session/join')
        .send({ qrCode, participantName: 'Ali' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/QR/i);
    });

    test('should join existing session and mark participant as non-host', async () => {
      const qrCode = 'QR-12345';
      const participantName = 'Aylin';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: TABLE_ID }] }) // Find table
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, session_token: SESSION_TOKEN }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Count participants (already 1)
        .mockResolvedValueOnce({ rows: [{ ...mockParticipant2, is_host: false }] }); // Add participant

      const res = await request(app)
        .post('/api/session/join')
        .send({ qrCode, participantName });

      expect(res.status).toBe(200);
      expect(res.body.participant.is_host).toBe(false);
    });

  });

  describe('GET /api/session/:sessionToken', () => {

    test('should return session with all related data', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockSession] }) // Get session
        .mockResolvedValueOnce({ rows: [mockParticipant1, mockParticipant2] }) // Get participants
        .mockResolvedValueOnce({ rows: [] }) // Get orders
        .mockResolvedValueOnce({ rows: [] }) // Get payments
        .mockResolvedValueOnce({ rows: [{ get_remaining_balance: '300' }] }); // Get remaining balance

      const res = await request(app)
        .get(`/api/session/${SESSION_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.session.id).toBe(SESSION_ID);
      expect(res.body.participants).toHaveLength(2);
      expect(res.body.orders).toEqual([]);
      expect(res.body.payments).toEqual([]);
      expect(res.body.remainingBalance).toBe(300);
    });

    test('should return 404 for non-existent session token', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }); // Session not found

      const res = await request(app)
        .get('/api/session/INVALID-TOKEN');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

  });

});
