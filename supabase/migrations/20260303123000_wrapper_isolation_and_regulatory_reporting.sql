-- Wrapper isolation + regulatory reporting foundation
-- Covers: wrapper boundaries, per-tenant capabilities, reporting packs and mandatory regulatory event evidence.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wrapper_key') THEN
    CREATE TYPE public.wrapper_key AS ENUM ('w88', 'fundos', 'securitizacao', 'servicing');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regulatory_trail') THEN
    CREATE TYPE public.regulatory_trail AS ENUM (
      'plataforma_88',
      'fundos',
      'securitizacao',
      'servicing'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.wrapper_boundaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  wrapper public.wrapper_key NOT NULL,
  exposed_entities TEXT[] NOT NULL DEFAULT '{}',
  allowed_api_scopes TEXT[] NOT NULL DEFAULT '{}',
  reporting_obligations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wrapper)
);

CREATE INDEX IF NOT EXISTS wrapper_boundaries_tenant_wrapper_idx
  ON public.wrapper_boundaries (tenant_id, wrapper);

CREATE TABLE IF NOT EXISTS public.wrapper_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wrapper public.wrapper_key NOT NULL,
  capability_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_strategy TEXT NOT NULL DEFAULT 'manual',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(capability_key) <> ''),
  CHECK (enabled_at IS NULL OR disabled_at IS NULL OR enabled_at <= disabled_at),
  UNIQUE (tenant_id, wrapper, capability_key)
);

CREATE INDEX IF NOT EXISTS wrapper_capabilities_tenant_wrapper_idx
  ON public.wrapper_capabilities (tenant_id, wrapper, is_enabled);

CREATE TABLE IF NOT EXISTS public.wrapper_reporting_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  wrapper public.wrapper_key NOT NULL,
  package_code TEXT NOT NULL,
  package_name TEXT NOT NULL,
  regulator TEXT,
  periodicity TEXT,
  payload_schema_ref TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(package_code) <> ''),
  UNIQUE (tenant_id, wrapper, package_code)
);

CREATE INDEX IF NOT EXISTS wrapper_reporting_packages_tenant_wrapper_idx
  ON public.wrapper_reporting_packages (tenant_id, wrapper);

CREATE TABLE IF NOT EXISTS public.regulatory_event_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  trail public.regulatory_trail NOT NULL,
  wrapper public.wrapper_key NOT NULL,
  event_name TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  evidence_type public.evidence_type NOT NULL,
  evidence_due_rule TEXT,
  retention_days INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (event_version > 0),
  CHECK (retention_days IS NULL OR retention_days >= 0),
  CHECK (btrim(event_name) <> ''),
  UNIQUE (tenant_id, trail, wrapper, event_name, event_version, evidence_type)
);

CREATE INDEX IF NOT EXISTS regulatory_event_requirements_lookup_idx
  ON public.regulatory_event_requirements (tenant_id, trail, wrapper, event_name, event_version);

CREATE TABLE IF NOT EXISTS public.regulatory_event_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  requirement_id UUID NOT NULL REFERENCES public.regulatory_event_requirements(id) ON DELETE CASCADE,
  business_event_id UUID NOT NULL REFERENCES public.business_events(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES public.evidences(id) ON DELETE RESTRICT,
  evidence_status TEXT NOT NULL DEFAULT 'collected',
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(evidence_status) <> ''),
  UNIQUE (requirement_id, business_event_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS regulatory_event_evidences_tenant_idx
  ON public.regulatory_event_evidences (tenant_id, collected_at DESC);

ALTER TABLE public.wrapper_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrapper_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrapper_reporting_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_event_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_event_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view wrapper boundaries"
  ON public.wrapper_boundaries FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can manage wrapper boundaries"
  ON public.wrapper_boundaries FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can view wrapper capabilities"
  ON public.wrapper_capabilities FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can manage wrapper capabilities"
  ON public.wrapper_capabilities FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can view wrapper reporting packages"
  ON public.wrapper_reporting_packages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can manage wrapper reporting packages"
  ON public.wrapper_reporting_packages FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can view regulatory event requirements"
  ON public.regulatory_event_requirements FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can manage regulatory event requirements"
  ON public.regulatory_event_requirements FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can view regulatory event evidences"
  ON public.regulatory_event_evidences FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can manage regulatory event evidences"
  ON public.regulatory_event_evidences FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

-- Seed default reporting packages by wrapper.
INSERT INTO public.wrapper_reporting_packages (
  tenant_id,
  wrapper,
  package_code,
  package_name,
  regulator,
  periodicity,
  payload_schema_ref,
  is_mandatory,
  metadata
)
VALUES
  (NULL, 'w88', 'W88-MENSAL', 'Pacote regulatório Plataforma 88', 'BACEN/CVM', 'monthly', 'docs/schemas/reporting/w88-monthly.json', true, '{"scope":"default"}'::jsonb),
  (NULL, 'fundos', 'FUNDOS-MENSAL', 'Pacote regulatório de fundos', 'CVM', 'monthly', 'docs/schemas/reporting/fundos-monthly.json', true, '{"scope":"default"}'::jsonb),
  (NULL, 'securitizacao', 'SEC-MENSAL', 'Pacote regulatório de securitização', 'CVM/BACEN', 'monthly', 'docs/schemas/reporting/securitizacao-monthly.json', true, '{"scope":"default"}'::jsonb),
  (NULL, 'servicing', 'SERV-DIARIO', 'Pacote regulatório de servicing', 'BACEN', 'daily', 'docs/schemas/reporting/servicing-daily.json', true, '{"scope":"default"}'::jsonb)
ON CONFLICT (tenant_id, wrapper, package_code) DO UPDATE
SET
  package_name = EXCLUDED.package_name,
  regulator = EXCLUDED.regulator,
  periodicity = EXCLUDED.periodicity,
  payload_schema_ref = EXCLUDED.payload_schema_ref,
  is_mandatory = EXCLUDED.is_mandatory,
  metadata = EXCLUDED.metadata,
  updated_at = now();
