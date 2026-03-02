-- Investor portal regulatory domain
CREATE TYPE public.investor_journey_state AS ENUM (
  'onboarding',
  'suitability_pending',
  'suitability_approved',
  'terms_pending',
  'terms_accepted',
  'order_pending',
  'order_submitted',
  'allocation_pending',
  'allocated',
  'statement_available',
  'distribution_pending',
  'distributed'
);

CREATE TYPE public.regulatory_wrapper_type AS ENUM (
  'platform_88',
  'asset_management_funds',
  'securitization'
);

CREATE TABLE IF NOT EXISTS public.investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  document_number TEXT NOT NULL,
  email TEXT,
  wrapper_type public.regulatory_wrapper_type NOT NULL DEFAULT 'platform_88',
  journey_state public.investor_journey_state NOT NULL DEFAULT 'onboarding',
  suitability_score NUMERIC(5,2),
  suitability_profile TEXT,
  terms_version TEXT,
  terms_accepted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_number)
);

CREATE TABLE IF NOT EXISTS public.investor_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  investor_id UUID NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
  journey_state public.investor_journey_state NOT NULL DEFAULT 'order_pending',
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  allocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  statement_reference TEXT,
  distribution_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.investor_event_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  investor_id UUID NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  investor_order_id UUID REFERENCES public.investor_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_state public.investor_journey_state,
  to_state public.investor_journey_state,
  wrapper_type public.regulatory_wrapper_type NOT NULL,
  actor_user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investors_tenant_state_idx ON public.investors (tenant_id, journey_state);
CREATE INDEX IF NOT EXISTS investor_orders_tenant_investor_idx ON public.investor_orders (tenant_id, investor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS investor_evidence_tenant_happened_idx ON public.investor_event_evidences (tenant_id, happened_at DESC);
CREATE INDEX IF NOT EXISTS investor_evidence_order_idx ON public.investor_event_evidences (investor_order_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_investors_touch_updated_at ON public.investors;
CREATE TRIGGER trg_investors_touch_updated_at
BEFORE UPDATE ON public.investors
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_investor_orders_touch_updated_at ON public.investor_orders;
CREATE TRIGGER trg_investor_orders_touch_updated_at
BEFORE UPDATE ON public.investor_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.register_investor_event(
  p_investor_id UUID,
  p_investor_order_id UUID,
  p_event_type TEXT,
  p_to_state public.investor_journey_state,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_wrapper public.regulatory_wrapper_type;
  v_from_state public.investor_journey_state;
  v_event_id UUID;
BEGIN
  SELECT tenant_id, wrapper_type, journey_state
    INTO v_tenant_id, v_wrapper, v_from_state
  FROM public.investors
  WHERE id = p_investor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investor % not found', p_investor_id;
  END IF;

  UPDATE public.investors
     SET journey_state = p_to_state
   WHERE id = p_investor_id;

  IF p_investor_order_id IS NOT NULL THEN
    UPDATE public.investor_orders
       SET journey_state = p_to_state
     WHERE id = p_investor_order_id;
  END IF;

  INSERT INTO public.investor_event_evidences (
    tenant_id,
    investor_id,
    investor_order_id,
    event_type,
    from_state,
    to_state,
    wrapper_type,
    actor_user_id,
    payload
  ) VALUES (
    v_tenant_id,
    p_investor_id,
    p_investor_order_id,
    p_event_type,
    v_from_state,
    p_to_state,
    v_wrapper,
    auth.uid(),
    p_payload
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_event_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can manage investors"
  ON public.investors FOR ALL TO authenticated
  USING (
    public.current_tenant_id() IS NULL
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.current_tenant_id() IS NULL
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant can manage investor orders"
  ON public.investor_orders FOR ALL TO authenticated
  USING (
    public.current_tenant_id() IS NULL
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.current_tenant_id() IS NULL
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant can view investor evidences"
  ON public.investor_event_evidences FOR SELECT TO authenticated
  USING (
    public.current_tenant_id() IS NULL
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Service can insert investor evidences"
  ON public.investor_event_evidences FOR INSERT TO authenticated
  WITH CHECK (true);
