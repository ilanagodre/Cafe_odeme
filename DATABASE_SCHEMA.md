# Database Schema Documentation

Complete reference for Cafe Payment API database structure, relationships, and usage.

---

## Overview

The database uses **PostgreSQL 16** with the following design principles:

- **Immutability:** Historical data is preserved via `created_at` and `updated_at` timestamps
- **Referential Integrity:** Foreign keys enforce data consistency
- **Audit Trail:** All modifications are timestamped and traceable
- **Scalability:** Indexes on frequently queried columns

### Database Connection

```bash
# Connection string
postgresql://cafe_user:cafe_secret_2024@postgres:5432/cafe_payment

# Docker exec
docker exec -it cafe_db psql -U cafe_user -d cafe_payment
```

---

## Table Reference

### 1. users

**Purpose:** Store customer and staff user accounts.

**Schema:**

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'customer', -- customer, waiter, head_waiter, owner
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | Primary Key | Unique user identifier |
| `username` | VARCHAR(255) | UNIQUE, NOT NULL | Login username |
| `password_hash` | VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| `email` | VARCHAR(255) | UNIQUE | Email address |
| `full_name` | VARCHAR(255) | | User's display name |
| `role` | VARCHAR(50) | NOT NULL | User's role (customer, waiter, head_waiter, owner) |
| `is_active` | BOOLEAN | DEFAULT true | Soft delete flag |
| `created_at` | TIMESTAMP | DEFAULT NOW | Account creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW | Last modification time |

**Indexes:**

```sql
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

**Example Queries:**

```sql
-- Get all active staff
SELECT * FROM users WHERE role IN ('waiter', 'head_waiter', 'owner') AND is_active = true;

-- Count customers
SELECT COUNT(*) as customer_count FROM users WHERE role = 'customer';

-- Find user by username
SELECT * FROM users WHERE username = 'john_doe';
```

**Access Control:**

- Customers can only view/modify their own user data
- Staff can view all customer data
- Only owners can manage staff users

---

### 2. sessions

**Purpose:** Track customer payment sessions (QR code scan → session close).

**Schema:**

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code VARCHAR(255) UNIQUE NOT NULL,
  table_number INTEGER NOT NULL,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  payment_method VARCHAR(50), -- cash, card, combined
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | Primary Key | Session identifier |
| `qr_code` | VARCHAR(255) | UNIQUE, NOT NULL | QR code value (maps to table) |
| `table_number` | INTEGER | NOT NULL | Physical table number |
| `session_token` | VARCHAR(255) | UNIQUE, NOT NULL | JWT token for session |
| `is_active` | BOOLEAN | DEFAULT true | Session status (open/closed) |
| `started_at` | TIMESTAMP | DEFAULT NOW | Session start time |
| `closed_at` | TIMESTAMP | | Session end time |
| `total_amount` | DECIMAL(10,2) | DEFAULT 0 | Total session amount |
| `payment_method` | VARCHAR(50) | | Payment method used (cash, card, combined) |
| `created_at` | TIMESTAMP | DEFAULT NOW | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW | Last modification time |

**Indexes:**

```sql
CREATE INDEX idx_sessions_qr_code ON sessions(qr_code);
CREATE INDEX idx_sessions_table_number ON sessions(table_number);
CREATE INDEX idx_sessions_session_token ON sessions(session_token);
CREATE INDEX idx_sessions_is_active ON sessions(is_active);
CREATE INDEX idx_sessions_started_at ON sessions(started_at);
```

**Example Queries:**

```sql
-- Get active session for table 5
SELECT * FROM sessions WHERE table_number = 5 AND is_active = true;

-- Get session total
SELECT total_amount FROM sessions WHERE session_token = 'abc123xyz';

-- Find session by QR code
SELECT * FROM sessions WHERE qr_code = 'QR_TABLE_5';

-- Sessions from last 24 hours
SELECT * FROM sessions WHERE started_at > NOW() - INTERVAL '24 hours';

