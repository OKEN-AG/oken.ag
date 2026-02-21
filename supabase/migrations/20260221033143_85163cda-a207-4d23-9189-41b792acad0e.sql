
-- Step 1: Delete campaign_products that reference duplicate products (keep only those pointing to canonical)
WITH canonical AS (
  SELECT DISTINCT ON (code) id AS canonical_id, code
  FROM products
  WHERE code IS NOT NULL AND code != ''
  ORDER BY code, created_at ASC
),
dupe_product_ids AS (
  SELECT p.id AS dupe_id
  FROM products p
  JOIN canonical c ON c.code = p.code
  WHERE p.id != c.canonical_id
)
DELETE FROM campaign_products WHERE product_id IN (SELECT dupe_id FROM dupe_product_ids);

-- Step 2: Delete combo_products that reference duplicate products
WITH canonical AS (
  SELECT DISTINCT ON (code) id AS canonical_id, code
  FROM products
  WHERE code IS NOT NULL AND code != ''
  ORDER BY code, created_at ASC
),
dupe_product_ids AS (
  SELECT p.id AS dupe_id
  FROM products p
  JOIN canonical c ON c.code = p.code
  WHERE p.id != c.canonical_id
)
DELETE FROM combo_products WHERE product_id IN (SELECT dupe_id FROM dupe_product_ids);

-- Step 3: Delete operation_items that reference duplicate products (update would also cause issues)
WITH canonical AS (
  SELECT DISTINCT ON (code) id AS canonical_id, code
  FROM products
  WHERE code IS NOT NULL AND code != ''
  ORDER BY code, created_at ASC
),
dupe_product_ids AS (
  SELECT p.id AS dupe_id
  FROM products p
  JOIN canonical c ON c.code = p.code
  WHERE p.id != c.canonical_id
)
UPDATE operation_items oi
SET product_id = (
  SELECT c.canonical_id FROM canonical c
  JOIN products p ON p.code = c.code
  WHERE p.id = oi.product_id
  LIMIT 1
)
WHERE product_id IN (SELECT dupe_id FROM dupe_product_ids);

-- Step 4: Delete duplicate products (keep only canonical)
WITH canonical AS (
  SELECT DISTINCT ON (code) id AS canonical_id, code
  FROM products
  WHERE code IS NOT NULL AND code != ''
  ORDER BY code, created_at ASC
)
DELETE FROM products p
USING canonical c
WHERE p.code = c.code AND p.id != c.canonical_id;

-- Step 5: Add unique constraint on products.code
CREATE UNIQUE INDEX IF NOT EXISTS products_code_unique ON products (code) WHERE code IS NOT NULL AND code != '';

-- Step 6: Add unique constraint on combo_products
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'combo_products_combo_product_unique') THEN
    ALTER TABLE combo_products ADD CONSTRAINT combo_products_combo_product_unique UNIQUE (combo_id, product_id);
  END IF;
END $$;
