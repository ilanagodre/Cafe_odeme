/**
 * Unit Tests for Timeout Checker Job
 * Testing: checkTimeouts, startTimeoutChecker
 */

jest.mock("../../src/config/database", () => require("../helpers/mockPool"));
jest.mock("../../src/config/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const mockPool = require("../helpers/mockPool");
const {
  checkTimeouts,
  startTimeoutChecker,
} = require("../../src/jobs/timeoutChecker");

describe("Timeout Checker", () => {
  let mockWsService;

  beforeEach(() => {
    mockPool.query.mockReset();
    mockWsService = {
      broadcastAdmin: jest.fn(),
    };
  });

  describe("checkTimeouts", () => {
    test("should broadcast warning for sessions near expiry", async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "session-1",
              table_id: "table-1",
              table_number: 3,
              status: "active",
              expires_at: expiresAt,
            },
          ],
        }) // Sessions near expiry
        .mockResolvedValueOnce({ rows: [] }); // Update timeout_warned_at

      await checkTimeouts(mockWsService);

      expect(mockWsService.broadcastAdmin).toHaveBeenCalledWith(
        "session_timeout_warning",
        expect.objectContaining({
          sessionId: "session-1",
          tableId: "table-1",
          tableNumber: 3,
          status: "active",
          expiresAt,
        }),
      );
    });

    test("should not broadcast if no sessions near expiry", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await checkTimeouts(mockWsService);

      expect(mockWsService.broadcastAdmin).not.toHaveBeenCalled();
    });

    test("should update timeout_warned_at for each warned session", async () => {
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "session-a",
              table_id: "table-a",
              table_number: 1,
              status: "active",
              expires_at: expiresAt,
            },
            {
              id: "session-b",
              table_id: "table-b",
              table_number: 2,
              status: "waiting_service",
              expires_at: expiresAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await checkTimeouts(mockWsService);

      expect(mockPool.query).toHaveBeenCalledTimes(3);
      expect(mockWsService.broadcastAdmin).toHaveBeenCalledTimes(2);
    });

    test("should handle database error gracefully", async () => {
      mockPool.query.mockRejectedValueOnce(new Error("DB down"));

      await expect(checkTimeouts(mockWsService)).resolves.not.toThrow();
      expect(mockWsService.broadcastAdmin).not.toHaveBeenCalled();
    });
  });

  describe("startTimeoutChecker", () => {
    test("should return a cleanup function that stops the interval", () => {
      jest.useFakeTimers();
      const stop = startTimeoutChecker(mockWsService);

      expect(typeof stop).toBe("function");

      stop();

      jest.advanceTimersByTime(120_000);
      expect(mockPool.query).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