-- Revenue report (active + closed sessions)
SELECT SUM(total_amount) as total_revenue FROM sessions WHERE created_at > NOW() - INTERVAL '1 day';
```

**Session Lifecycle:**

1. Customer scans QR code → `POST /session/join` → Session created with `is_active = true`
2. Customer places orders → Orders recorded
3. Customer requests bill → `GET /session/:token` returns total amount
4. Customer pays → Payment recorded
5. Customer closes session → `POST /session/close` → `is_active = false`, `closed_at = NOW()`

---

### 3. participants

**Purpose:** Track individual customers within a session (each session can have multiple people).

**Schema:**

```sql
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_name VARCHAR(255),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | Primary Key | Participant identifier |
| `session_id` | UUID | Foreign Key, NOT NULL | Reference to session |
| `participant_name` | VARCHAR(255) | | Person's name (for anonymous customers) |
| `user_id` | UUID | Foreign Key | Reference to users table (nullable) |
| `joined_at` | TIMESTAMP | DEFAULT NOW | When participant joined |
| `is_active` | BOOLEAN | DEFAULT true | Participation status |
| `created_at` | TIMESTAMP | DEFAULT NOW | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW | Last modification time |

**Indexes:**

```sql
CREATE INDEX idx_participants_session_id ON participants(session_id);
CREATE INDEX idx_participants_user_id ON participants(user_id);
CREATE INDEX idx_participants_is_active ON participants(is_active);
```

**Cascade Rules:**

- When session is deleted → all participants are deleted (`ON DELETE CASCADE`)
- When user is deleted → participant's `user_id` becomes NULL (`ON DELETE SET NULL`)

**Example Queries:**

```sql
-- Get all participants in a session
SELECT p.id, p.participant_name, p.user_id, p.joined_at 
FROM participants p 
WHERE p.session_id = 'session_uuid' AND p.is_active = true;

-- Count participants in session
SELECT COUNT(*) as participant_count 
FROM participants 
WHERE session_id = 'session_uuid' AND is_active = true;

-- Sessions with their participant count
SELECT s.id, s.table_number, COUNT(p.id) as participant_count
FROM sessions s
LEFT JOIN participants p ON s.id = p.session_id
WHERE s.is_active = true
GROUP BY s.id;

-- Find participant's orders
SELECT o.* FROM orders o
WHERE o.participant_id = 'participant_uuid'
ORDER BY o.created_at DESC;
```

**Participant Roles in Payment Split:**

Each participant can:
- Order items independently
- View their own bill portion
- Receive their split calculation
- Pay their portion

---

### 4. orders

**Purpose:** Store individual food/drink orders from participants.

**Schema:**

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  special_instructions TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, preparing, ready, served, cancelled
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | Primary Key | Order identifier |
| `session_id` | UUID | Foreign Key, NOT NULL | Reference to session |
| `participant_id` | UUID | Foreign Key, NOT NULL | Participant who ordered |
| `menu_item_id` | UUID | Foreign Key, NOT NULL | Menu item ordered |
| `quantity` | INTEGER | NOT NULL | Quantity ordered |
| `unit_price` | DECIMAL(10,2) | NOT NULL | Price per unit (snapshot) |
| `special_instructions` | TEXT | | Customer notes (no onions, extra spice, etc.) |
| `status` | VARCHAR(50) | DEFAULT 'pending' | Order status in kitchen |
| `created_at` | TIMESTAMP | DEFAULT NOW | Order creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW | Last status update |

**Indexes:**

```sql
CREATE INDEX idx_orders_session_id ON orders(session_id);
CREATE INDEX idx_orders_participant_id ON orders(participant_id);
CREATE INDEX idx_orders_menu_item_id ON orders(menu_item_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

**Order Lifecycle:**

1. Customer selects item → `POST /order` → Status = `pending`
2. Kitchen receives → Status = `confirmed`
3. Food being made → Status = `preparing`
4. Food ready → Status = `ready`
5. Server delivers → Status = `served`
6. Customer cancels → Status = `cancelled`

**Example Queries:**

```sql
-- Get all pending orders for session
SELECT o.id, o.participant_id, mi.name, o.quantity, o.status
FROM orders o
JOIN menu_items mi ON o.menu_item_id = mi.id
WHERE o.session_id = 'session_uuid' AND o.status != 'cancelled'
ORDER BY o.created_at;

