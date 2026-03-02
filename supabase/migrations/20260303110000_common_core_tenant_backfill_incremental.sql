-- Common Core tenant backfill incremental hardening (Phase 1.4)
-- Objetivo:
-- 1) Planejar e executar saneamento incremental por tabela canônica.
-- 2) Validar nulos/inconsistências por etapa.
-- 3) Aplicar NOT NULL em tenant_id apenas após saneamento concluído.

-- ---------------------------------------------------------------------------
-- 0) Funções utilitárias de validação/aplicação idempotente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_no_null_tenant(p_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count bigint;
BEGIN
  EXECUTE format('SELECT COUNT(*) FROM %s WHERE tenant_id IS NULL', p_table)
  INTO v_count;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Tabela % ainda possui % registro(s) com tenant_id NULL', p_table::text, v_count;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_tenant_not_null(p_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_nullable text;
BEGIN
  SELECT c.is_nullable
  INTO v_is_nullable
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = split_part(p_table::text, '.', 2)
    AND c.column_name = 'tenant_id';

  IF v_is_nullable = 'YES' THEN
    EXECUTE format('ALTER TABLE %s ALTER COLUMN tenant_id SET NOT NULL', p_table);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Backfill incremental por tabela (com validação ao fim de cada etapa)
-- ---------------------------------------------------------------------------

-- programs: tenant via organization
UPDATE public.programs p
SET tenant_id = o.tenant_id
FROM public.organizations o
WHERE p.tenant_id IS NULL
  AND p.organization_id = o.id
  AND o.tenant_id IS NOT NULL;

PERFORM public.assert_no_null_tenant('public.programs');

-- deals: tenant via program (preferencial) e party (fallback)
UPDATE public.deals d
SET tenant_id = p.tenant_id
FROM public.programs p
WHERE d.tenant_id IS NULL
  AND d.program_id = p.id
  AND p.tenant_id IS NOT NULL;

UPDATE public.deals d
SET tenant_id = pa.tenant_id
FROM public.parties pa
WHERE d.tenant_id IS NULL
  AND d.applicant_party_id = pa.id
  AND pa.tenant_id IS NOT NULL;

PERFORM public.assert_no_null_tenant('public.deals');

-- evidences: tenant via deal
UPDATE public.evidences e
SET tenant_id = d.tenant_id
FROM public.deals d
WHERE e.tenant_id IS NULL
  AND e.deal_id = d.id
  AND d.tenant_id IS NOT NULL;

PERFORM public.assert_no_null_tenant('public.evidences');

-- organizations: inferência unívoca via programs
WITH org_inference AS (
  SELECT
    p.organization_id AS org_id,
    MIN(p.tenant_id) AS inferred_tenant_id
  FROM public.programs p
  WHERE p.organization_id IS NOT NULL
    AND p.tenant_id IS NOT NULL
  GROUP BY p.organization_id
  HAVING COUNT(DISTINCT p.tenant_id) = 1
)
UPDATE public.organizations o
SET tenant_id = i.inferred_tenant_id
FROM org_inference i
WHERE o.id = i.org_id
  AND o.tenant_id IS NULL;

PERFORM public.assert_no_null_tenant('public.organizations');

-- parties: inferência unívoca via deals
WITH party_inference AS (
  SELECT
    d.applicant_party_id AS party_id,
    MIN(d.tenant_id) AS inferred_tenant_id
  FROM public.deals d
  WHERE d.applicant_party_id IS NOT NULL
    AND d.tenant_id IS NOT NULL
  GROUP BY d.applicant_party_id
  HAVING COUNT(DISTINCT d.tenant_id) = 1
)
UPDATE public.parties pa
SET tenant_id = i.inferred_tenant_id
FROM party_inference i
WHERE pa.id = i.party_id
  AND pa.tenant_id IS NULL;

PERFORM public.assert_no_null_tenant('public.parties');

-- core_snapshots: referências relacionais + payload/metadata
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

PERFORM public.assert_no_null_tenant('public.core_snapshots');

-- business_events: snapshot (preferencial) + aggregates (fallback)
UPDATE public.business_events be
SET tenant_id = cs.tenant_id
FROM public.core_snapshots cs
WHERE be.tenant_id IS NULL
  AND be.snapshot_id = cs.id
  AND cs.tenant_id IS NOT NULL;

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

PERFORM public.assert_no_null_tenant('public.business_events');

-- ---------------------------------------------------------------------------
-- 2) Sanidade de inconsistências cross-table após backfill
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_inconsistent_deals bigint;
  v_inconsistent_evidences bigint;
  v_inconsistent_events bigint;
BEGIN
  SELECT COUNT(*) INTO v_inconsistent_deals
  FROM public.deals d
  JOIN public.programs p ON p.id = d.program_id
  WHERE d.program_id IS NOT NULL
    AND d.tenant_id <> p.tenant_id;

  SELECT COUNT(*) INTO v_inconsistent_evidences
  FROM public.evidences e
  JOIN public.deals d ON d.id = e.deal_id
  WHERE e.deal_id IS NOT NULL
    AND e.tenant_id <> d.tenant_id;

  SELECT COUNT(*) INTO v_inconsistent_events
  FROM public.business_events be
  JOIN public.core_snapshots cs ON cs.id = be.snapshot_id
  WHERE be.snapshot_id IS NOT NULL
    AND be.tenant_id <> cs.tenant_id;

  IF v_inconsistent_deals > 0
    OR v_inconsistent_evidences > 0
    OR v_inconsistent_events > 0
  THEN
    RAISE EXCEPTION
      'Inconsistências de tenant detectadas (deals/programs=% , evidences/deals=% , events/snapshots=%). Corrija antes de aplicar NOT NULL.',
      v_inconsistent_deals,
      v_inconsistent_evidences,
      v_inconsistent_events;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Enforce NOT NULL (idempotente)
-- ---------------------------------------------------------------------------
PERFORM public.ensure_tenant_not_null('public.parties');
PERFORM public.ensure_tenant_not_null('public.organizations');
PERFORM public.ensure_tenant_not_null('public.programs');
PERFORM public.ensure_tenant_not_null('public.deals');
PERFORM public.ensure_tenant_not_null('public.evidences');
PERFORM public.ensure_tenant_not_null('public.core_snapshots');
PERFORM public.ensure_tenant_not_null('public.business_events');

-- Cleanup utilitários de migração
DROP FUNCTION public.ensure_tenant_not_null(regclass);
DROP FUNCTION public.assert_no_null_tenant(regclass);
