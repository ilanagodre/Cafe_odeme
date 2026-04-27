-- ============================================
-- PHASE 2 MIGRATION: Order Status Enhancement
-- ============================================
-- Add 'preparing' status for chef/waiter workflow
-- Run AFTER Phase 1 migration
-- ============================================

-- Add 'preparing' status to order_status_enum
-- This allows: pending → preparing → served workflow
-- BEFORE is critical: adds 'preparing' in the correct position
ALTER TYPE order_status_enum ADD VALUE 'preparing' BEFORE 'served';

-- Update any default orders to still work
-- (existing orders stay at 'pending' until manually updated)
COMMENT ON TYPE order_status_enum IS 'Order lifecycle: pending → preparing → served, or cancelled at any point';