-- Calculate participant's bill total
SELECT SUM(o.quantity * o.unit_price) as participant_total
FROM orders o
WHERE o.participant_id = 'participant_uuid' AND o.status != 'cancelled';

-- Kitchen dashboard - all pending orders
SELECT o.id, s.table_number, mi.name, o.quantity, o.special_instructions
FROM orders o
JOIN sessions s ON o.session_id = s.id
JOIN menu_items mi ON o.menu_item_id = mi.id
WHERE o.status IN ('pending', 'confirmed', 'preparing')
ORDER BY o.created_at;

-- Sales by menu item (today)
SELECT mi.name, SUM(o.quantity) as units_sold, SUM(o.quantity * o.unit_price) as revenue
FROM orders o
JOIN menu_items mi ON o.menu_item_id = mi.id
WHERE DATE(o.created_at) = CURRENT_DATE AND o.status != 'cancelled'
GROUP BY mi.name
ORDER BY revenue DESC;
```

---

### 5. menu_items

**Purpose:** Define available food and drink items.

**Schema:**

```sql
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL, -- coffee, food, pastry, beverage, dessert, alcohol
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'TRY',
  is_available BOOLEAN DEFAULT true,
  preparation_time_minutes INTEGER,
  image_url VARCHAR(500),
  dietary_info VARCHAR(255), -- vegan, vegetarian, gluten-free, etc.
  allergens TEXT, -- comma-separated: dairy, nuts, shellfish, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | Primary Key | Menu item identifier |
| `name` | VARCHAR(255) | NOT NULL | Item name |
| `description` | TEXT | | Item description |
| `category` | VARCHAR(100) | NOT NULL | Category (coffee, food, pastry, beverage, dessert, alcohol) |
| `price` | DECIMAL(10,2) | NOT NULL | Item price |
| `currency` | VARCHAR(3) | DEFAULT 'TRY' | Currency code |
| `is_available` | BOOLEAN | DEFAULT true | Availability status |
| `preparation_time_minutes` | INTEGER | | Kitchen prep time |
| `image_url` | VARCHAR(500) | | Item image URL |
| `dietary_info` | VARCHAR(255) | | Dietary properties |
| `allergens` | TEXT | | Allergen warnings |
| `created_at` | TIMESTAMP | DEFAULT NOW | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW | Last modification time |

**Indexes:**

```sql
CREATE INDEX idx_menu_items_category ON menu_items(category);
CREATE INDEX idx_menu_items_is_available ON menu_items(is_available);
CREATE INDEX idx_menu_items_name ON menu_items(name);
```

**Example Queries:**

```sql
-- Get all available items by category
SELECT * FROM menu_items 
WHERE category = 'coffee' AND is_available = true
ORDER BY name;

-- Search menu items
SELECT * FROM menu_items 
WHERE name ILIKE '%cappuccino%' AND is_available = true;

-- Get items with allergens
SELECT name, allergens FROM menu_items 
WHERE allergens IS NOT NULL AND is_available = true;

-- Menu for display (with image)
SELECT id, name, description, category, price, image_url 
FROM menu_items 
WHERE is_available = true
ORDER BY category, name;
```

---

### 6. payments

**Purpose:** Track payment transactions for sessions and participants.

**Schema:**

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL, -- cash, card
  payment_status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, cancelled
  transaction_id VARCHAR(255), -- from payment gateway (Stripe, etc.)
  reference_number VARCHAR(255), -- receipt number
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | Primary Key | Payment identifier |
| `session_id` | UUID | Foreign Key, NOT NULL | Reference to session |
| `participant_id` | UUID | Foreign Key | Participant paying (nullable for session-level payment) |
| `amount` | DECIMAL(10,2) | NOT NULL | Payment amount |
| `payment_method` | VARCHAR(50) | NOT NULL | Payment method (cash, card) |
| `payment_status` | VARCHAR(50) | DEFAULT 'pending' | Status (pending, completed, failed, cancelled) |
| `transaction_id` | VARCHAR(255) | | External payment gateway ID |
| `reference_number` | VARCHAR(255) | | Receipt/transaction reference |
| `notes` | TEXT | | Payment notes/memo |
| `created_at` | TIMESTAMP | DEFAULT NOW | Payment initiation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW | Last status update |

