-- Investor module foundation: domain tables, suitability, regulatory acceptance and compliance evidence.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regulatory_wrapper') THEN
    CREATE TYPE public.regulatory_wrapper AS ENUM ('platform_88', 'fund_management', 'securitization');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'investor_status') THEN
    CREATE TYPE public.investor_status AS ENUM ('prospect', 'onboarding', 'active', 'suspended', 'offboarded');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'investor_order_status') THEN
    CREATE TYPE public.investor_order_status AS ENUM ('draft', 'submitted', 'allocated', 'partially_settled', 'settled', 'canceled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suitability_risk_profile') THEN
    CREATE TYPE public.suitability_risk_profile AS ENUM ('conservative', 'moderate', 'sophisticated', 'professional');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suitability_outcome') THEN
    CREATE TYPE public.suitability_outcome AS ENUM ('approved', 'restricted', 'rejected');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regulatory_document_type') THEN
    CREATE TYPE public.regulatory_document_type AS ENUM ('term', 'risk_disclosure', 'privacy_policy', 'offer_memorandum');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'investor_compliance_evidence_type') THEN
    CREATE TYPE public.investor_compliance_evidence_type AS ENUM ('kyc', 'kyb', 'suitability', 'risk', 'regulatory_acceptance');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  wrapper public.regulatory_wrapper NOT NULL,
  status public.investor_status NOT NULL DEFAULT 'prospect',
  onboarding_completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, party_id, wrapper)
);

CREATE INDEX IF NOT EXISTS investors_tenant_wrapper_status_idx
  ON public.investors (tenant_id, wrapper, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.investor_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  investor_id UUID NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  offer_id UUID,
  status public.investor_order_status NOT NULL DEFAULT 'draft',
  amount NUMERIC(18,2) NOT NULL,
  allocated_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  settled_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount >= 0),
  CHECK (allocated_amount >= 0),
  CHECK (settled_amount >= 0)
);

CREATE INDEX IF NOT EXISTS investor_orders_tenant_status_idx
  ON public.investor_orders (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.investor_suitability_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  investor_id UUID NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  questionnaire_version TEXT NOT NULL,
  risk_profile public.suitability_risk_profile NOT NULL,
  outcome public.suitability_outcome NOT NULL,
  score NUMERIC(8,2) NOT NULL,
  restrictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investor_suitability_profiles_investor_assessed_idx
  ON public.investor_suitability_profiles (investor_id, assessed_at DESC);

CREATE TABLE IF NOT EXISTS public.investor_regulatory_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  investor_id UUID NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  wrapper public.regulatory_wrapper NOT NULL,
  document_type public.regulatory_document_type NOT NULL,
  document_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investor_regulatory_acceptances_investor_idx
  ON public.investor_regulatory_acceptances (investor_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS public.investor_event_compliance_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  business_event_id UUID NOT NULL REFERENCES public.business_events(id) ON DELETE CASCADE,
  investor_id UUID REFERENCES public.investors(id) ON DELETE SET NULL,
  investor_order_id UUID REFERENCES public.investor_orders(id) ON DELETE SET NULL,
  evidence_type public.investor_compliance_evidence_type NOT NULL,
  provider TEXT NOT NULL,
  reference TEXT,
  hash_sha256 TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (investor_id IS NOT NULL OR investor_order_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS investor_event_compliance_evidences_event_idx
  ON public.investor_event_compliance_evidences (business_event_id, created_at DESC);

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_suitability_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_regulatory_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_event_compliance_evidences ENABLE ROW LEVEL SECURITY;
