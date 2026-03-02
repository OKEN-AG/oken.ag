-- Unified backend policy resolution layer

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'policy_version_status') THEN
    CREATE TYPE public.policy_version_status AS ENUM ('draft', 'published', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  policy_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  status public.policy_version_status NOT NULL DEFAULT 'draft',
  precedence INTEGER NOT NULL DEFAULT 100,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ NULL,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID NULL,
  published_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  UNIQUE (tenant_id, policy_key, version)
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_lookup
  ON public.policy_versions (tenant_id, policy_key, status, precedence, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.policy_approval_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.policy_versions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'published', 'archived')),
  actor_id UUID NULL DEFAULT auth.uid(),
  notes TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_approval_trail_policy
  ON public.policy_approval_trail (policy_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.policy_decision_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  policy_key TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  operation_id UUID NULL,
  policy_id UUID NULL REFERENCES public.policy_versions(id),
  policy_version INTEGER NULL,
  resolved_policy JSONB NOT NULL,
  input_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_decision_snapshots_lookup
  ON public.policy_decision_snapshots (tenant_id, decision_type, policy_key, created_at DESC);

ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_approval_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_decision_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "policy_versions_auth_read" ON public.policy_versions;
CREATE POLICY "policy_versions_auth_read"
  ON public.policy_versions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "policy_versions_auth_write" ON public.policy_versions;
CREATE POLICY "policy_versions_auth_write"
  ON public.policy_versions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "policy_approval_trail_auth" ON public.policy_approval_trail;
CREATE POLICY "policy_approval_trail_auth"
  ON public.policy_approval_trail
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "policy_decision_snapshots_auth" ON public.policy_decision_snapshots;
CREATE POLICY "policy_decision_snapshots_auth"
  ON public.policy_decision_snapshots
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_policy_versions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_policy_versions_updated_at ON public.policy_versions;
CREATE TRIGGER trg_touch_policy_versions_updated_at
BEFORE UPDATE ON public.policy_versions
FOR EACH ROW EXECUTE FUNCTION public.touch_policy_versions_updated_at();

CREATE OR REPLACE FUNCTION public.policy_context_matches(p_context JSONB, p_when JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  kv RECORD;
BEGIN
  IF p_when IS NULL OR jsonb_typeof(p_when) <> 'object' THEN
    RETURN TRUE;
  END IF;

  FOR kv IN SELECT key, value FROM jsonb_each(p_when)
  LOOP
    IF COALESCE(p_context ->> kv.key, '') <> COALESCE(trim(both '"' FROM kv.value::text), '') THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.policy_submit_for_approval(p_policy_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS public.policy_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy public.policy_versions;
BEGIN
  SELECT * INTO v_policy FROM public.policy_versions WHERE id = p_policy_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Policy % not found', p_policy_id;
  END IF;

  IF v_policy.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft policies can be submitted for approval';
  END IF;

  INSERT INTO public.policy_approval_trail (policy_id, action, notes)
  VALUES (v_policy.id, 'submitted', p_notes);

  RETURN v_policy;
END;
$$;

CREATE OR REPLACE FUNCTION public.policy_approve_and_publish(
  p_policy_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_effective_from TIMESTAMPTZ DEFAULT NULL,
  p_effective_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.policy_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_policy public.policy_versions;
BEGIN
  SELECT * INTO v_policy FROM public.policy_versions WHERE id = p_policy_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Policy % not found', p_policy_id;
  END IF;

  IF v_policy.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft policies can be approved/published';
  END IF;

  IF v_policy.created_by IS NOT NULL AND v_actor IS NOT NULL AND v_policy.created_by = v_actor THEN
    RAISE EXCEPTION 'Maker-checker violation: creator cannot approve own policy';
  END IF;

  UPDATE public.policy_versions
  SET status = 'archived', archived_at = now()
  WHERE policy_key = v_policy.policy_key
    AND COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_policy.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status = 'published';

  UPDATE public.policy_versions
  SET status = 'published',
      effective_from = COALESCE(p_effective_from, effective_from),
      effective_to = COALESCE(p_effective_to, effective_to),
      published_at = now(),
      published_by = v_actor,
      archived_at = NULL
  WHERE id = p_policy_id
  RETURNING * INTO v_policy;

  INSERT INTO public.policy_approval_trail (policy_id, action, notes)
  VALUES (v_policy.id, 'approved', p_notes);

  INSERT INTO public.policy_approval_trail (policy_id, action, notes)
  VALUES (v_policy.id, 'published', p_notes);

  RETURN v_policy;
END;
$$;

CREATE OR REPLACE FUNCTION public.policy_resolve(
  p_policy_key TEXT,
  p_context JSONB DEFAULT '{}'::jsonb,
  p_tenant_id UUID DEFAULT NULL,
  p_decision_type TEXT DEFAULT NULL,
  p_operation_id UUID DEFAULT NULL,
  p_persist_snapshot BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_policy public.policy_versions;
  v_rules JSONB;
  v_override JSONB;
  v_resolved JSONB;
  v_tenant UUID := p_tenant_id;
BEGIN
  SELECT pv.*
    INTO v_policy
  FROM public.policy_versions pv
  WHERE pv.policy_key = p_policy_key
    AND pv.status = 'published'
    AND (v_tenant IS NULL OR COALESCE(pv.tenant_id, v_tenant) = v_tenant)
    AND pv.effective_from <= v_now
    AND (pv.effective_to IS NULL OR pv.effective_to > v_now)
  ORDER BY pv.precedence ASC, pv.effective_from DESC, pv.version DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT pv.*
      INTO v_policy
    FROM public.policy_versions pv
    WHERE pv.policy_key = p_policy_key
      AND pv.status = 'published'
      AND pv.is_default = TRUE
      AND (v_tenant IS NULL OR COALESCE(pv.tenant_id, v_tenant) = v_tenant)
    ORDER BY pv.precedence ASC, pv.version DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    v_resolved := jsonb_build_object(
      'policy_key', p_policy_key,
      'resolved', '{}'::jsonb,
      'matched', false,
      'source', 'none'
    );
  ELSE
    v_rules := COALESCE(v_policy.rules, '{}'::jsonb);

    SELECT elem -> 'value'
      INTO v_override
    FROM jsonb_array_elements(COALESCE(v_rules -> 'overrides', '[]'::jsonb)) elem
    WHERE public.policy_context_matches(p_context, elem -> 'when')
    ORDER BY COALESCE((elem ->> 'precedence')::int, 1000)
    LIMIT 1;

    v_resolved := jsonb_build_object(
      'policy_key', p_policy_key,
      'policy_id', v_policy.id,
      'version', v_policy.version,
      'effective_from', v_policy.effective_from,
      'effective_to', v_policy.effective_to,
      'precedence', v_policy.precedence,
      'resolved', COALESCE(v_rules -> 'default', '{}'::jsonb) || COALESCE(v_override, '{}'::jsonb),
      'matched', true,
      'source', 'published'
    );
  END IF;

  IF p_persist_snapshot AND p_decision_type IS NOT NULL THEN
    INSERT INTO public.policy_decision_snapshots (
      tenant_id,
      policy_key,
      decision_type,
      operation_id,
      policy_id,
      policy_version,
      resolved_policy,
      input_context
    )
    VALUES (
      v_tenant,
      p_policy_key,
      p_decision_type,
      p_operation_id,
      (v_resolved ->> 'policy_id')::uuid,
      NULLIF(v_resolved ->> 'version', '')::int,
      v_resolved,
      COALESCE(p_context, '{}'::jsonb)
    );
  END IF;

  RETURN v_resolved;
END;
$$;
