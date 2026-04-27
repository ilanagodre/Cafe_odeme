import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:3000";

export function useTableSession(sessionToken, participantId) {
  const [socket, setSocket] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionToken || !participantId) return;

    const socketInstance = io(WS_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketInstance.on("connect", () => {
      console.log("[WS] Connected");
      setIsConnected(true);
      setError(null);

      socketInstance.emit("join_table", {
        sessionToken,
        participantId,
      });
    });

    socketInstance.on("disconnect", () => {
      console.log("[WS] Disconnected");
      setIsConnected(false);
    });

    socketInstance.on("connect_error", (err) => {
      console.error("[WS] Connection error:", err);
      setError("Bağlantı hatası");
    });

    // ★ Real-time events ★
    socketInstance.on("table_state", (data) => {
      setSessionState(data);
    });

    socketInstance.on("order_added", (data) => {
      setSessionState((prev) => {
        if (!prev || !prev.orders) return prev;
        return {
          ...prev,
          orders: [...prev.orders, data.order],
          remainingBalance:
            data.remainingBalance !== undefined
              ? data.remainingBalance
              : prev.remainingBalance,
          lastUpdate: data.timestamp,
        };
      });
    });

    // ★ THIS IS THE WOW MOMENT ★
    // Someone pays → everyone's screen updates instantly
    socketInstance.on("payment_completed", (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;

        const newState = {
          ...prev,
          remainingBalance: data.remainingBalance,
          payments: [
            ...(prev.payments || []),
            {
              id: data.paymentId,
              participant_id: data.participantId,
              amount: data.amount,
              status: "completed",
              completed_at: data.timestamp,
            },
          ],
          lastUpdate: data.timestamp,
        };

        // If balance is 0, reload page after a short delay
        if (data.remainingBalance <= 0 && data.allSettled) {
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }

        return newState;
      });
    });

    // ★ Session closed - block ordering ★
    socketInstance.on("session_closed", (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          session: {
            ...prev.session,
            status: "closed",
            closed_at: data.timestamp,
          },
        };
      });
    });

    socketInstance.on("participant_joined", () => {
      // Could show a toast
    });

    socketInstance.on("participant_left", () => {
      // Could update UI
    });

    socketInstance.on("error", (data) => {
      setError(data.message);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.emit("leave_table", { sessionToken });
      socketInstance.disconnect();
    };
  }, [sessionToken, participantId]);

  // ─── Emit functions ─────────────────────────────────

  const placeOrder = useCallback(
    (orderData) => {
      if (!socket) return;
      socket.emit("place_order", { order: orderData, participantId });
    },
    [socket, participantId],
  );

  return {
    socket,
    sessionState,
    isConnected,
    error,
  };
}
