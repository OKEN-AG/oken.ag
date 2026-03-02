-- Wrapper operationalization (Phase 1.3)
-- Goal: turn wrappers into enforceable product boundaries while keeping Common Core neutral.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wrapper_code') THEN
    CREATE TYPE public.wrapper_code AS ENUM (
      'oken_tech_servicing',
      'platform_88',
      'gestao',
      'okensec'
    );
  END IF;
END$$;

-- 1) Technical boundary catalog for wrappers
CREATE TABLE IF NOT EXISTS public.wrapper_boundaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wrapper public.wrapper_code NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  technical_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.wrapper_boundaries (wrapper, display_name, technical_scope)
VALUES
  (
    'oken_tech_servicing',
    'Oken Tech/Servicing',
    jsonb_build_object(
      'contexts', jsonb_build_array('common_core', 'case_management', 'financial_reconciliation', 'servicing'),
      'description', 'Operação ponta a ponta e servicing de contratos, sem regra regulatória acoplada ao core.'
    )
  ),
  (
    'platform_88',
    'Platform 88',
    jsonb_build_object(
      'contexts', jsonb_build_array('origination', 'partner_distribution', 'structured_products'),
      'description', 'Distribuição estruturada e jornada 88 segregada por capacidades específicas do wrapper.'
    )
  ),
  (
    'gestao',
    'Gestão',
    jsonb_build_object(
      'contexts', jsonb_build_array('fund_management', 'portfolio_controls', 'investor_reporting'),
      'description', 'Gestão/fundos com trilha e obrigações regulatórias dedicadas.'
    )
  ),
  (
    'okensec',
    'OkenSec',
    jsonb_build_object(
      'contexts', jsonb_build_array('securitization', 'trustee_flows', 'regulatory_reporting'),
      'description', 'Securitização e compliance regulatório segregado do Common Core.'
    )
  )
ON CONFLICT (wrapper) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  technical_scope = EXCLUDED.technical_scope,
  updated_at = now();

-- 2) Capabilities by wrapper + tenant
CREATE TABLE IF NOT EXISTS public.tenant_wrapper_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wrapper public.wrapper_code NOT NULL,
  capability_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wrapper, capability_key)
);

CREATE INDEX IF NOT EXISTS tenant_wrapper_capabilities_lookup_idx
  ON public.tenant_wrapper_capabilities (tenant_id, wrapper, capability_key);

CREATE OR REPLACE FUNCTION public.current_wrapper()
RETURNS public.wrapper_code
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim TEXT;
BEGIN
  v_claim := auth.jwt() ->> 'wrapper';

  IF v_claim IS NULL OR btrim(v_claim) = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_claim::public.wrapper_code;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_wrapper_capability_enabled(
  p_tenant_id UUID,
  p_wrapper public.wrapper_code,
  p_capability_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_wrapper_capabilities twc
    WHERE twc.tenant_id = p_tenant_id
      AND twc.wrapper = p_wrapper
      AND twc.capability_key = p_capability_key
      AND twc.is_enabled = true
  );
$$;

-- 3) Wrapper-segregated reports, audit trails and regulatory obligations
CREATE TABLE IF NOT EXISTS public.wrapper_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wrapper public.wrapper_code NOT NULL,
  report_type TEXT NOT NULL,
  report_ref TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wrapper, report_type, report_ref)
);

CREATE TABLE IF NOT EXISTS public.wrapper_audit_trails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wrapper public.wrapper_code NOT NULL,
  trail_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wrapper_audit_trails_tenant_wrapper_created_idx
  ON public.wrapper_audit_trails (tenant_id, wrapper, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wrapper_regulatory_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wrapper public.wrapper_code NOT NULL,
  obligation_code TEXT NOT NULL,
  title TEXT NOT NULL,
  jurisdiction TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wrapper, obligation_code)
);

-- 4) Wrapper-scoped regulatory rules (core remains neutral)
CREATE TABLE IF NOT EXISTS public.wrapper_regulatory_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wrapper public.wrapper_code NOT NULL,
  rule_code TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  enforcement_mode TEXT NOT NULL DEFAULT 'blocking',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wrapper, rule_code, rule_version)
);

COMMENT ON TABLE public.wrapper_regulatory_rules IS
  'Regras regulatórias aplicáveis exclusivamente por wrapper/tenant. O Common Core permanece sem semântica regulatória hardcoded.';

ALTER TABLE public.wrapper_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_wrapper_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrapper_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrapper_audit_trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrapper_regulatory_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrapper_regulatory_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users can view wrapper_boundaries" ON public.wrapper_boundaries;
CREATE POLICY "Tenant users can view wrapper_boundaries"
  ON public.wrapper_boundaries FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage wrapper_boundaries" ON public.wrapper_boundaries;
CREATE POLICY "Admins can manage wrapper_boundaries"
  ON public.wrapper_boundaries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Tenant users can view tenant_wrapper_capabilities" ON public.tenant_wrapper_capabilities;
CREATE POLICY "Tenant users can view tenant_wrapper_capabilities"
  ON public.tenant_wrapper_capabilities FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND (public.current_wrapper() IS NULL OR wrapper = public.current_wrapper())
    )
  );

DROP POLICY IF EXISTS "Tenant users can manage tenant_wrapper_capabilities" ON public.tenant_wrapper_capabilities;
CREATE POLICY "Tenant users can manage tenant_wrapper_capabilities"
  ON public.tenant_wrapper_capabilities FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  );

DROP POLICY IF EXISTS "Tenant users can access wrapper_reports" ON public.wrapper_reports;
CREATE POLICY "Tenant users can access wrapper_reports"
  ON public.wrapper_reports FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  );

DROP POLICY IF EXISTS "Tenant users can access wrapper_audit_trails" ON public.wrapper_audit_trails;
CREATE POLICY "Tenant users can access wrapper_audit_trails"
  ON public.wrapper_audit_trails FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  );

DROP POLICY IF EXISTS "Tenant users can access wrapper_regulatory_obligations" ON public.wrapper_regulatory_obligations;
CREATE POLICY "Tenant users can access wrapper_regulatory_obligations"
  ON public.wrapper_regulatory_obligations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  );

DROP POLICY IF EXISTS "Tenant users can access wrapper_regulatory_rules" ON public.wrapper_regulatory_rules;
CREATE POLICY "Tenant users can access wrapper_regulatory_rules"
  ON public.wrapper_regulatory_rules FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      tenant_id = public.current_tenant_id()
      AND wrapper = public.current_wrapper()
    )
  );
