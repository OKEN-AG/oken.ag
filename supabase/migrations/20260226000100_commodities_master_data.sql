-- Commodities Master Data (global catalog for payment/barter modules)
CREATE TABLE IF NOT EXISTS public.commodities_master_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'saca',
  kg_per_unit NUMERIC,
  liters_per_unit NUMERIC,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_commodities_master_data_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commodities_master_data_updated_at ON public.commodities_master_data;
CREATE TRIGGER trg_commodities_master_data_updated_at
BEFORE UPDATE ON public.commodities_master_data
FOR EACH ROW EXECUTE FUNCTION public.set_commodities_master_data_updated_at();

ALTER TABLE public.commodities_master_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view commodities master data" ON public.commodities_master_data;
CREATE POLICY "Authenticated can view commodities master data"
ON public.commodities_master_data
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins and managers can manage commodities master data" ON public.commodities_master_data;
CREATE POLICY "Admins and managers can manage commodities master data"
ON public.commodities_master_data
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

INSERT INTO public.commodities_master_data (code, name, unit, kg_per_unit, active)
VALUES
  ('SOJA', 'Soja', 'saca', 60, true),
  ('MILHO', 'Milho', 'saca', 60, true),
  ('CAFE', 'Café', 'saca', 60, true),
  ('ALGODAO', 'Algodão', 'arroba', NULL, true)
ON CONFLICT (code) DO NOTHING;
