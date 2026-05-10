/**
 * Integration Tests for Payment Endpoints
 * Testing: /api/payment, /api/payment/full, /api/payment/for, /api/payment/item
 */

const request = require("supertest");
const express = require("express");
const mockPool = require("../helpers/mockPool");
const {
  SESSION_ID,
  SESSION_TOKEN,
  PARTICIPANT_ID_1,
  PARTICIPANT_ID_2,
  ORDER_ID_1,
  NONEXISTENT_ID,
} = require("../helpers/fixtures");

jest.mock("../../src/config/database", () => require("../helpers/mockPool"));

const apiRouter = require("../../src/routes/api");

const app = express();
app.use(express.json());
app.use("/api", apiRouter);

describe("Payment Endpoints", () => {
  beforeEach(() => {
    mockPool.query.mockReset();
  });

  describe("POST /api/payment", () => {
    test("should process payment successfully", async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        participantId: PARTICIPANT_ID_1,
        amount: 100,
        paymentType: "full",
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ id: PARTICIPANT_ID_1 }] }) // validateParticipant
        .mockResolvedValueOnce({
          rows: [{ id: "payment-1", status: "completed", amount: 100 }],
        }) // Insert payment
        .mockResolvedValueOnce({ rows: [] }) // Update paid_amount
        .mockResolvedValueOnce({ rows: [{ get_remaining_balance: "200" }] }); // Get remaining balance

      const res = await request(app).post("/api/payment").send(payload);

      expect(res.status).toBe(200);
      expect(res.body.payment).toBeDefined();
      expect(res.body.remainingBalance).toBe(200);
    });

    test("should return 404 for inactive session", async () => {
      const payload = {
        sessionToken: NONEXISTENT_ID,
        participantId: PARTICIPANT_ID_1,
        amount: 100,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // Active session not found

      const res = await request(app).post("/api/payment").send(payload);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  describe("POST /api/payment/full", () => {
    test("should pay full remaining balance and close session", async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        paidBy: PARTICIPANT_ID_1,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ id: PARTICIPANT_ID_1 }] }) // validateParticipant
        .mockResolvedValueOnce({ rows: [{ get_remaining_balance: "300" }] }) // Get remaining balance
        .mockResolvedValueOnce({ rows: [{ id: "payment-1", amount: "300" }] }) // Insert payment
        .mockResolvedValueOnce({ rows: [{ get_remaining_balance: "0" }] }) // Get new remaining balance
        .mockResolvedValueOnce({ rows: [] }); // Close session

      const res = await request(app).post("/api/payment/full").send(payload);

      expect(res.status).toBe(200);
      expect(res.body.remainingBalance).toBe(0);
      expect(res.body.allSettled).toBe(true);
    });

    test("should not close session if balance remains", async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        paidBy: PARTICIPANT_ID_1,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ id: PARTICIPANT_ID_1 }] }) // validateParticipant
        .mockResolvedValueOnce({ rows: [{ get_remaining_balance: "300" }] }) // Get remaining balance
        .mockResolvedValueOnce({ rows: [{ id: "payment-1", amount: "100" }] }) // Insert payment
        .mockResolvedValueOnce({ rows: [{ get_remaining_balance: "200" }] }); // Get new remaining balance

      const res = await request(app).post("/api/payment/full").send(payload);

      expect(res.status).toBe(200);
      expect(res.body.remainingBalance).toBe(200);
      expect(res.body.allSettled).toBe(false);
    });

    test("should return already paid message for zero balance", async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        paidBy: PARTICIPANT_ID_1,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ id: PARTICIPANT_ID_1 }] }) // validateParticipant
        .mockResolvedValueOnce({ rows: [{ get_remaining_balance: "0" }] }); // Get remaining balance (already paid)

      const res = await request(app).post("/api/payment/full").send(payload);

      expect(res.status).toBe(200);
      expect(res.body.remainingBalance).toBe(0);
      expect(res.body.message).toMatch(/paid/i);
    });
  });

  describe("POST /api/payment/for", () => {
    test("should pay for another person successfully", async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        paidBy: PARTICIPANT_ID_1,
        targetParticipantId: PARTICIPANT_ID_2,
        amount: 100,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ id: PARTICIPANT_ID_1 }] }) // validateParticipant (paidBy)
        .mockResolvedValueOnce({ rows: [{ name: "Aylin" }] }) // Get target participant
        .mockResolvedValueOnce({ rows: [{ id: "payment-1", amount: 100 }] }) // Insert payment
        .mockResolvedValueOnce({ rows: [] }) // Update paid_amount
        .mockResolvedValueOnce({ rows: [{ get_remaining_balance: "200" }] }); // Get remaining balance

      const res = await request(app).post("/api/payment/for").send(payload);

      expect(res.status).toBe(200);
      expect(res.body.targetName).toBe("Aylin");
      expect(res.body.remainingBalance).toBe(200);
    });

    test("should return 404 for non-existent target participant", async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        paidBy: PARTICIPANT_ID_1,
        targetParticipantId: NONEXISTENT_ID,
        amount: 100,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ id: PARTICIPANT_ID_1 }] }) // validateParticipant (paidBy)
        .mockResolvedValueOnce({ rows: [] }); // Target participant not found

      const res = await request(app).post("/api/payment/for").send(payload);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  describe("POST /api/payment/item", () => {
    test("should pay for specific items", async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        paidBy: PARTICIPANT_ID_1,
        orderIds: [ORDER_ID_1],
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ id: PARTICIPANT_ID_1 }] }) // validateParticipant
        .mockResolvedValueOnce({
          rows: [{ id: ORDER_ID_1, total_price: "100", name: "Kahve" }],
        }) // Get orders
        .mockResolvedValueOnce({ rows: [{ id: "payment-1", amount: "100" }] }) // Insert payment
        .mockResolvedValueOnce({ rows: [] }) // Update orders paid_by
        .mockResolvedValueOnce({ rows: [] }) // Update paid_amount
        .mockResolvedValueOnce({ rows: [{ get_remaining_balance: "200" }] }); // Get remaining balance

      const res = await request(app).post("/api/payment/item").send(payload);

      expect(res.status).toBe(200);
      expect(res.body.remainingBalance).toBe(200);
      expect(res.body.message).toMatch(/sipariş/i);
    });

    test("should return 400 for non-existent orders", async () => {
      const payload = {
        sessionToken: SESSION_TOKEN,
        paidBy: PARTICIPANT_ID_1,
        orderIds: [NONEXISTENT_ID],
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // Find active session
        .mockResolvedValueOnce({ rows: [{ id: PARTICIPANT_ID_1 }] }) // validateParticipant
        .mockResolvedValueOnce({ rows: [] }); // No valid orders found

      const res = await request(app).post("/api/payment/item").send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no valid orders/i);
    });
  });
});
