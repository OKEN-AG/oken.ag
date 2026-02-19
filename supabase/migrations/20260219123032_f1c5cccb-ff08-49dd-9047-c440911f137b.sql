
-- Fase A: Adicionar colunas para parametrizar valores hardcoded
ALTER TABLE commodity_pricing ADD COLUMN IF NOT EXISTS risk_free_rate NUMERIC DEFAULT 0.1175;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS default_freight_cost_per_km NUMERIC DEFAULT 0.11;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS block_ineligible BOOLEAN DEFAULT false;

-- Fase B: Tabela de portos com coordenadas
CREATE TABLE IF NOT EXISTS public.ports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  port_name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  latitude NUMERIC NOT NULL DEFAULT 0,
  longitude NUMERIC NOT NULL DEFAULT 0,
  is_global BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.ports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ports" ON public.ports FOR SELECT USING (true);
CREATE POLICY "Manage ports" ON public.ports FOR ALL USING (
  is_global = true AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  OR (campaign_id IS NOT NULL AND can_manage_campaign(campaign_id))
) WITH CHECK (
  is_global = true AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  OR (campaign_id IS NOT NULL AND can_manage_campaign(campaign_id))
);

-- Seed portos brasileiros padrão
INSERT INTO public.ports (port_name, state, latitude, longitude, is_global) VALUES
  ('Paranaguá', 'PR', -25.5163, -48.5225, true),
  ('Santarém', 'PA', -2.4426, -54.7080, true),
  ('Itaqui', 'MA', -2.5653, -44.3564, true),
  ('Ilhéus', 'BA', -14.7886, -39.0463, true),
  ('Santos', 'SP', -23.9608, -46.3336, true),
  ('Rio Grande', 'RS', -32.0478, -52.0989, true),
  ('Barcarena', 'PA', -1.5086, -48.6356, true);
