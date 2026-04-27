-- Migration: Add payment methods to payment_type_enum
-- Enables cash, transfer, credit_card, and other payment types for admin cash payments

ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'cash';
ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'transfer';
ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'credit_card';
ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'other';