**Indexes:**

```sql
CREATE INDEX idx_payments_session_id ON payments(session_id);
CREATE INDEX idx_payments_participant_id ON payments(participant_id);
CREATE INDEX idx_payments_payment_status ON payments(payment_status);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
```

**Payment Flows:**

**Flow 1: Individual Payment (Split)**
```
Participant calculates their share → 
POST /payment/individual (participant_id + amount) → 
Payment created with participant_id
```

**Flow 2: Session-Level Payment (All together)**
```
Session participants total bill → 
POST /payment/session (session_id + total_amount) → 
Payment created with NULL participant_id
```

**Flow 3: Partial Payment**
```
Participant pays portion of their bill → 
POST /payment/partial (participant_id + partial_amount) → 
Multiple payments recorded
```

**Example Queries:**

```sql
-- Get all payments for a session
SELECT p.id, p.participant_id, p.amount, p.payment_method, p.payment_status
FROM payments p
WHERE p.session_id = 'session_uuid'
ORDER BY p.created_at DESC;

-- Total received for session
SELECT SUM(p.amount) as total_paid
FROM payments p
WHERE p.session_id = 'session_uuid' AND p.payment_status = 'completed';

-- Failed payments that need follow-up
SELECT p.id, s.table_number, p.amount, p.transaction_id
FROM payments p
JOIN sessions s ON p.session_id = s.id
WHERE p.payment_status = 'failed'
ORDER BY p.created_at DESC;

-- Daily payment summary
SELECT 
  DATE(p.created_at) as payment_date,
  p.payment_method,
  COUNT(*) as transaction_count,
  SUM(p.amount) as total_amount
FROM payments p
WHERE p.payment_status = 'completed'
GROUP BY DATE(p.created_at), p.payment_method
ORDER BY payment_date DESC;

-- Participant's payment history
SELECT p.amount, p.payment_method, p.payment_status, p.created_at
FROM payments p
WHERE p.participant_id = 'participant_uuid'
ORDER BY p.created_at DESC;
```

---

### 7. payment_splits

**Purpose:** Record calculated split amounts for each participant (audit trail for split algorithm).

**Schema:**

```sql
CREATE TABLE payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  total_session_amount DECIMAL(10, 2) NOT NULL,
  participant_share DECIMAL(10, 2) NOT NULL,
  split_method VARCHAR(50) NOT NULL, -- equal, itemized
  calculation_details JSONB, -- JSON breakdown of calculation
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | Primary Key | Split record identifier |
| `session_id` | UUID | Foreign Key, NOT NULL | Reference to session |
| `participant_id` | UUID | Foreign Key, NOT NULL | Participant's share |
| `total_session_amount` | DECIMAL(10,2) | NOT NULL | Full session total |
| `participant_share` | DECIMAL(10,2) | NOT NULL | This participant's share |
| `split_method` | VARCHAR(50) | NOT NULL | Method used (equal, itemized) |
| `calculation_details` | JSONB | | Detailed calculation breakdown |
| `created_at` | TIMESTAMP | DEFAULT NOW | Calculation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW | Last modification |

**Indexes:**

```sql
CREATE INDEX idx_payment_splits_session_id ON payment_splits(session_id);
CREATE INDEX idx_payment_splits_participant_id ON payment_splits(participant_id);
```

**Calculation Details (JSON):**

```json
{
  "method": "itemized",
  "participant_orders": [
    {
      "item_name": "Cappuccino",
      "quantity": 2,
      "unit_price": 25.00,
      "subtotal": 50.00
    }
  ],
  "subtotal": 50.00,
  "tax_rate": 0.18,
  "tax": 9.00,
  "service_charge": 0,
  "total": 59.00
}
```

**Example Queries:**

```sql
-- Get split breakdown for session
SELECT 
  p.participant_name,
  ps.participant_share,
  ps.split_method,
  ps.calculation_details
