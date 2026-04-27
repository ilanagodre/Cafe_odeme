-- Iyzico Payment Gateway Integration
-- Adds columns for storing provider information and payment details

-- Add 'iyzico_3ds' to payment_type_enum
ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'iyzico_3ds';

-- Add provider-related columns to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider VARCHAR(30),
  ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(150),
  ADD COLUMN IF NOT EXISTS provider_payload JSONB;

-- Create index for fast lookup of payments by provider reference
-- (used for webhook/callback handling)
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref
  ON payments(provider_reference)
  WHERE provider IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN payments.provider IS 'Payment provider: iyzico, cash, mock, etc.';
COMMENT ON COLUMN payments.provider_reference IS 'External provider payment ID or conversation ID';
COMMENT ON COLUMN payments.provider_payload IS 'Full response payload from payment provider (JSONB)';
