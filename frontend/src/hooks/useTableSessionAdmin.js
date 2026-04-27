import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

export function useTableSessionAdmin(sessionToken) {
  const [sessionState, setSessionState] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionToken) return;

    const socketInstance = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketInstance.on('connect', () => {
      console.log('[WS-Admin] Connected');
      setIsConnected(true);

      // Join as observer (no participantId needed)
      socketInstance.emit('join_table', {
        sessionToken,
        participantId: 'admin-observer'
      });
    });

    socketInstance.on('disconnect', () => {
      console.log('[WS-Admin] Disconnected');
      setIsConnected(false);
    });

    // Listen to table state updates
    socketInstance.on('table_state', (data) => {
      setSessionState(data);
    });

    // Listen to order additions
    socketInstance.on('order_added', (data) => {
      setSessionState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          orders: [...(prev.orders || []), data.order],
          lastUpdate: data.timestamp
        };
      });
    });

    // Listen to new participants
    socketInstance.on('participant_joined', (data) => {
      console.log('[WS-Admin] Participant joined:', data.participantId);
      // Refresh full state to get updated participant list
      socketInstance.emit('join_table', {
        sessionToken,
        participantId: 'admin-observer'
      });
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [sessionToken]);

  return { sessionState, isConnected };
}
