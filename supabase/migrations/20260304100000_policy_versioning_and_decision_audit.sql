-- Policy versioning with maker-checker publishing and decision audit trail

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'policy_lifecycle_status') THEN
    CREATE TYPE public.policy_lifecycle_status AS ENUM ('draft', 'published', 'archived');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'policy_approval_status') THEN
    CREATE TYPE public.policy_approval_status AS ENUM ('pending', 'approved', 'rejected', 'canceled');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  policy_key TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  lifecycle_status public.policy_lifecycle_status NOT NULL DEFAULT 'draft',
  precedence INTEGER NOT NULL DEFAULT 100,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  fallback_policy_version_id UUID REFERENCES public.policy_versions(id) ON DELETE SET NULL,
  policy_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT policy_versions_unique_version UNIQUE (tenant_id, policy_key, version_no),
  CONSTRAINT policy_versions_effective_window_ck CHECK (
    effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from
  )
);

CREATE INDEX IF NOT EXISTS policy_versions_resolution_idx
  ON public.policy_versions (tenant_id, policy_key, lifecycle_status, precedence, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS public.policy_publication_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  policy_version_id UUID NOT NULL REFERENCES public.policy_versions(id) ON DELETE CASCADE,
  maker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  checker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_status public.policy_approval_status NOT NULL DEFAULT 'pending',
  maker_notes TEXT,
  checker_notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT policy_publication_requests_maker_checker_ck CHECK (
    checker_user_id IS NULL OR maker_user_id <> checker_user_id
  )
);

CREATE INDEX IF NOT EXISTS policy_publication_requests_status_idx
  ON public.policy_publication_requests (tenant_id, approval_status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.policy_decision_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  domain_ref TEXT NOT NULL,
  domain_id UUID,
  policy_key TEXT NOT NULL,
  policy_version_id UUID REFERENCES public.policy_versions(id) ON DELETE SET NULL,
  policy_version_no INTEGER,
  applied_rule TEXT,
  decision_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT,
  snapshot_id UUID REFERENCES public.core_snapshots(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_decision_audit_domain_idx
  ON public.policy_decision_audit (tenant_id, domain_ref, domain_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.resolve_policy_version(
  p_policy_key TEXT,
  p_tenant_id UUID DEFAULT NULL,
  p_effective_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  policy_version_id UUID,
  policy_key TEXT,
  version_no INTEGER,
  precedence INTEGER,
  lifecycle_status public.policy_lifecycle_status,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  policy_payload JSONB,
  rationale TEXT,
  resolution_source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary public.policy_versions%ROWTYPE;
  v_fallback public.policy_versions%ROWTYPE;
BEGIN
  SELECT *
    INTO v_primary
  FROM public.policy_versions pv
  WHERE pv.policy_key = p_policy_key
    AND (pv.tenant_id = p_tenant_id OR (p_tenant_id IS NULL AND pv.tenant_id IS NULL))
    AND pv.lifecycle_status = 'published'
    AND (pv.effective_from IS NULL OR pv.effective_from <= p_effective_at)
    AND (pv.effective_to IS NULL OR pv.effective_to > p_effective_at)
  ORDER BY pv.precedence ASC, pv.effective_from DESC NULLS LAST, pv.version_no DESC
  LIMIT 1;

  IF v_primary.id IS NOT NULL THEN
    RETURN QUERY SELECT
      v_primary.id,
      v_primary.policy_key,
      v_primary.version_no,
      v_primary.precedence,
      v_primary.lifecycle_status,
      v_primary.effective_from,
      v_primary.effective_to,
      v_primary.policy_payload,
      v_primary.rationale,
      'published'::TEXT;
    RETURN;
  END IF;

  SELECT *
    INTO v_fallback
  FROM public.policy_versions pv
  WHERE pv.policy_key = p_policy_key
    AND (pv.tenant_id = p_tenant_id OR (p_tenant_id IS NULL AND pv.tenant_id IS NULL))
    AND pv.lifecycle_status IN ('published', 'archived')
  ORDER BY pv.precedence ASC, pv.version_no DESC
  LIMIT 1;

  IF v_fallback.id IS NOT NULL THEN
    RETURN QUERY SELECT
      v_fallback.id,
      v_fallback.policy_key,
      v_fallback.version_no,
      v_fallback.precedence,
      v_fallback.lifecycle_status,
      v_fallback.effective_from,
      v_fallback.effective_to,
      v_fallback.policy_payload,
      v_fallback.rationale,
      'fallback'::TEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_policy_publication(
  p_policy_version_id UUID,
  p_maker_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
  v_uid UUID := auth.uid();
  v_tenant UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.policy_versions WHERE id = p_policy_version_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Policy version not found';
  END IF;

  INSERT INTO public.policy_publication_requests (
    tenant_id,
    policy_version_id,
    maker_user_id,
    maker_notes
  ) VALUES (
    v_tenant,
    p_policy_version_id,
    v_uid,
    p_maker_notes
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_policy_publication(
  p_request_id UUID,
  p_approved BOOLEAN,
  p_checker_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req public.policy_publication_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_req
  FROM public.policy_publication_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Publication request not found';
  END IF;

  IF v_req.maker_user_id = v_uid THEN
    RAISE EXCEPTION 'Maker and checker must be different users';
  END IF;

  UPDATE public.policy_publication_requests
  SET
    checker_user_id = v_uid,
    checker_notes = p_checker_notes,
    approval_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    decided_at = now(),
    updated_at = now()
  WHERE id = p_request_id;

  IF p_approved THEN
    UPDATE public.policy_versions
    SET
      lifecycle_status = 'published',
      published_by = v_uid,
      published_at = now(),
      updated_at = now()
    WHERE id = v_req.policy_version_id;
  END IF;

  RETURN v_req.policy_version_id;
END;
$$;
