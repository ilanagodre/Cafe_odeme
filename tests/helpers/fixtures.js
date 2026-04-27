/**
 * Test Fixtures and Constants
 * Shared test data and utility functions
 */

const { v4: uuid } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const TEST_SECRET = 'dev-secret-change-in-prod';
const TEST_PIN = '1234';
const TEST_PIN_HASH = bcrypt.hashSync(TEST_PIN, 10);

/**
 * Generate test UUIDs
 */
const TABLE_ID = 'table-' + uuid();
const SESSION_ID = 'session-' + uuid();
const PARTICIPANT_ID_1 = 'participant-' + uuid();
const PARTICIPANT_ID_2 = 'participant-' + uuid();
const PARTICIPANT_ID_3 = 'participant-' + uuid();
const ORDER_ID_1 = 'order-' + uuid();
const ORDER_ID_2 = 'order-' + uuid();
const ORDER_ID_3 = 'order-' + uuid();
const STAFF_ID = 'staff-' + uuid();
const SESSION_TOKEN = 'token-' + uuid();

/**
 * Mock table data
 */
const mockTable = {
  id: TABLE_ID,
  name: 'Masa 1',
  qr_code: 'QR-' + uuid(),
  created_at: new Date(),
  status: 'active'
};

/**
 * Mock session data
 */
const mockSession = {
  id: SESSION_ID,
  table_id: TABLE_ID,
  session_token: SESSION_TOKEN,
  session_number: 1,
  total_bill: 300,
  paid_amount: 0,
  status: 'active',
  created_at: new Date(),
  closed_at: null
};

/**
 * Mock participants
 */
const mockParticipant1 = {
  id: PARTICIPANT_ID_1,
  session_id: SESSION_ID,
  name: 'Ali',
  is_host: true,
  joined_at: new Date()
};

const mockParticipant2 = {
  id: PARTICIPANT_ID_2,
  session_id: SESSION_ID,
  name: 'Aylin',
  is_host: false,
  joined_at: new Date()
};

const mockParticipant3 = {
  id: PARTICIPANT_ID_3,
  session_id: SESSION_ID,
  name: 'Kerem',
  is_host: false,
  joined_at: new Date()
};

const mockParticipants = [mockParticipant1, mockParticipant2, mockParticipant3];

/**
 * Mock orders
 */
const mockOrder1 = {
  id: ORDER_ID_1,
  session_id: SESSION_ID,
  name: 'Kahve',
  quantity: 2,
  price: 50,
  total_price: 100,
  ordered_by: PARTICIPANT_ID_1,
  status: 'completed',
  paid_by: null,
  created_at: new Date()
};

const mockOrder2 = {
  id: ORDER_ID_2,
  session_id: SESSION_ID,
  name: 'Çay',
  quantity: 1,
  price: 30,
  total_price: 30,
  ordered_by: PARTICIPANT_ID_2,
  status: 'completed',
  paid_by: null,
  created_at: new Date()
};

const mockOrder3 = {
  id: ORDER_ID_3,
  session_id: SESSION_ID,
  name: 'Tatlı',
  quantity: 1,
  price: 170,
  total_price: 170,
  ordered_by: PARTICIPANT_ID_3,
  status: 'completed',
  paid_by: null,
  created_at: new Date()
};

const mockOrders = [mockOrder1, mockOrder2, mockOrder3];

/**
 * Mock staff/admin user
 */
const mockStaff = {
  id: STAFF_ID,
  table_id: TABLE_ID,
  role: 'owner',
  name: 'Admin',
  pin_hash: TEST_PIN_HASH,
  created_at: new Date(),
  status: 'active'
};

/**
 * Helper to create JWT token
 */
function makeToken(role = 'owner', userId = STAFF_ID, expiresIn = '1h') {
  return jwt.sign(
    { id: userId, name: 'Test User', role },
    TEST_SECRET,
    { expiresIn }
  );
}

/**
 * Helper to verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, TEST_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  TEST_SECRET,
  TEST_PIN,
  TEST_PIN_HASH,
  // UUIDs
  TABLE_ID,
  SESSION_ID,
  PARTICIPANT_ID_1,
  PARTICIPANT_ID_2,
  PARTICIPANT_ID_3,
  ORDER_ID_1,
  ORDER_ID_2,
  ORDER_ID_3,
  STAFF_ID,
  SESSION_TOKEN,
  // Mock data
  mockTable,
  mockSession,
  mockParticipant1,
  mockParticipant2,
  mockParticipant3,
  mockParticipants,
  mockOrder1,
  mockOrder2,
  mockOrder3,
  mockOrders,
  mockStaff,
  // Helpers
  makeToken,
  verifyToken
};
