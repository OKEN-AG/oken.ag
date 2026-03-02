-- Campaign policy sets with domain separation, precedence resolver and immutable published versions

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'policy_set_status') THEN
    CREATE TYPE public.policy_set_status AS ENUM ('draft', 'published', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.policy_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  campaign_id UUID NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN (
    'product_price_policy',
    'commodity_pricing_policy',
    'freight_policy',
    'incentive_policy',
    'due_date_policy'
  )),
  version INTEGER NOT NULL CHECK (version > 0),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ NULL,
  status public.policy_set_status NOT NULL DEFAULT 'draft',
  is_tenant_override BOOLEAN NOT NULL DEFAULT FALSE,
  is_global_default BOOLEAN NOT NULL DEFAULT FALSE,
  policy_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID NULL,
  published_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  CONSTRAINT policy_sets_window_ck CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT policy_sets_scope_ck CHECK (
    NOT (campaign_id IS NOT NULL AND is_global_default)
  ),
  CONSTRAINT policy_sets_unique_version UNIQUE (tenant_id, campaign_id, domain, version)
);

CREATE INDEX IF NOT EXISTS idx_policy_sets_resolution
  ON public.policy_sets (domain, status, tenant_id, campaign_id, is_tenant_override, is_global_default, valid_from DESC, version DESC);

CREATE OR REPLACE FUNCTION public.touch_policy_sets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_policy_sets_updated_at ON public.policy_sets;
CREATE TRIGGER trg_touch_policy_sets_updated_at
BEFORE UPDATE ON public.policy_sets
FOR EACH ROW EXECUTE FUNCTION public.touch_policy_sets_updated_at();

CREATE OR REPLACE FUNCTION public.block_published_policy_set_retroactive_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF (
      NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
      NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR
      NEW.domain IS DISTINCT FROM OLD.domain OR
      NEW.version IS DISTINCT FROM OLD.version OR
      NEW.valid_from IS DISTINCT FROM OLD.valid_from OR
      NEW.valid_to IS DISTINCT FROM OLD.valid_to OR
      NEW.policy_payload IS DISTINCT FROM OLD.policy_payload OR
      NEW.is_tenant_override IS DISTINCT FROM OLD.is_tenant_override OR
      NEW.is_global_default IS DISTINCT FROM OLD.is_global_default
    ) THEN
      RAISE EXCEPTION 'Published policy_set is immutable. Create a new version instead.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_published_policy_set_retroactive_update ON public.policy_sets;
CREATE TRIGGER trg_block_published_policy_set_retroactive_update
BEFORE UPDATE ON public.policy_sets
FOR EACH ROW EXECUTE FUNCTION public.block_published_policy_set_retroactive_update();

CREATE OR REPLACE FUNCTION public.resolve_policy_set(
  p_domain TEXT,
  p_tenant_id UUID DEFAULT NULL,
  p_campaign_id UUID DEFAULT NULL,
  p_effective_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  policy_set_id UUID,
  domain TEXT,
  version INTEGER,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  status public.policy_set_status,
  tenant_id UUID,
  campaign_id UUID,
  policy_payload JSONB,
  resolution_source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      ps.*,
      CASE
        WHEN p_tenant_id IS NOT NULL
          AND ps.tenant_id = p_tenant_id
          AND ps.is_tenant_override = TRUE
          THEN 1
        WHEN p_campaign_id IS NOT NULL
          AND ps.campaign_id = p_campaign_id
          THEN 2
        WHEN ps.tenant_id IS NULL
          AND ps.campaign_id IS NULL
          AND ps.is_global_default = TRUE
          THEN 3
        ELSE 99
      END AS precedence_order
    FROM public.policy_sets ps
    WHERE ps.domain = p_domain
      AND ps.status = 'published'
      AND (ps.valid_from IS NULL OR ps.valid_from <= p_effective_at)
      AND (ps.valid_to IS NULL OR ps.valid_to > p_effective_at)
  )
  SELECT
    c.id,
    c.domain,
    c.version,
    c.valid_from,
    c.valid_to,
    c.status,
    c.tenant_id,
    c.campaign_id,
    c.policy_payload,
    CASE c.precedence_order
      WHEN 1 THEN 'tenant_override'
      WHEN 2 THEN 'campaign'
      WHEN 3 THEN 'global_default'
      ELSE 'none'
    END AS resolution_source
  FROM candidates c
  WHERE c.precedence_order < 99
  ORDER BY c.precedence_order ASC, c.valid_from DESC NULLS LAST, c.version DESC
  LIMIT 1;
END;
$$;
