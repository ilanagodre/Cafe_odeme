-- Iyzico Payment Mode Support
-- Adds columns needed to execute mode-specific post-payment logic in the callback

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS target_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_ids JSONB;

COMMENT ON COLUMN payments.payment_mode IS 'self | all | other | item';
COMMENT ON COLUMN payments.target_id IS 'For "other" mode: the participant being paid for';
COMMENT ON COLUMN payments.order_ids IS 'For "item" mode: array of order UUIDs being paid';
