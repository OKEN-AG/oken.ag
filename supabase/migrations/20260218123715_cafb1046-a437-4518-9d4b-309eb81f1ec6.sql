
-- Add new columns to campaigns table
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS code_custom text DEFAULT '',
  ADD COLUMN IF NOT EXISTS code_auto text DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS division text DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS billing_deadline date,
  ADD COLUMN IF NOT EXISTS campaign_type text DEFAULT 'vendas',
  ADD COLUMN IF NOT EXISTS campaign_subtype text DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_type text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS min_order_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_start_date date,
  ADD COLUMN IF NOT EXISTS delivery_end_date date,
  ADD COLUMN IF NOT EXISTS price_types text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accepted_counterparties text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS early_discount_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS global_incentive_type text DEFAULT 'desconto_direto',
  ADD COLUMN IF NOT EXISTS global_incentive_1 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_incentive_2 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_incentive_3 numeric DEFAULT 0;

-- Update campaign_target enum to include new values
ALTER TYPE public.campaign_target ADD VALUE IF NOT EXISTS 'venda_direta_consumidor';
ALTER TYPE public.campaign_target ADD VALUE IF NOT EXISTS 'venda_canal_distribuicao';
ALTER TYPE public.campaign_target ADD VALUE IF NOT EXISTS 'venda_indireta_consumidor';

-- Auto-generate campaign code
CREATE OR REPLACE FUNCTION public.generate_campaign_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.code_auto := 'CMP-' || LPAD(NEXTVAL('campaign_code_seq')::text, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE SEQUENCE IF NOT EXISTS public.campaign_code_seq START 1;

CREATE OR REPLACE TRIGGER trg_campaign_code
  BEFORE INSERT ON public.campaigns
  FOR EACH ROW
  WHEN (NEW.code_auto IS NULL OR NEW.code_auto = '')
  EXECUTE FUNCTION public.generate_campaign_code();

-- Commodity valorization table
CREATE TABLE IF NOT EXISTS public.campaign_commodity_valorizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  commodity text NOT NULL,
  nominal_value numeric DEFAULT 0,
  percent_value numeric DEFAULT 0,
  use_percent boolean DEFAULT false
);
ALTER TABLE public.campaign_commodity_valorizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage campaign_commodity_valorizations" ON public.campaign_commodity_valorizations FOR ALL USING (true) WITH CHECK (true);

-- Pre-registered buyers
CREATE TABLE IF NOT EXISTS public.campaign_buyers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  buyer_name text NOT NULL DEFAULT '',
  fee numeric DEFAULT 0
);
ALTER TABLE public.campaign_buyers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage campaign_buyers" ON public.campaign_buyers FOR ALL USING (true) WITH CHECK (true);

-- Delivery locations (warehouses)
CREATE TABLE IF NOT EXISTS public.campaign_delivery_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  cda text DEFAULT '',
  warehouse_name text NOT NULL DEFAULT '',
  address text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  location_type text DEFAULT '',
  capacity_tons numeric DEFAULT 0,
  latitude numeric DEFAULT 0,
  longitude numeric DEFAULT 0
);
ALTER TABLE public.campaign_delivery_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage campaign_delivery_locations" ON public.campaign_delivery_locations FOR ALL USING (true) WITH CHECK (true);

-- Indicative prices
CREATE TABLE IF NOT EXISTS public.campaign_indicative_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  culture text DEFAULT '',
  price_type text DEFAULT '',
  month text DEFAULT '',
  state text DEFAULT '',
  market_place text DEFAULT '',
  price_per_saca numeric DEFAULT 0,
  variation_percent numeric DEFAULT 0,
  direction text DEFAULT '',
  updated_at date,
  tax_rate numeric DEFAULT 0
);
ALTER TABLE public.campaign_indicative_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage campaign_indicative_prices" ON public.campaign_indicative_prices FOR ALL USING (true) WITH CHECK (true);