FROM payment_splits ps
JOIN participants p ON ps.participant_id = p.id
WHERE ps.session_id = 'session_uuid'
ORDER BY ps.participant_share DESC;

-- Verify split accuracy
SELECT 
  SUM(ps.participant_share) as total_from_split,
  ps.total_session_amount as actual_total
FROM payment_splits ps
WHERE ps.session_id = 'session_uuid'
GROUP BY ps.session_id, ps.total_session_amount;

-- Split calculation audit trail
SELECT ps.id, ps.created_at, ps.split_method, ps.participant_share
FROM payment_splits ps
WHERE ps.participant_id = 'participant_uuid'
ORDER BY ps.created_at DESC;
```

---

### 8. sessions_metadata

**Purpose:** Store extra session data (notes, custom fields, preferences).

**Schema:**

```sql
CREATE TABLE sessions_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  table_name VARCHAR(255), -- "Table 5", "Bar Seat 3", etc.
  customer_notes TEXT, -- special requests, complaints, feedback
  staff_notes TEXT, -- internal notes
  reservation_name VARCHAR(255),
  event_type VARCHAR(100), -- regular, birthday, business, etc.
  num_covers_expected INTEGER, -- expected number of people
  service_charge_percentage DECIMAL(5, 2), -- optional service charge
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Example Queries:**

```sql
-- Sessions with special notes
SELECT s.id, s.table_number, sm.customer_notes, sm.staff_notes
FROM sessions s
LEFT JOIN sessions_metadata sm ON s.id = sm.session_id
WHERE sm.customer_notes IS NOT NULL OR sm.staff_notes IS NOT NULL;

-- Birthday parties today
SELECT s.table_number, sm.reservation_name, COUNT(p.id) as actual_covers
FROM sessions s
LEFT JOIN sessions_metadata sm ON s.id = sm.session_id
LEFT JOIN participants p ON s.id = p.session_id
WHERE sm.event_type = 'birthday' AND DATE(s.started_at) = CURRENT_DATE
GROUP BY s.id, sm.reservation_name;
```

---

### 9. audit_logs

**Purpose:** Track all critical operations for compliance and debugging.

**Schema:**

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL, -- login, logout, create_order, process_payment, refund, etc.
  entity_type VARCHAR(50), -- session, order, payment, user, etc.
  entity_id UUID, -- ID of affected entity
  old_values JSONB, -- before state
  new_values JSONB, -- after state
  ip_address INET,
  user_agent VARCHAR(500),
  status VARCHAR(50) DEFAULT 'success', -- success, error, unauthorized
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**

```sql
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

**Example Queries:**

```sql
-- All actions by a user
SELECT action, entity_type, status, created_at
FROM audit_logs
WHERE actor_id = 'user_uuid'
ORDER BY created_at DESC;

-- Failed login attempts
SELECT ip_address, COUNT(*) as attempts, MAX(created_at) as last_attempt
FROM audit_logs
WHERE action = 'login' AND status = 'error'
GROUP BY ip_address
HAVING COUNT(*) > 3
ORDER BY attempts DESC;

-- Payment modifications
SELECT a.actor_id, u.username, a.old_values, a.new_values, a.created_at
FROM audit_logs a
LEFT JOIN users u ON a.actor_id = u.id
WHERE a.entity_type = 'payment'
ORDER BY a.created_at DESC;

-- Audit trail for specific session
SELECT action, actor_id, old_values, new_values, created_at
FROM audit_logs
WHERE entity_id = 'session_uuid'
ORDER BY created_at;
```

---

## Relationships & Constraints

```
users
  ├─ sessions (staff member closes session)
  ├─ audit_logs (tracks user actions)
  └─ participants (user_id FK)

sessions
  ├─ participants (1:N) [ON DELETE CASCADE]
  ├─ orders (1:N) [ON DELETE CASCADE]
  ├─ payments (1:N) [ON DELETE CASCADE]
  ├─ payment_splits (1:N) [ON DELETE CASCADE]
  └─ sessions_metadata (1:1) [ON DELETE CASCADE]

