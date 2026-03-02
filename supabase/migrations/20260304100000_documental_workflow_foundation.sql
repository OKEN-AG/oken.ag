-- Documental workflow foundation: templates, instances, signatures, registration and state machine

CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  template_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL DEFAULT 'pt-BR',
  jurisdiction TEXT NOT NULL DEFAULT 'BR',
  active_version_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_code)
);

CREATE TABLE IF NOT EXISTS public.template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  template_id UUID NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

ALTER TABLE public.document_templates
  DROP CONSTRAINT IF EXISTS document_templates_active_version_id_fkey;
ALTER TABLE public.document_templates
  ADD CONSTRAINT document_templates_active_version_id_fkey
  FOREIGN KEY (active_version_id) REFERENCES public.template_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.clause_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  clause_code TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  required BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, clause_code)
);

CREATE TABLE IF NOT EXISTS public.document_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  operation_id UUID REFERENCES public.operations(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES public.core_snapshots(id) ON DELETE RESTRICT,
  template_id UUID NOT NULL REFERENCES public.document_templates(id) ON DELETE RESTRICT,
  template_version_id UUID NOT NULL REFERENCES public.template_versions(id) ON DELETE RESTRICT,
  document_type public.document_type,
  state TEXT NOT NULL DEFAULT 'draft',
  payload_frozen JSONB NOT NULL,
  rendered_content TEXT NOT NULL,
  hash_sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_instances_state_ck CHECK (state IN ('draft', 'aprovado', 'assinado', 'registrado', 'pendente', 'substituido', 'cancelado'))
);

CREATE TABLE IF NOT EXISTS public.signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  document_instance_id UUID NOT NULL REFERENCES public.document_instances(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_request_id TEXT,
  signer_name TEXT,
  signer_document TEXT,
  signer_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, external_request_id)
);

CREATE TABLE IF NOT EXISTS public.registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  document_instance_id UUID NOT NULL REFERENCES public.document_instances(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_request_id TEXT,
  registry_office TEXT,
  protocol TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, external_request_id)
);

CREATE TABLE IF NOT EXISTS public.document_state_transitions (
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  PRIMARY KEY (from_state, to_state)
);

INSERT INTO public.document_state_transitions (from_state, to_state)
VALUES
  ('pendente', 'draft'),
  ('draft', 'aprovado'),
  ('draft', 'cancelado'),
  ('aprovado', 'assinado'),
  ('aprovado', 'cancelado'),
  ('assinado', 'registrado'),
  ('assinado', 'substituido'),
  ('registrado', 'substituido')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_valid_document_transition(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.document_state_transitions dst
    WHERE dst.from_state = p_from
      AND dst.to_state = p_to
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_document_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_valid_document_transition(OLD.state, NEW.state) THEN
    RAISE EXCEPTION 'Invalid document transition: % -> %', OLD.state, NEW.state;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_instances_state_transition ON public.document_instances;
CREATE TRIGGER trg_document_instances_state_transition
BEFORE UPDATE ON public.document_instances
FOR EACH ROW
EXECUTE FUNCTION public.enforce_document_state_transition();

CREATE OR REPLACE FUNCTION public.generate_document_instance_from_snapshot(
  p_snapshot_id UUID,
  p_template_id UUID,
  p_operation_id UUID DEFAULT NULL,
  p_document_type public.document_type DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot public.core_snapshots%ROWTYPE;
  v_template public.document_templates%ROWTYPE;
  v_version public.template_versions%ROWTYPE;
  v_instance_id UUID;
BEGIN
  SELECT * INTO v_snapshot FROM public.core_snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot % not found', p_snapshot_id;
  END IF;

  SELECT * INTO v_template FROM public.document_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template % not found', p_template_id;
  END IF;

  SELECT * INTO v_version
  FROM public.template_versions
  WHERE id = v_template.active_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active template version not found for template %', p_template_id;
  END IF;

  INSERT INTO public.document_instances (
    tenant_id,
    operation_id,
    snapshot_id,
    template_id,
    template_version_id,
    document_type,
    state,
    payload_frozen,
    rendered_content,
    hash_sha256,
    created_by
  ) VALUES (
    COALESCE(v_snapshot.tenant_id, v_template.tenant_id),
    p_operation_id,
    v_snapshot.id,
    v_template.id,
    v_version.id,
    p_document_type,
    'draft',
    v_snapshot.payload,
    v_version.body,
    v_snapshot.payload_hash,
    auth.uid()
  ) RETURNING id INTO v_instance_id;

  RETURN v_instance_id;
END;
$$;

CREATE OR REPLACE VIEW public.operation_documental_pending_panel AS
SELECT
  op.id AS operation_id,
  op.status AS operation_status,
  COUNT(di.*) FILTER (WHERE di.state NOT IN ('registrado', 'substituido', 'cancelado')) AS pending_documents,
  BOOL_AND(di.state IN ('assinado', 'registrado', 'substituido', 'cancelado')) AS document_done,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'document_instance_id', di.id,
        'document_type', di.document_type,
        'state', di.state,
        'snapshot_id', di.snapshot_id,
        'updated_at', di.updated_at
      ) ORDER BY di.updated_at DESC
    ) FILTER (WHERE di.id IS NOT NULL),
    '[]'::jsonb
  ) AS evidence_trail
FROM public.operations op
LEFT JOIN public.document_instances di ON di.operation_id = op.id
GROUP BY op.id, op.status;
