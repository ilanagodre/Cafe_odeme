const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

/**
 * API helper for test setup and direct backend calls
 */

/**
 * Create a table and session for testing
 */
export async function createTestSession(qrCode = 'cafe-table-1', participantName = 'Test User') {
  const res = await fetch(`${API_URL}/api/session/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qrCode,
      participantName
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to create test session: ${res.status}`);
  }

  const data = await res.json();
  return {
    sessionToken: data.sessionToken,
    participantId: data.participant.id,
    participantName: data.participant.name
  };
}

/**
 * Add an order to a session
 */
export async function addOrder(sessionToken, participantId, itemName = 'Kahve', price = 50, quantity = 1) {
  const res = await fetch(`${API_URL}/api/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionToken,
      itemName,
      quantity,
      price,
      orderedBy: participantId
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to add order: ${res.status}`);
  }

  return res.json();
}

/**
 * Get current session state
 */
export async function getSession(sessionToken) {
  const res = await fetch(`${API_URL}/api/session/${sessionToken}`);

  if (!res.ok) {
    throw new Error(`Failed to get session: ${res.status}`);
  }

  return res.json();
}

/**
 * Calculate split for a session
 */
export async function calculateSplit(sessionToken, strategy = 'equal_split') {
  const res = await fetch(`${API_URL}/api/split/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionToken,
      strategy
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to calculate split: ${res.status}`);
  }

  return res.json();
}
