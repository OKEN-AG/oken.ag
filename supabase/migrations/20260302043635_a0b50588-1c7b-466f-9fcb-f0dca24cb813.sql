
-- grain_deliveries: tracks physical grain deliveries against operations
CREATE TABLE public.grain_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES public.operations(id),
  delivered_quantity numeric NOT NULL DEFAULT 0,
  expected_quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  quality_discount_pct numeric DEFAULT 0,
  delivery_location text DEFAULT '',
  commodity text DEFAULT 'soja',
  delivered_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text DEFAULT ''
);

ALTER TABLE public.grain_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own grain deliveries" ON public.grain_deliveries
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM operations WHERE operations.id = grain_deliveries.operation_id AND operations.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own grain deliveries" ON public.grain_deliveries
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM operations WHERE operations.id = grain_deliveries.operation_id AND operations.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own grain deliveries" ON public.grain_deliveries
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM operations WHERE operations.id = grain_deliveries.operation_id AND operations.user_id = auth.uid()
  ));

CREATE POLICY "Admins can view all grain deliveries" ON public.grain_deliveries
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- settlement_entries: financial reconciliation entries
CREATE TABLE public.settlement_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES public.operations(id),
  kind text NOT NULL DEFAULT 'grain_delivery',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  description text DEFAULT '',
  grain_delivery_id uuid REFERENCES public.grain_deliveries(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.settlement_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settlement entries" ON public.settlement_entries
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM operations WHERE operations.id = settlement_entries.operation_id AND operations.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own settlement entries" ON public.settlement_entries
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM operations WHERE operations.id = settlement_entries.operation_id AND operations.user_id = auth.uid()
  ));

CREATE POLICY "Admins can view all settlement entries" ON public.settlement_entries
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- monitoring_alert_rules: configurable alert thresholds
CREATE TABLE public.monitoring_alert_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id),
  name text NOT NULL,
  metric text NOT NULL DEFAULT 'collateral_coverage',
  operator text NOT NULL DEFAULT 'lt',
  threshold numeric NOT NULL DEFAULT 1.0,
  severity text NOT NULL DEFAULT 'medium',
  recipients text[] DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.monitoring_alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view alert rules" ON public.monitoring_alert_rules
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage alert rules" ON public.monitoring_alert_rules
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
