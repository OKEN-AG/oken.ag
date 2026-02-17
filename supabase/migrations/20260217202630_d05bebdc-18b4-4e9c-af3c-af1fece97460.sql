
-- Add new columns to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS commodities text[] NOT NULL DEFAULT '{}';

-- Campaign client whitelist
CREATE TABLE IF NOT EXISTS campaign_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  document text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT ''
);
ALTER TABLE campaign_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage campaign_clients" ON campaign_clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Campaign payment methods
CREATE TABLE IF NOT EXISTS campaign_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  method_name text NOT NULL,
  markup_percent numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  annual_interest_rate numeric NOT NULL DEFAULT 0
);
ALTER TABLE campaign_payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage campaign_payment_methods" ON campaign_payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Campaign segments with price adjustment
CREATE TABLE IF NOT EXISTS campaign_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  segment_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  price_adjustment_percent numeric NOT NULL DEFAULT 0
);
ALTER TABLE campaign_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage campaign_segments" ON campaign_segments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Campaign due dates by region
CREATE TABLE IF NOT EXISTS campaign_due_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  region_type text NOT NULL DEFAULT 'estado',
  region_value text NOT NULL,
  due_date date NOT NULL
);
ALTER TABLE campaign_due_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage campaign_due_dates" ON campaign_due_dates FOR ALL TO authenticated USING (true) WITH CHECK (true);
