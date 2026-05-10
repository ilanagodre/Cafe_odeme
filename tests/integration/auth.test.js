/**
 * Integration Tests for Authentication Endpoints
 * Testing: /api/auth/login, /api/auth/me
 */

const request = require("supertest");
const express = require("express");
const bcrypt = require("bcrypt");
const mockPool = require("../helpers/mockPool");
const {
  makeToken,
  TEST_PIN,
  TEST_PIN_HASH,
  STAFF_ID,
} = require("../helpers/fixtures");

jest.mock("../../src/config/database", () => require("../helpers/mockPool"));

const { router: authRouter } = require("../../src/routes/auth");

const app = express();
app.use(express.json());
app.use("/api", authRouter);

describe("Authentication Endpoints", () => {
  beforeEach(() => {
    mockPool.query.mockReset();
  });

  describe("POST /api/auth/login", () => {
    test("should login with correct PIN", async () => {
      const pin = TEST_PIN;

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: STAFF_ID,
              name: "Test User",
              role: "owner",
              pin_hash: TEST_PIN_HASH,
            },
          ],
        }) // Get active users
        .mockResolvedValueOnce({ rows: [] }); // Update last_login

      const res = await request(app).post("/api/auth/login").send({ pin });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.id).toBe(STAFF_ID);
      expect(res.body.user.role).toBe("owner");
    });

    test("should return 400 for invalid PIN format", async () => {
      const invalidPin = "abc"; // Not 4 digits

      const res = await request(app)
        .post("/api/auth/login")
        .send({ pin: invalidPin });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation error");
      expect(res.body.details.some((d) => d.field === "pin")).toBe(true);
    });

    test("should return 400 for PIN without 4 digits", async () => {
      const invalidPin = "12345"; // Too many digits

      const res = await request(app)
        .post("/api/auth/login")
        .send({ pin: invalidPin });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation error");
      expect(res.body.details.some((d) => d.field === "pin")).toBe(true);
    });

    test("should return 401 for incorrect PIN", async () => {
      const wrongPin = "9999";

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: STAFF_ID,
            name: "Test User",
            role: "owner",
            pin_hash: TEST_PIN_HASH,
          },
        ],
      }); // Get active users

      const res = await request(app)
        .post("/api/auth/login")
        .send({ pin: wrongPin });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/PIN/i);
    });

    test("should handle multiple users and find correct one", async () => {
      const pin = TEST_PIN;

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "user-1",
              name: "Wrong User",
              role: "waiter",
              pin_hash: "$2b$10$wronghash",
            },
            {
              id: STAFF_ID,
              name: "Correct User",
              role: "owner",
              pin_hash: TEST_PIN_HASH,
            },
          ],
        }) // Get active users
        .mockResolvedValueOnce({ rows: [] }); // Update last_login

      const res = await request(app).post("/api/auth/login").send({ pin });

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(STAFF_ID);
    });
  });

  describe("GET /api/auth/me", () => {
    test("should return user info with valid token", async () => {
      const token = makeToken("owner", STAFF_ID);

      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: STAFF_ID, name: "Test User", role: "owner", is_active: true },
        ],
      }); // Get user

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(STAFF_ID);
      expect(res.body.user.role).toBe("owner");
    });

    test("should return 401 without authorization header", async () => {
      const res = await request(app).get("/api/auth/me");

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/required/i);
    });

    test("should return 401 with invalid token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token");

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid/i);
    });

    test("should return 401 for non-existent user", async () => {
      const token = makeToken("owner", "non-existent-id");

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // User not found

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/not found/i);
    });
  });
});
