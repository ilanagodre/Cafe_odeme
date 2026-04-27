# Cafe Payment API Documentation

**API Base URL:** `http://localhost:3000/api`  
**WebSocket URL:** `ws://localhost:3000`  
**Version:** 1.0 (MVP)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Customer Flow](#customer-flow)
3. [Split Payment Algorithms](#split-payment-algorithms)
4. [Staff/Admin APIs](#staffadmin-apis)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [WebSocket Events](#websocket-events)

---

## Authentication

### Login (PIN-based)

**Endpoint:** `POST /auth/login`

**Rate Limited:** Yes (5 attempts per 15 minutes)

**Request:**

```json
{
  "pin": "1234"
}
```

**Response (Success - 200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Ahmet",
    "role": "waiter"
  }
}
```

**Response (Error - 401):**

```json
{
  "error": "PIN hatalı"
}
```

**Notes:**

- PIN is bcrypt hashed in database
- Token expires in 12 hours (configurable via `JWT_EXPIRES_IN` env)
- Staff only (waiter, head_waiter, owner roles)

---

### Get Current User

**Endpoint:** `GET /auth/me`

**Headers:**

```
Authorization: Bearer {token}
```

**Response (Success - 200):**

```json
{
  "user": {
    "id": 1,
    "name": "Ahmet",
    "role": "waiter",
    "is_active": true
  }
}
```

**Response (Error - 401):**

```json
{
  "error": "Invalid token"
}
```

---

## Customer Flow

### 1. Join Table (QR Scan)

**Endpoint:** `POST /session/join`

**Request:**

```json
{
  "qrCode": "TABLE_001_UNIQUE_CODE",
  "participantName": "Ali"
}
```

**Response (Success - 200):**

```json
{
  "sessionId": 42,
  "sessionToken": "sess_abc123xyz789...",
  "participant": {
    "id": 101,
    "session_id": 42,
    "name": "Ali",
    "is_host": true,
    "joined_at": "2026-04-19T14:30:00Z"
  }
}
```

**Response (Error - 404):**

```json
{
  "error": "Geçersiz QR kod"
}
```

**Validation Rules:**

- `qrCode`: Required, must exist in database
- `participantName`: Required, max 100 characters, alphanumeric + spaces

**Notes:**

- First participant becomes "host"
- If session exists for table, joins existing session
- Otherwise, creates new session automatically

---

### 2. Get Session State

**Endpoint:** `GET /session/:sessionToken`

**Response (Success - 200):**

```json
{
  "session": {
    "id": 42,
    "table_id": 1,
    "session_number": 1,
    "status": "active",
    "created_at": "2026-04-19T14:30:00Z",
    "closed_at": null
  },
  "participants": [
    {
      "id": 101,
      "name": "Ali",
      "is_host": true,
      "balance": -150.0,
      "joined_at": "2026-04-19T14:30:00Z"
    },
    {
      "id": 102,
      "name": "Veli",
      "is_host": false,
      "balance": -120.0,
      "joined_at": "2026-04-19T14:31:00Z"
    }
  ],
  "orders": [
    {
      "id": 1001,
      "participant_id": 101,
      "item_name": "Adana Kebab",
      "price": 150.0,
      "quantity": 1,
      "created_at": "2026-04-19T14:31:00Z"
    },
    {
      "id": 1002,
      "participant_id": 102,
      "item_name": "Ayran",
      "price": 20.0,
      "quantity": 2,
      "created_at": "2026-04-19T14:32:00Z"
    }
  ],
  "totalAmount": 270.0,
  "payments": [
    {
      "id": 2001,
      "participant_id": 101,
      "amount": 150.0,
      "payment_type": "equal_split",
      "created_at": "2026-04-19T14:35:00Z"
    }
  ]
}
```

**Response (Error - 404):**

```json
{
  "error": "Session not found"
}
```

---

### 3. Place Order

**Endpoint:** `POST /order`

**Request:**

```json
{
  "sessionToken": "sess_abc123xyz789...",
  "participantId": 101,
  "itemName": "Adana Kebab",
  "price": 150.0,
  "quantity": 1
}
```

**Response (Success - 200):**

```json
{
  "order": {
    "id": 1001,
    "session_id": 42,
    "participant_id": 101,
    "item_name": "Adana Kebab",
    "price": 150.0,
    "quantity": 1,
    "created_at": "2026-04-19T14:31:00Z"
  }
}
```

**Validation Rules:**

- `sessionToken`: Required, must be valid
- `participantId`: Required, must belong to session
- `itemName`: Required, max 200 characters
- `price`: Required, > 0, decimal with max 2 places
- `quantity`: Required, integer > 0

**Notes:**

- WebSocket broadcasts `order_added` event to all participants in session
- Order immediately visible on all tablets in real-time

---

### 4. Calculate Split

**Endpoint:** `POST /split/calculate`

**Request:**

```json
{
  "sessionToken": "sess_abc123xyz789...",
  "splitType": "equal_split"
}
```

**Split Types:**

- `equal_split`: Everyone pays equally
- `item_based`: Everyone pays for what they ordered

**Response (Success - 200):**

```json
{
  "splitType": "equal_split",
  "participants": [
    {
      "id": 101,
      "name": "Ali",
      "totalOwed": 135.0,
      "orders": [{ "item": "Adana Kebab", "price": 150.0 }]
    },
    {
      "id": 102,
      "name": "Veli",
      "totalOwed": 135.0,
      "orders": [{ "item": "Ayran", "price": 20.0 }]
    }
  ],
  "sessionTotal": 270.0
}
```

**Notes:**

- Calculation is done on frontend
- Backend validates during payment
- Supports rounding for equal splits

---

### 5. Record Payment - Equal Split

**Endpoint:** `POST /payment`

**Request:**

```json
{
  "sessionToken": "sess_abc123xyz789...",
  "participantId": 101,
  "amount": 135.0,
  "paymentType": "equal_split"
}
```

**Response (Success - 200):**

```json
{
  "payment": {
    "id": 2001,
    "session_id": 42,
    "participant_id": 101,
    "amount": 135.0,
    "payment_type": "equal_split",
    "created_at": "2026-04-19T14:35:00Z"
  },
  "remainingBalance": 135.0
}
```

**Response (Error - 400):**

```json
{
  "error": "Insufficient session balance"
}
```

---

### 6. Record Payment - Item-Based (Everyone Pays for Their Own)

**Endpoint:** `POST /payment/item`

**Request:**

```json
{
  "sessionToken": "sess_abc123xyz789...",
  "participantId": 101,
  "amount": 150.0,
  "paymentType": "item_based",
  "orderNames": ["Adana Kebab"]
}
```

**Response:** Same as `/payment` endpoint

---

### 7. Record Payment - One Person Pays for Another

**Endpoint:** `POST /payment/for`

**Request:**

```json
{
  "sessionToken": "sess_abc123xyz789...",
  "participantId": 101,
  "targetParticipantId": 102,
  "amount": 135.0,
  "paymentType": "pay_for_other",
  "targetName": "Veli"
}
```

**Response:** Same as `/payment` endpoint

**Notes:**

- Paying on behalf of another participant
- WebSocket notifies target participant of payment

---

### 8. Record Payment - Full Settlement

**Endpoint:** `POST /payment/full`

**Request:**

```json
{
  "sessionToken": "sess_abc123xyz789...",
  "participantId": 101,
  "amount": 135.0,
  "paymentType": "full_settlement"
}
```

**Response (Success - 200):**

```json
{
  "payment": {
    "id": 2002,
    "session_id": 42,
    "participant_id": 101,
    "amount": 135.0,
    "payment_type": "full_settlement",
    "created_at": "2026-04-19T14:36:00Z"
  },
  "remainingBalance": 0.0,
  "allSettled": true
}
```

**Notes:**

- Use when all participants have paid
- Session automatically closes when all debts settled

---

### 9. Close Session

**Endpoint:** `POST /session/close`

**Request:**

```json
{
  "sessionToken": "sess_abc123xyz789..."
}
```

**Response (Success - 200):**

```json
{
  "session": {
    "id": 42,
    "status": "closed",
    "closed_at": "2026-04-19T14:40:00Z",
    "totalAmount": 270.0,
    "participantCount": 2
  }
}
```

**Notes:**

- Called after all payments made
- Session cannot be reopened
- Historical data remains in database

---

## Iyzico 3DS Credit Card Payment

Kredi kartı ile ödeme için iyzico entegrasyonu. Tüm ödeme modlarını (`self`, `all`, `other`, `item`) destekler.

### Initiate 3DS Payment

**Endpoint:** `POST /api/payment/iyzico/initiate`

**Request:**

```json
{
  "sessionToken": "abc123...",
  "participantId": "uuid",
  "amount": 30.0,
  "paymentMode": "item",
  "targetId": null,
  "orderIds": ["order-uuid-1", "order-uuid-2"],
  "card": {
    "cardHolderName": "Ali Erdogan",
    "cardNumber": "4242424242424242",
    "expireMonth": "12",
    "expireYear": "2030",
    "cvc": "123"
  }
}
```

**`paymentMode` değerleri:**

| Değer   | Açıklama                          | Gerekli Alanlar |
| ------- | --------------------------------- | --------------- |
| `self`  | Kendi siparişlerini öde           | —               |
| `all`   | Masanın tamamını öde              | —               |
| `other` | Başka birinin borcunu öde         | `targetId`      |
| `item`  | Belirli siparişleri öde (ısmarla) | `orderIds`      |

**Response:**

```json
{
  "htmlContent": "<form>...3DS formu...</form>",
  "threeDsServerTransId": "...",
  "paymentId": "uuid"
}
```

`htmlContent` frontend'de iframe/modal içinde render edilir. Kullanıcı 3DS doğrulamasını tamamlayınca iyzico callback URL'ini çağırır.

---

### 3DS Callback

**Endpoint:** `POST /api/payment/iyzico/callback`

İyzico tarafından otomatik çağrılır, frontend bu endpoint'i doğrudan çağırmaz.

**Başarılı ödeme sonrası yapılanlar:**

- `item` modu → seçilen siparişler `paid_by` ile işaretlenir
- Tüm modlar → session `paid_amount` güncellenir
- Kalan bakiye 0 ise session otomatik kapanır
- WebSocket ile masadaki tüm katılımcılara bildirim gönderilir

**WebSocket eventi (`payment_completed`):**

```json
{
  "paymentId": "uuid",
  "participantId": "uuid",
  "amount": 30.0,
  "paymentMode": "item",
  "remainingBalance": 70.0,
  "allSettled": false,
  "targetName": null,
  "orderNames": "Türk Kahvesi, Su"
}
```

---

## Split Payment Algorithms

### Equal Split Algorithm

**Formula:**

```
Per Person = Total Bill / Number of Participants
```

**Example:**

```
Total: 270 TL
Participants: 2
Per Person: 135 TL each
```

**Edge Cases:**

- Rounding handled in separate decimal field
- Remainder distributed to first payer

---

### Item-Based Split Algorithm

**Formula:**

```
Per Person = Sum of their share in each item
(Allows multiple people to claim same item)
```

**Example:**

```
Item 1: 100 TL (Pizza) — claimed by Ali and Veli
Item 2: 60 TL (Kebab) — claimed by Ali only

Ali pays: 50 TL (half of pizza) + 60 TL (kebab) = 110 TL
Veli pays: 50 TL (half of pizza) = 50 TL
```

**Notes:**

- Flexible for shared items
- Requires item claims mapping

---

### Individual Owed Algorithm

**Formula:**

```
Per Person = Sum of only their own orders
```

**Example:**

```
Ali ordered: 150 TL (Adana Kebab)
Veli ordered: 120 TL (Tavuk + Çay)
Mehmet ordered: 80 TL (Şiş)

Ali pays: 150 TL
Veli pays: 120 TL
Mehmet pays: 80 TL
```

**Usage:**

- "Kendi Borcumu Öde" button → shows this amount
- "Birinin Borcunu Öde" button → shows target person's individual amount
- Most accurate for individual payments

**Notes:**

- No rounding issues (each person pays exact amount of their orders)
- Simplest and most fair method
- Used for individual payment decisions

---

## Staff/Admin APIs

**Authentication Required:** All admin endpoints require JWT token with appropriate role

### User Roles

| Role          | Permissions                                |
| ------------- | ------------------------------------------ |
| `owner`       | All operations                             |
| `head_waiter` | Dashboard, reports, staff list             |
| `waiter`      | View orders, place orders (future feature) |

---

### Get Staff List

**Endpoint:** `GET /admin/staff`

**Headers:**

```
Authorization: Bearer {token}
```

**Required Role:** `owner`, `head_waiter`

**Response (Success - 200):**

```json
{
  "staff": [
    {
      "id": 1,
      "name": "Ahmet",
      "role": "owner",
      "is_active": true,
      "last_login": "2026-04-19T14:30:00Z"
    },
    {
      "id": 2,
      "name": "Ali",
      "role": "waiter",
      "is_active": true,
      "last_login": "2026-04-19T14:15:00Z"
    }
  ]
}
```

---

### Create Staff Member

**Endpoint:** `POST /admin/staff`

**Headers:**

```
Authorization: Bearer {token}
```

**Required Role:** `owner`

**Request:**

```json
{
  "name": "Veli",
  "role": "waiter",
  "pin": "1234"
}
```

**Response (Success - 200):**

```json
{
  "staff": {
    "id": 3,
    "name": "Veli",
    "role": "waiter",
    "is_active": true,
    "created_at": "2026-04-19T14:40:00Z"
  }
}
```

**Validation Rules:**

- `name`: Required, max 100 characters
- `role`: Required, one of: `owner`, `head_waiter`, `waiter`
- `pin`: Required, 4 digits

---

### Update Staff Role

**Endpoint:** `PATCH /admin/staff/:id/role`

**Headers:**

```
Authorization: Bearer {token}
```

**Required Role:** `owner`

**Request:**

```json
{
  "role": "head_waiter"
}
```

**Response (Success - 200):**

```json
{
  "staff": {
    "id": 2,
    "name": "Ali",
    "role": "head_waiter",
    "updated_at": "2026-04-19T14:45:00Z"
  }
}
```

---

### Toggle Staff Active/Inactive

**Endpoint:** `PATCH /admin/staff/:id/active`

**Headers:**

```
Authorization: Bearer {token}
```

**Required Role:** `owner`

**Request:**

```json
{
  "is_active": false
}
```

**Response (Success - 200):**

```json
{
  "staff": {
    "id": 2,
    "name": "Ali",
    "is_active": false,
    "updated_at": "2026-04-19T14:46:00Z"
  }
}
```

---

### Reset Staff PIN

**Endpoint:** `POST /admin/staff/:id/reset-pin`

**Headers:**

```
Authorization: Bearer {token}
```

**Required Role:** `owner`

**Request:**

```json
{
  "newPin": "5678"
}
```

**Response (Success - 200):**

```json
{
  "message": "PIN sıfırlandı"
}
```

---

### Get Dashboard

**Endpoint:** `GET /admin/dashboard`

**Headers:**

```
Authorization: Bearer {token}
```

**Required Role:** `owner`, `head_waiter`

**Response (Success - 200):**

```json
{
  "activeSessions": 3,
  "totalRevenue": 15480.0,
  "averageSessionValue": 5160.0,
  "recentSessions": [
    {
      "session_id": 42,
      "table_id": 1,
      "participants": 2,
      "total": 270.0,
      "status": "closed",
      "created_at": "2026-04-19T14:30:00Z"
    }
  ],
  "activeOrders": [
    {
      "order_id": 1001,
      "table": "Masa 1",
      "item": "Adana Kebab",
      "quantity": 1,
      "ordered_by": "Ali",
      "created_at": "2026-04-19T14:31:00Z"
    }
  ]
}
```

---

### Get Reports

**Endpoint:** `GET /admin/reports`

**Headers:**

```
Authorization: Bearer {token}
```

**Query Parameters:**

- `startDate`: ISO 8601 date (default: 30 days ago)
- `endDate`: ISO 8601 date (default: today)

**Required Role:** `owner`, `head_waiter`

**Response (Success - 200):**

```json
{
  "dateRange": {
    "startDate": "2026-03-20",
    "endDate": "2026-04-19"
  },
  "summary": {
    "totalRevenue": 154800.0,
    "averageSessionValue": 5160.0,
    "totalSessions": 30,
    "averageParticipants": 2.5,
    "peakHour": "20:00"
  },
  "dailyBreakdown": [
    {
      "date": "2026-04-19",
      "sessions": 3,
      "revenue": 540.0
    }
  ],
  "splitMethods": {
    "equal_split": { "count": 20, "revenue": 102000.0 },
    "item_based": { "count": 10, "revenue": 52800.0 }
  }
}
```

---

### Get/Create Menu Items

**Endpoint:** `GET /admin/menu`

**Response (Success - 200):**

```json
{
  "menu": [
    {
      "id": 1,
      "name": "Adana Kebab",
      "category": "Main",
      "price": 150.0,
      "is_active": true
    },
    {
      "id": 2,
      "name": "Ayran",
      "category": "Beverage",
      "price": 20.0,
      "is_active": true
    }
  ]
}
```

**Endpoint:** `POST /admin/menu`

**Headers:**

```
Authorization: Bearer {token}
```

**Required Role:** `owner`

**Request:**

```json
{
  "name": "Manti",
  "category": "Main",
  "price": 120.0
}
```

**Response:** Menu item created

---

### Get Audit Logs

**Endpoint:** `GET /admin/audit-logs`

**Headers:**

```
Authorization: Bearer {token}
```

**Required Role:** `owner`

**Response (Success - 200):**

```json
{
  "logs": [
    {
      "id": 1,
      "timestamp": "2026-04-19T14:30:00Z",
      "user_id": 1,
      "user_name": "Ahmet",
      "action": "user_login",
      "entity_type": "user",
      "entity_id": 1,
      "details": {
        "role": "owner"
      }
    },
    {
      "id": 2,
      "timestamp": "2026-04-19T14:31:00Z",
      "user_id": 1,
      "user_name": "Ahmet",
      "action": "staff_created",
      "entity_type": "staff",
      "entity_id": 3,
      "details": {
        "name": "Veli",
        "role": "waiter"
      }
    }
  ]
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning           | Example                    |
| ---- | ----------------- | -------------------------- |
| 200  | Success           | Order placed successfully  |
| 400  | Bad Request       | Invalid input data         |
| 401  | Unauthorized      | Missing or invalid token   |
| 403  | Forbidden         | Insufficient permissions   |
| 404  | Not Found         | QR code doesn't exist      |
| 429  | Too Many Requests | Rate limit exceeded        |
| 500  | Server Error      | Database connection failed |

### Error Response Format

```json
{
  "error": "Human-readable error message in Turkish",
  "requestId": "req_abc123" // For debugging
}
```

---

### Cash/Platform Payment (Admin Only)

**Endpoint:** `POST /admin/tables/:sessionId/cash-payment`

**Headers:**

```
Authorization: Bearer {token}
```

**Required Role:** `owner`, `head_waiter`

**Request:**

```json
{
  "paymentType": "cash" | "transfer" | "credit_card" | "other"
}
```

**Response (Success - 200):**

```json
{
  "message": "Hesap ödendi",
  "amount": 216.0,
  "paymentType": "cash"
}
```

**Response (Error - 400):**

```json
{
  "error": "Hesap zaten ödendi"
}
```

**Behavior:**

- Automatically calculates remaining balance via `get_remaining_balance()` function
- Records payment in payments table with specified payment method
- Closes the session (`status = 'closed'`, `closed_at = NOW()`)
- Writes audit log entry: `action = 'cash_payment'`
- Broadcasts WebSocket event: `session_closed`
- Used for: cash payments, transfers, card payments, or any payment outside the digital system

**Payment Types:**

- `cash` — Physical cash payment
- `transfer` — Bank transfer (EFT/Havale)
- `credit_card` — Credit/debit card (outside app)
- `other` — Other payment method

**Note:** This endpoint bypasses the split calculation and directly marks the entire remaining balance as paid, then closes the session. Perfect for reconciling payments made outside the digital system.

---

## Rate Limiting

### Login Endpoint

**Limit:** 5 attempts per 15 minutes per IP address

**Response (429):**

```json
{
  "error": "Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin."
}
```

### General API Routes

**Limit:** 100 requests per minute per IP address

**Response (429):**

```json
{
  "error": "Çok hızlı istek gönderiyor"
}
```

---

## WebSocket Events

**Connection:** `ws://localhost:3000`

### Client Listens (Server → Client)

#### order_added

Fired when new order is placed

```json
{
  "type": "order_added",
  "data": {
    "order": {
      "id": 1001,
      "participant_id": 101,
      "item_name": "Adana Kebab",
      "price": 150.0,
      "quantity": 1
    },
    "timestamp": "2026-04-19T14:31:00Z"
  }
}
```

#### payment_completed

Fired when payment is recorded

```json
{
  "type": "payment_completed",
  "data": {
    "paymentId": 2001,
    "participantId": 101,
    "amount": 135.0,
    "remainingBalance": 0.0,
    "allSettled": true,
    "timestamp": "2026-04-19T14:35:00Z"
  }
}
```

#### session_closed

Fired when session is closed

```json
{
  "type": "session_closed",
  "data": {
    "sessionId": 42,
    "timestamp": "2026-04-19T14:40:00Z"
  }
}
```

---

## Example: Complete Customer Flow

```bash
# 1. QR Scan → Join Table
curl -X POST http://localhost:3000/api/session/join \
  -H "Content-Type: application/json" \
  -d '{
    "qrCode": "TABLE_001_UNIQUE_CODE",
    "participantName": "Ali"
  }'

# Response:
# {
#   "sessionToken": "sess_abc123...",
#   "participant": { "id": 101, "name": "Ali", "is_host": true }
# }

# 2. Get Session State
curl http://localhost:3000/api/session/sess_abc123...

# 3. Place Order
curl -X POST http://localhost:3000/api/order \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "sess_abc123...",
    "participantId": 101,
    "itemName": "Adana Kebab",
    "price": 150.00,
    "quantity": 1
  }'

# 4. Calculate Split
curl -X POST http://localhost:3000/api/split/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "sess_abc123...",
    "splitType": "equal_split"
  }'

# 5. Record Payment
curl -X POST http://localhost:3000/api/payment \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "sess_abc123...",
    "participantId": 101,
    "amount": 135.00,
    "paymentType": "equal_split"
  }'

# 6. Close Session
curl -X POST http://localhost:3000/api/session/close \
  -H "Content-Type: application/json" \
  -d '{"sessionToken": "sess_abc123..."}'
```

---

## Testing Tools

### Postman Collection

Coming soon - Will export as `.json`

### cURL Examples

All examples included in this document

### WebSocket Testing

```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c ws://localhost:3000
```

---

Generated: 2026-04-19  
Last Updated: 2026-04-19
