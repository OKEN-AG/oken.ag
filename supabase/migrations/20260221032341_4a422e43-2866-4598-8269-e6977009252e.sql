-- Step 1: Remove duplicate campaign_products, keeping only the first inserted row per (campaign_id, product_id)
DELETE FROM campaign_products
WHERE id NOT IN (
  SELECT DISTINCT ON (campaign_id, product_id) id
  FROM campaign_products
  ORDER BY campaign_id, product_id, created_at ASC
);

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE campaign_products
ADD CONSTRAINT campaign_products_campaign_product_unique UNIQUE (campaign_id, product_id);