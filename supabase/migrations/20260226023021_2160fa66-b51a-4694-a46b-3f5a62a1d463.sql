
-- Create commodities_master_data table for global commodity catalog
CREATE TABLE public.commodities_master_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'saca',
  kg_per_unit NUMERIC NULL,
  liters_per_unit NUMERIC NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.commodities_master_data ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated can view commodities master data"
  ON public.commodities_master_data FOR SELECT
  USING (true);

-- Only admins/managers can manage
CREATE POLICY "Admins can manage commodities master data"
  ON public.commodities_master_data FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Seed common commodities
INSERT INTO public.commodities_master_data (code, name, unit, kg_per_unit) VALUES
  ('SOJA', 'Soja', 'saca', 60),
  ('MILHO', 'Milho', 'saca', 60),
  ('CAFE', 'Café', 'saca', 60),
  ('ALGODAO', 'Algodão', 'arroba', 15);
