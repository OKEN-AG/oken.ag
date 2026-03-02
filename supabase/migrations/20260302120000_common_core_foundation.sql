-- Common Core Foundation (Phase 1)
-- Goal: introduce canonical entities + event backbone with legacy bridge.

-- 1) Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'party_type') THEN
    CREATE TYPE public.party_type AS ENUM (
      'individual',
      'company',
      'investor',
      'producer',
      'supplier',
      'buyer',
      'partner'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_type') THEN
    CREATE TYPE public.organization_type AS ENUM (
      'client',
      'creditor',
      'originator',
      'industry',
      'fund',
      'securitizer',
      'service_provider'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'program_status') THEN
    CREATE TYPE public.program_status AS ENUM ('draft', 'published', 'archived');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_status') THEN
    CREATE TYPE public.deal_status AS ENUM (
      'draft',
      'submitted',
      'approved',
      'formalized',
      'settled',
      'closed',
      'canceled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evidence_type') THEN
    CREATE TYPE public.evidence_type AS ENUM (
      'document',
      'signature',
      'oracle',
      'registry_protocol',
      'payment_proof',
      'hash_anchor'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE public.event_status AS ENUM ('pending', 'published', 'failed', 'dead_lettered');
  END IF;
END$$;

-- 2) Canonical entities
CREATE TABLE IF NOT EXISTS public.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  party_type public.party_type NOT NULL,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  tax_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS parties_tenant_tax_id_ux
  ON public.parties (tenant_id, tax_id)
  WHERE tax_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  organization_type public.organization_type NOT NULL,
  legal_name TEXT NOT NULL,
  tax_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_tenant_tax_id_ux
  ON public.organizations (tenant_id, tax_id)
  WHERE tax_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  code TEXT,
  name TEXT NOT NULL,
  status public.program_status NOT NULL DEFAULT 'draft',
  effective_from DATE,
  effective_to DATE,
  policy_version TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  legacy_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS programs_tenant_code_ux
  ON public.programs (tenant_id, code)
  WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  applicant_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  status public.deal_status NOT NULL DEFAULT 'draft',
  currency TEXT NOT NULL DEFAULT 'BRL',
  requested_amount NUMERIC(18,2),
  approved_amount NUMERIC(18,2),
  snapshot_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  legacy_operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deals_tenant_status_idx
  ON public.deals (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  evidence_type public.evidence_type NOT NULL,
  reference TEXT,
  hash_sha256 TEXT,
  storage_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidences_deal_created_idx
  ON public.evidences (deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.core_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  snapshot_type TEXT NOT NULL,
  domain_ref TEXT NOT NULL,
  domain_id UUID,
  payload JSONB NOT NULL,
  payload_hash TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS core_snapshots_domain_idx
  ON public.core_snapshots (domain_ref, domain_id, created_at DESC);

-- 3) Event backbone
CREATE TABLE IF NOT EXISTS public.business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  event_name TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  event_status public.event_status NOT NULL DEFAULT 'pending',
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID,
  correlation_id TEXT,
  idempotency_key TEXT,
  snapshot_id UUID REFERENCES public.core_snapshots(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_events_idempotency_ux
  ON public.business_events (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS business_events_aggregate_idx
  ON public.business_events (aggregate_type, aggregate_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_event_id UUID NOT NULL REFERENCES public.business_events(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  status public.event_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_event_id, destination)
);

CREATE INDEX IF NOT EXISTS event_outbox_status_retry_idx
  ON public.event_outbox (status, next_retry_at, created_at);

-- 4) Keep RLS posture consistent with existing project
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;
