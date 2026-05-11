-- ============================================
-- SELF-SERVICE QR FLOW MIGRATION
-- ============================================
-- ÖNEMLI: Bu dosya psql ile doğrudan çalıştırılmalı.
-- ALTER TYPE ... ADD VALUE PostgreSQL'de transaction
-- dışında auto-commit modda çalışır.
-- Bir migration runner kullanıyorsanız iki adımda çalıştırın:
--   Adım 1: PART 1 (enum değerleri)
--   Adım 2: PART 2 (kolonlar, indexler, fonksiyonlar)
-- ============================================

-- ============================================
-- PART 1: ENUM DEĞERLERİ (transaction dışı)
-- ============================================

-- session_status_enum: 'waiting_service' ekle
-- Mevcut: active, closed
-- Yeni:   active, waiting_service, closed
ALTER TYPE session_status_enum ADD VALUE IF NOT EXISTS 'waiting_service' BEFORE 'closed';

-- order_status_enum: 'pending_payment' ve 'preparing' ekle
-- Mevcut: pending, served, cancelled
-- Yeni:   pending_payment, pending, preparing, served, cancelled
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'pending_payment' BEFORE 'pending';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'preparing' BEFORE 'served';

-- ============================================
-- PART 2: TABLO DEĞİŞİKLİKLERİ
-- ============================================

-- tables: max_concurrent kapasitesi
ALTER TABLE tables
    ADD COLUMN IF NOT EXISTS max_concurrent INT NOT NULL DEFAULT 6
        CHECK (max_concurrent > 0 AND max_concurrent <= 50);

-- table_sessions: self-service alanları
ALTER TABLE table_sessions
    ADD COLUMN IF NOT EXISTS session_type VARCHAR(20) NOT NULL DEFAULT 'waiter'
        CHECK (session_type IN ('waiter', 'self_service')),
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS timeout_warned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS served_at TIMESTAMP WITH TIME ZONE;

-- Indexler
CREATE INDEX IF NOT EXISTS idx_sessions_status_type
    ON table_sessions(status, session_type);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON table_sessions(expires_at)
    WHERE status IN ('active', 'waiting_service');

-- ============================================
-- PART 3: YARDIMCI FONKSİYONLAR
-- ============================================

-- Bir masanın aktif katılımcı sayısını döndürür
-- (hem active hem waiting_service session'larındaki katılımcılar)
CREATE OR REPLACE FUNCTION get_active_participant_count(p_table_id UUID)
RETURNS INT AS $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(p.id) INTO v_count
    FROM participants p
    JOIN table_sessions ts ON p.session_id = ts.id
    WHERE ts.table_id = p_table_id
      AND ts.status IN ('active', 'waiting_service');
    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- get_remaining_balance fonksiyonunu güncelle:
-- pending_payment siparişleri bakiyeye dahil edilir (ödenene kadar borç sayılır)
-- Fakat split hesaplamalarında ayrıca filtrelenebilir (bkz. splitAlgorithms.js)
CREATE OR REPLACE FUNCTION get_remaining_balance(p_session_id UUID)
RETURNS DECIMAL AS $$
DECLARE v_total DECIMAL; v_paid DECIMAL;
BEGIN
    SELECT COALESCE(SUM(total_price), 0) INTO v_total
    FROM orders
    WHERE session_id = p_session_id
      AND status NOT IN ('cancelled');
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments
    WHERE session_id = p_session_id
      AND status = 'completed';
    RETURN v_total - v_paid;
END;
$$ LANGUAGE plpgsql;