participants
  ├─ orders (1:N) [ON DELETE CASCADE]
  ├─ payments (1:N) [ON DELETE SET NULL]
  └─ payment_splits (1:N) [ON DELETE CASCADE]

menu_items
  └─ orders (1:N)
```

### Referential Integrity

**Cascade Rules:**
- When session deleted → all orders, payments, participants deleted
- When participant deleted → all their orders deleted
- When user deleted → participant.user_id becomes NULL

**Data Consistency Checks:**
```sql
-- Ensure payment_splits total matches session total
SELECT 
  ps.session_id,
  ROUND(SUM(ps.participant_share)::numeric, 2) as split_total,
  ROUND(ps.total_session_amount::numeric, 2) as session_total
FROM payment_splits ps
GROUP BY ps.session_id, ps.total_session_amount
HAVING ROUND(SUM(ps.participant_share)::numeric, 2) != ROUND(ps.total_session_amount::numeric, 2);

-- Find orphaned participants (no session)
SELECT p.* FROM participants p
LEFT JOIN sessions s ON p.session_id = s.id
WHERE s.id IS NULL;

-- Verify closed sessions don't have new orders
SELECT o.* FROM orders o
JOIN sessions s ON o.session_id = s.id
WHERE s.is_active = false AND o.created_at > s.closed_at;
```

---

## Data Types & Constraints

### UUID vs Integer

**Current Implementation:** UUIDs for all primary keys

**Advantages:**
- Distributed generation (no sequence conflicts)
- Better privacy (IDs aren't sequential)
- Merging data from multiple databases easier

**Generate UUID in PostgreSQL:**
```sql
-- Automatically via DEFAULT
DEFAULT gen_random_uuid()

-- Or explicitly
SELECT gen_random_uuid();
```

### DECIMAL vs FLOAT

**Current Implementation:** DECIMAL(10, 2) for all monetary amounts

**Advantages:**
- Exact decimal representation (no floating-point rounding errors)
- 10 digits total, 2 after decimal = max 99,999,999.99

**Example:**
```sql
-- Correct: 25.00 TRY
price DECIMAL(10, 2) NOT NULL

-- Wrong: 25.0 (floating-point precision issues)
price FLOAT NOT NULL
```

### JSONB vs VARCHAR

**Used for:**
- `calculation_details` in `payment_splits` (structured, searchable)
- `old_values`/`new_values` in `audit_logs` (flexible schema)

**Advantages:**
- Better than TEXT for structured data
- Fully indexed and searchable
- Efficient storage compression

---

## Performance Tuning

### Key Statistics

```sql
-- Table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index sizes
SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Analyze tables for query planner
ANALYZE;
```

### Common Slow Queries & Solutions

**Problem:** Slow session listing

```sql
-- SLOW: Multiple joins, no WHERE clause
SELECT * FROM sessions
JOIN participants ON sessions.id = participants.session_id
JOIN orders ON participants.id = orders.participant_id;

-- FAST: Filter by date, use indexes
SELECT s.* FROM sessions s
WHERE s.created_at > NOW() - INTERVAL '7 days'
AND s.is_active = false;
```

**Problem:** N+1 queries (loading participants for each session)

```sql
-- SLOW: Loop through sessions, query each participant
sessions.forEach(s => {
  const participants = db.query('SELECT * FROM participants WHERE session_id = ?', s.id);
});

-- FAST: Single query with JOIN
SELECT s.*, p.* FROM sessions s
LEFT JOIN participants p ON s.id = p.session_id;
```

---

## Migrations & Schema Changes

### Version 1.0 (Current)

Tables:
- users
- sessions
- participants
- orders
- menu_items
- payments
- payment_splits
- sessions_metadata
- audit_logs

### How to Add a New Column

```bash
# 1. Create migration file
touch database/migration_v1_1.sql

