/**
 * Integration Tests for Self-Service Endpoints
 * Testing: GET /api/table/:qrCode/status, POST /api/self-service/join
 */

const request = require("supertest");
const express = require("express");
const mockPool = require("../helpers/mockPool");
const {
  TABLE_ID,
  SESSION_ID,
  SESSION_TOKEN,
  PARTICIPANT_ID_1,
  NONEXISTENT_ID,
} = require("../helpers/fixtures");

jest.mock("../../src/config/database", () => require("../helpers/mockPool"));
jest.mock("../../src/websocket/websocket.service", () => ({
  broadcastAdmin: jest.fn(),
  broadcast: jest.fn(),
}));

const apiRouter = require("../../src/routes/api");

const app = express();
app.use(express.json());
app.use("/api", apiRouter);

const QR_CODE = "cafe-table-1";

describe("Self-Service Endpoints", () => {
  beforeEach(() => {
    mockPool.query.mockReset();
  });

  describe("GET /api/table/:qrCode/status", () => {
    test("should return table status with active session", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: TABLE_ID, table_number: 1, max_concurrent: 6 }],
        }) // Table lookup
        .mockResolvedValueOnce({
          rows: [
            {
              id: SESSION_ID,
              session_token: SESSION_TOKEN,
              session_type: "self_service",
              status: "active",
              participant_count: "2",
            },
          ],
        }) // Active session
        .mockResolvedValueOnce({
          rows: [{ get_active_participant_count: "2" }],
        }); // Active count

      const res = await request(app).get(`/api/table/${QR_CODE}/status`);

      expect(res.status).toBe(200);
      expect(res.body.table.table_number).toBe(1);
      expect(res.body.session).not.toBeNull();
      expect(res.body.session.participantCount).toBe(2);
      expect(res.body.capacityFull).toBe(false);
      expect(res.body.currentCount).toBe(2);
    });

    test("should return status with no active session", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: TABLE_ID, table_number: 1, max_concurrent: 6 }],
        })
        .mockResolvedValueOnce({ rows: [] }) // No session
        .mockResolvedValueOnce({
          rows: [{ get_active_participant_count: "0" }],
        });

      const res = await request(app).get(`/api/table/${QR_CODE}/status`);

      expect(res.status).toBe(200);
      expect(res.body.session).toBeNull();
      expect(res.body.capacityFull).toBe(false);
      expect(res.body.currentCount).toBe(0);
    });

    test("should return capacityFull=true when at max", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: TABLE_ID, table_number: 1, max_concurrent: 6 }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ get_active_participant_count: "6" }],
        });

      const res = await request(app).get(`/api/table/${QR_CODE}/status`);

      expect(res.status).toBe(200);
      expect(res.body.capacityFull).toBe(true);
    });

    test("should return 404 for unknown QR code", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/api/table/${NONEXISTENT_ID}/status`);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/geçersiz qr/i);
    });
  });

  describe("POST /api/self-service/join", () => {
    test("should create a new session and join as first participant", async () => {
      const newParticipant = {
        id: PARTICIPANT_ID_1,
        session_id: SESSION_ID,
        name: "Ali",
        is_host: true,
      };

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: TABLE_ID, table_number: 1, max_concurrent: 6 }],
        }) // Table FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ cnt: "0" }] }) // Active count
        .mockResolvedValueOnce({ rows: [] }) // No existing session
        .mockResolvedValueOnce({ rows: [{ max_num: 0 }] }) // Max session number
        .mockResolvedValueOnce({
          rows: [{ id: SESSION_ID, session_token: SESSION_TOKEN }],
        }) // New session insert
        .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // Participant count (is_host check)
        .mockResolvedValueOnce({ rows: [newParticipant] }); // Insert participant

      const res = await request(app).post("/api/self-service/join").send({
        qrCode: QR_CODE,
        participantName: "Ali",
      });

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(SESSION_ID);
      expect(res.body.sessionToken).toBe(SESSION_TOKEN);
      expect(res.body.participant.name).toBe("Ali");
      expect(res.body.participant.is_host).toBe(true);
    });

    test("should join existing session as non-host", async () => {
      const newParticipant = {
        id: PARTICIPANT_ID_1,
        session_id: SESSION_ID,
        name: "Aylin",
        is_host: false,
      };

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: TABLE_ID, table_number: 1, max_concurrent: 6 }],
        })
        .mockResolvedValueOnce({ rows: [{ cnt: "1" }] }) // 1 person already
        .mockResolvedValueOnce({
          rows: [{ id: SESSION_ID, session_token: SESSION_TOKEN }],
        }) // Existing session
        .mockResolvedValueOnce({ rows: [{ count: "1" }] }) // Not first (not host)
        .mockResolvedValueOnce({ rows: [newParticipant] });

      const res = await request(app).post("/api/self-service/join").send({
        qrCode: QR_CODE,
        participantName: "Aylin",
      });

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(SESSION_ID);
      expect(res.body.participant.is_host).toBe(false);
    });

    test("should return 409 when table is at capacity", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: TABLE_ID, table_number: 1, max_concurrent: 6 }],
        })
        .mockResolvedValueOnce({ rows: [{ cnt: "6" }] }); // Full

      const res = await request(app).post("/api/self-service/join").send({
        qrCode: QR_CODE,
        participantName: "Fazladan Kişi",
      });

      expect(res.status).toBe(409);
      expect(res.body.capacityFull).toBe(true);
    });

    test("should return 404 for unknown QR code", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/api/self-service/join").send({
        qrCode: "bilinmeyen-qr",
        participantName: "Ali",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/geçersiz qr/i);
    });

    test("should return 400 for missing participantName", async () => {
      const res = await request(app).post("/api/self-service/join").send({
        qrCode: QR_CODE,
      });

      expect(res.status).toBe(400);
    });
  });
});
