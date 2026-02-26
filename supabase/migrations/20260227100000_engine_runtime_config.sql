CREATE TABLE IF NOT EXISTS public.engine_runtime_config (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.engine_runtime_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view engine runtime config"
ON public.engine_runtime_config
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage engine runtime config"
ON public.engine_runtime_config
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.engine_runtime_config (key, value_json)
VALUES
  ('calculate_engine', jsonb_build_object(
    'calculationVersionDefault', 'v1',
    'minimumCommodityPrice', 0.01,
    'snapshotTypeInput', 'memory_input',
    'snapshotTypeDebt', 'memory_debt'
  ))
ON CONFLICT (key) DO NOTHING;