# 2. Write migration
cat > database/migration_v1_1.sql << 'EOF'
-- Add tip_amount to payments
ALTER TABLE payments
ADD COLUMN tip_amount DECIMAL(10, 2) DEFAULT 0;

CREATE INDEX idx_payments_tip_amount ON payments(tip_amount);
EOF

# 3. Add to docker-entrypoint-initdb.d/ in docker-compose.yml
# 4. Rebuild and restart
docker compose down -v
docker compose up -d
```

---

## Backup & Recovery

### Backup Strategy

```bash
# Automatic backup (daily at 2 AM)
./database/backup.sh

# Full backup includes all tables, data, and indexes
# Size: ~8-50 MB depending on data volume
```

### Restore Procedure

```bash
# Restore from backup
./database/restore.sh ./.backups/cafe_db_backup_20260419_143000.sql

# Verify restoration
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "SELECT COUNT(*) FROM sessions;"
```

---

## Best Practices

### Query Writing

1. **Always specify columns (no SELECT \*)**
   ```sql
   -- Good
   SELECT id, name, price FROM menu_items;
   
   -- Bad
   SELECT * FROM menu_items;
   ```

2. **Use indexes efficiently**
   ```sql
   -- Good: Uses index on created_at
   SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '7 days';
   
   -- Bad: Full table scan
   SELECT * FROM orders WHERE EXTRACT(MONTH FROM created_at) = 4;
   ```

3. **Use transactions for multi-step operations**
   ```sql
   BEGIN;
   INSERT INTO payments (...) VALUES (...);
   UPDATE sessions SET total_amount = total_amount + ... WHERE id = ...;
   COMMIT;
   ```

### Data Integrity

1. **Always validate data before insert**
   - Check amount > 0
   - Check participant exists
   - Check session is active

2. **Use constraints to prevent bad data**
   ```sql
   -- Already in place:
   ALTER TABLE orders ADD CHECK (quantity > 0);
   ALTER TABLE payments ADD CHECK (amount > 0);
   ```

3. **Keep audit trail for critical operations**
   - Log all payment changes
   - Log staff actions
   - Keep customer notes

---

## Troubleshooting

### High Disk Usage

```bash
# Check table sizes
docker exec cafe_db psql -U cafe_user -d cafe_payment \
  -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) \
      FROM pg_tables ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10;"

# Clean old audit logs (older than 90 days)
docker exec cafe_db psql -U cafe_user -d cafe_payment \
  -c "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';"
```

### Slow Queries

```bash
# Enable slow query log (queries > 1s)
docker exec cafe_db psql -U cafe_user -d cafe_payment \
  -c "SET log_min_duration_statement = 1000;"

# View slow queries
docker logs cafe_db | grep "duration:"
```

### Foreign Key Violations

```sql
-- Find orphaned records
SELECT o.* FROM orders o
LEFT JOIN participants p ON o.participant_id = p.id
WHERE p.id IS NULL;

-- Fix: Delete orphaned orders (if safe)
DELETE FROM orders WHERE participant_id NOT IN (SELECT id FROM participants);
```

---

## For Developers

### Testing Data

Use pre-seeded test data from `database/seed.sql`:

```sql
-- Test users
INSERT INTO users (username, password_hash, role) VALUES 
('owner', '$2b$10$...hashed_password...', 'owner'),
('waiter1', '$2b$10$...', 'waiter'),
('customer', '$2b$10$...', 'customer');

-- Test menu items
INSERT INTO menu_items (name, category, price) VALUES 
('Cappuccino', 'coffee', 25.00),
('Hamburger', 'food', 45.00),
('Cheesecake', 'dessert', 35.00);
```

### Local Database Access

```bash
# Connect to database locally
docker exec -it cafe_db psql -U cafe_user -d cafe_payment

# Common psql commands:
\dt              -- List tables
\d table_name    -- Describe table
\x               -- Expand output (for wide tables)
\q               -- Quit

# Example query in psql:
SELECT * FROM menu_items LIMIT 5;
```

---

For more information, see:
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API endpoints
- [INSTALLATION_GUIDE.md](./INSTALLATION_GUIDE.md) - Setup instructions
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - Production deployment
