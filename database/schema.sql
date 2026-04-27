-- ============================================
-- MVP DATABASE SCHEMA - 5 Core Tables Only
-- ============================================
-- Goal: QR → Table → Split → Pay (demo-ready)
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE session_status_enum AS ENUM ('active', 'closed');
CREATE TYPE order_status_enum AS ENUM ('pending', 'served', 'cancelled');
CREATE TYPE payment_status_enum AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE payment_type_enum AS ENUM ('full', 'equal_split', 'item_based');

-- ────────────────────────────────────────────
-- 0. USERS (Staff + Customers)
-- ────────────────────────────────────────────
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(150) UNIQUE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'waiter',  -- waiter, head_waiter, owner, customer
    pin_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- ────────────────────────────────────────────
-- 1. TABLES (Physical tables with QR codes)
-- ────────────────────────────────────────────
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_number VARCHAR(10) NOT NULL UNIQUE,
    qr_code VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- 2. TABLE_SESSIONS (Active table session)
-- ────────────────────────────────────────────
CREATE TABLE table_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    session_token VARCHAR(64) UNIQUE NOT NULL DEFAULT md5(random()::text || now()::text || clock_timestamp()::text),
    status session_status_enum NOT NULL DEFAULT 'active',
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    total_bill DECIMAL(12,2) DEFAULT 0,
    paid_amount DECIMAL(12,2) DEFAULT 0
);

-- ────────────────────────────────────────────
-- 3. PARTICIPANTS (People at the table)
-- ────────────────────────────────────────────
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color_code VARCHAR(7) DEFAULT '#6366F1',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_host BOOLEAN DEFAULT false
);

-- ────────────────────────────────────────────
-- 4. ORDERS (Items ordered at the table)
-- ────────────────────────────────────────────
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    total_price DECIMAL(10,2) NOT NULL,
    status order_status_enum NOT NULL DEFAULT 'pending',
    ordered_by UUID REFERENCES participants(id) ON DELETE SET NULL,
    paid_by UUID REFERENCES participants(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- 5. PAYMENTS
-- ────────────────────────────────────────────
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    payment_type payment_type_enum NOT NULL DEFAULT 'full',
    status payment_status_enum NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ────────────────────────────────────────────
-- 6. MENU_ITEMS (Menu items for ordering)
-- ────────────────────────────────────────────
CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_token ON table_sessions(session_token);
CREATE INDEX idx_sessions_table ON table_sessions(table_id);
CREATE INDEX idx_participants_session ON participants(session_id);
CREATE INDEX idx_orders_session ON orders(session_id);
CREATE INDEX idx_payments_session ON payments(session_id);

-- Helper: remaining balance
CREATE OR REPLACE FUNCTION get_remaining_balance(p_session_id UUID)
RETURNS DECIMAL AS $$
DECLARE v_total DECIMAL; v_paid DECIMAL;
BEGIN
    SELECT COALESCE(SUM(total_price), 0) INTO v_total
    FROM orders WHERE session_id = p_session_id AND status != 'cancelled';
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments WHERE session_id = p_session_id AND status = 'completed';
    RETURN v_total - v_paid;
END;
$$ LANGUAGE plpgsql;
