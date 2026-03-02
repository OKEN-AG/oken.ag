-- Common Core tenant hardening (Phase 1.3)
-- 1) Backfill tenant_id in canonical tables
-- 2) Enforce tenant_id NOT NULL
-- 3) Harden current_tenant_id() privileges and execution context

-- ---------------------------------------------------------------------------
-- 1) Backfill helpers from relational provenance
-- ---------------------------------------------------------------------------

-- programs <- organizations
UPDATE public.programs p
SET tenant_id = o.tenant_id
FROM public.organizations o
WHERE p.tenant_id IS NULL
  AND p.organization_id = o.id
  AND o.tenant_id IS NOT NULL;

-- deals <- programs (preferred)
UPDATE public.deals d
SET tenant_id = p.tenant_id
FROM public.programs p
WHERE d.tenant_id IS NULL
  AND d.program_id = p.id
  AND p.tenant_id IS NOT NULL;

-- deals <- applicant party (fallback)
UPDATE public.deals d
SET tenant_id = pa.tenant_id
FROM public.parties pa
WHERE d.tenant_id IS NULL
  AND d.applicant_party_id = pa.id
  AND pa.tenant_id IS NOT NULL;

-- evidences <- deals
UPDATE public.evidences e
SET tenant_id = d.tenant_id
FROM public.deals d
WHERE e.tenant_id IS NULL
  AND e.deal_id = d.id
  AND d.tenant_id IS NOT NULL;

-- core_snapshots <- known aggregate/domain references
UPDATE public.core_snapshots cs
SET tenant_id = d.tenant_id
FROM public.deals d
WHERE cs.tenant_id IS NULL
  AND cs.domain_id = d.id
  AND lower(cs.domain_ref) IN ('deal', 'deals')
  AND d.tenant_id IS NOT NULL;

UPDATE public.core_snapshots cs
SET tenant_id = p.tenant_id
FROM public.programs p
WHERE cs.tenant_id IS NULL
  AND cs.domain_id = p.id
  AND lower(cs.domain_ref) IN ('program', 'programs')
  AND p.tenant_id IS NOT NULL;

UPDATE public.core_snapshots cs
SET tenant_id = o.tenant_id
FROM public.organizations o
WHERE cs.tenant_id IS NULL
  AND cs.domain_id = o.id
  AND lower(cs.domain_ref) IN ('organization', 'organizations')
  AND o.tenant_id IS NOT NULL;

UPDATE public.core_snapshots cs
SET tenant_id = pa.tenant_id
FROM public.parties pa
WHERE cs.tenant_id IS NULL
  AND cs.domain_id = pa.id
  AND lower(cs.domain_ref) IN ('party', 'parties')
  AND pa.tenant_id IS NOT NULL;

-- core_snapshots <- payload/metadata tenant_id as UUID text
UPDATE public.core_snapshots
SET tenant_id = NULLIF(payload ->> 'tenant_id', '')::uuid
WHERE tenant_id IS NULL
  AND (payload ? 'tenant_id')
  AND (payload ->> 'tenant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.core_snapshots
SET tenant_id = NULLIF(metadata ->> 'tenant_id', '')::uuid
WHERE tenant_id IS NULL
  AND (metadata ? 'tenant_id')
  AND (metadata ->> 'tenant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- business_events <- snapshots (preferred)
UPDATE public.business_events be
SET tenant_id = cs.tenant_id
FROM public.core_snapshots cs
WHERE be.tenant_id IS NULL
  AND be.snapshot_id = cs.id
  AND cs.tenant_id IS NOT NULL;

-- business_events <- deal/program aggregates (fallback)
UPDATE public.business_events be
SET tenant_id = d.tenant_id
FROM public.deals d
WHERE be.tenant_id IS NULL
  AND be.aggregate_id = d.id
  AND lower(be.aggregate_type) IN ('deal', 'deals')
  AND d.tenant_id IS NOT NULL;

UPDATE public.business_events be
SET tenant_id = p.tenant_id
FROM public.programs p
WHERE be.tenant_id IS NULL
  AND be.aggregate_id = p.id
  AND lower(be.aggregate_type) IN ('program', 'programs')
  AND p.tenant_id IS NOT NULL;

-- organizations <- programs when unambiguous
WITH org_inference AS (
  SELECT p.organization_id AS org_id, MIN(p.tenant_id) AS tenant_id
  FROM public.programs p
  WHERE p.organization_id IS NOT NULL
    AND p.tenant_id IS NOT NULL
  GROUP BY p.organization_id
  HAVING COUNT(DISTINCT p.tenant_id) = 1
)
UPDATE public.organizations o
SET tenant_id = i.tenant_id
FROM org_inference i
WHERE o.id = i.org_id
  AND o.tenant_id IS NULL;

-- parties <- deals when unambiguous
WITH party_inference AS (
  SELECT d.applicant_party_id AS party_id, MIN(d.tenant_id) AS tenant_id
  FROM public.deals d
  WHERE d.applicant_party_id IS NOT NULL
    AND d.tenant_id IS NOT NULL
  GROUP BY d.applicant_party_id
  HAVING COUNT(DISTINCT d.tenant_id) = 1
)
UPDATE public.parties pa
SET tenant_id = i.tenant_id
FROM party_inference i
WHERE pa.id = i.party_id
  AND pa.tenant_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Validate unresolved rows and enforce NOT NULL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing JSONB;
BEGIN
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'parties', (SELECT COUNT(*) FROM public.parties WHERE tenant_id IS NULL),
      'organizations', (SELECT COUNT(*) FROM public.organizations WHERE tenant_id IS NULL),
      'programs', (SELECT COUNT(*) FROM public.programs WHERE tenant_id IS NULL),
      'deals', (SELECT COUNT(*) FROM public.deals WHERE tenant_id IS NULL),
      'evidences', (SELECT COUNT(*) FROM public.evidences WHERE tenant_id IS NULL),
      'core_snapshots', (SELECT COUNT(*) FROM public.core_snapshots WHERE tenant_id IS NULL),
      'business_events', (SELECT COUNT(*) FROM public.business_events WHERE tenant_id IS NULL)
    )
  ) INTO v_missing;

  IF (v_missing ->> 'parties')::int > 0
    OR (v_missing ->> 'organizations')::int > 0
    OR (v_missing ->> 'programs')::int > 0
    OR (v_missing ->> 'deals')::int > 0
    OR (v_missing ->> 'evidences')::int > 0
    OR (v_missing ->> 'core_snapshots')::int > 0
    OR (v_missing ->> 'business_events')::int > 0
  THEN
    RAISE EXCEPTION
      'Backfill de tenant_id incompleto. Corrija os registros órfãos antes do NOT NULL. Detalhes: %',
      v_missing;
  END IF;
END$$;

ALTER TABLE public.parties ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.organizations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.programs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.deals ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.evidences ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.core_snapshots ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.business_events ALTER COLUMN tenant_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Harden current_tenant_id() and its privileges
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim TEXT;
BEGIN
  v_claim := auth.jwt() ->> 'tenant_id';
  IF v_claim IS NULL OR btrim(v_claim) = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_claim::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO service_role;
