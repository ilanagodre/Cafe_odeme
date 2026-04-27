-- ============================================
-- PHASE 1 MIGRATION: Auth + Roles + Audit
-- ============================================
-- Run AFTER initial schema + seed
-- ============================================

-- 1. Add PIN to users (4-digit, hashed)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Add session_number for tracking (Masa1-#1, Masa1-#2, ...)
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS session_number INT DEFAULT 1;

-- 3. Add cancel fields to orders (soft-delete)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- 4. Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- 5. Create initial admin user (PIN: 1234)
DELETE FROM users WHERE role = 'owner';
INSERT INTO users (name, role, pin_hash, is_active) VALUES
    ('Patron', 'owner', '$2b$10$s9e.C5RoRVxE3FdJUkjp2e0dpxoNxOgUMqzHVSInXcV5bzUvyxMPe', true);

-- 6. Create sample staff users
DELETE FROM users WHERE role IN ('waiter', 'head_waiter') AND name IN ('Mehmet', 'Ahmet', 'Elif');
INSERT INTO users (name, role, pin_hash, is_active) VALUES
    ('Mehmet', 'waiter', '$2b$10$uCaHjCq0CH5EFNf8lYcV1.tYY4whtP.kxYS3273ud/TK3FjZJyTxy', true),
    ('Ahmet', 'head_waiter', '$2b$10$gVmKMUZ/qrO2Zlbp1kcAjetC8EX8OOZg5IA.5ozPsJwdZqvtMBWh6', true),
    ('Elif', 'waiter', '$2b$10$1MOXqxPhGLKcDhFxQXFdAOHYHt2rFOWKzYhL7wpnGNSi19Z.8adEe', true);

-- 7. Helper: auto-increment session_number per table
CREATE OR REPLACE FUNCTION next_session_number(p_table_id UUID)
RETURNS INT AS $$
DECLARE v_max INT;
BEGIN
    SELECT COALESCE(MAX(session_number), 0) + 1
    INTO v_max
    FROM table_sessions
    WHERE table_id = p_table_id;
    RETURN v_max;
END;
$$ LANGUAGE plpgsql;
