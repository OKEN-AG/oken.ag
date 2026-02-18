
-- Add API configuration fields to commodity_pricing table
ALTER TABLE public.commodity_pricing
  ADD COLUMN IF NOT EXISTS ticker text DEFAULT '',
  ADD COLUMN IF NOT EXISTS ticker_b3 text DEFAULT '',
  ADD COLUMN IF NOT EXISTS api_source text DEFAULT 'yahoo',
  ADD COLUMN IF NOT EXISTS bushels_per_ton numeric DEFAULT 36.744,
  ADD COLUMN IF NOT EXISTS peso_saca_kg numeric DEFAULT 60,
  ADD COLUMN IF NOT EXISTS currency_unit text DEFAULT 'USc',
  ADD COLUMN IF NOT EXISTS unit_measure text DEFAULT 'bushel',
  ADD COLUMN IF NOT EXISTS market text DEFAULT 'CBOT';
