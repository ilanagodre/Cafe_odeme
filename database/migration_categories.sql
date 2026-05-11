-- Dynamic menu categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed from existing menu_items
INSERT INTO categories (name)
SELECT DISTINCT category FROM menu_items
WHERE category IS NOT NULL AND category != ''
ON CONFLICT (name) DO NOTHING;
