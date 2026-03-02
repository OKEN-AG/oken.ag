-- Documental domain evolution
-- 1) Core documental components
CREATE TABLE IF NOT EXISTS public.template_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt-BR',
  active_version_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.template_registry(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  body TEXT NOT NULL,
  required_clauses JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

ALTER TABLE public.template_registry
  ADD CONSTRAINT template_registry_active_version_fk
  FOREIGN KEY (active_version_id)
  REFERENCES public.template_versions(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.clause_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT false,
  version_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, version_number)
);

CREATE TABLE IF NOT EXISTS public.document_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  template_version_id UUID NOT NULL REFERENCES public.template_versions(id) ON DELETE RESTRICT,
  generated_from_snapshot_id UUID NOT NULL REFERENCES public.core_snapshots(id) ON DELETE RESTRICT,
  status public.document_status NOT NULL DEFAULT 'draft',
  rendered_content TEXT,
  document_hash_sha256 TEXT NOT NULL,
  acceptance_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  replaced_by_document_id UUID REFERENCES public.document_instances(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.signature_workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_instance_id UUID NOT NULL REFERENCES public.document_instances(id) ON DELETE CASCADE,
  signer_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  signer_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  evidence_hash_sha256 TEXT,
  evidence_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.registration_workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_instance_id UUID NOT NULL REFERENCES public.document_instances(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  protocol TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  evidence_hash_sha256 TEXT,
  evidence_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_instance_id, provider)
);

-- 2) Immutable snapshot enforcement + audit hashes
CREATE OR REPLACE FUNCTION public.enforce_document_snapshot_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.generated_from_snapshot_id IS DISTINCT FROM OLD.generated_from_snapshot_id THEN
    RAISE EXCEPTION 'document_instances.generated_from_snapshot_id is immutable';
  END IF;

  IF NEW.generated_from_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'document_instances.generated_from_snapshot_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.core_snapshots cs
    WHERE cs.id = NEW.generated_from_snapshot_id
      AND cs.snapshot_type IN ('deal', 'deal_snapshot')
  ) THEN
    RAISE EXCEPTION 'document_instances must be generated from a deal snapshot';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_snapshot_immutability ON public.document_instances;
CREATE TRIGGER trg_document_snapshot_immutability
BEFORE INSERT OR UPDATE ON public.document_instances
FOR EACH ROW
EXECUTE FUNCTION public.enforce_document_snapshot_immutability();

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_template_registry_updated_at ON public.template_registry;
CREATE TRIGGER trg_template_registry_updated_at
BEFORE UPDATE ON public.template_registry
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_document_instances_updated_at ON public.document_instances;
CREATE TRIGGER trg_document_instances_updated_at
BEFORE UPDATE ON public.document_instances
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_signature_workflow_updated_at ON public.signature_workflow;
CREATE TRIGGER trg_signature_workflow_updated_at
BEFORE UPDATE ON public.signature_workflow
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_registration_workflow_updated_at ON public.registration_workflow;
CREATE TRIGGER trg_registration_workflow_updated_at
BEFORE UPDATE ON public.registration_workflow
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_generic();

-- 3) Operational gate: no disbursement without minimal documental status
CREATE OR REPLACE FUNCTION public.assert_document_gate_for_disbursement(v_operation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_missing INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_missing
  FROM public.operation_documents od
  WHERE od.operation_id = v_operation_id
    AND od.doc_type IN ('termo_barter', 'cpr')
    AND od.status NOT IN ('assinado', 'registrado');

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Document gate blocked: required docs must be at least assinado before disbursement';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_document_gate_before_disbursement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('garantido', 'faturado', 'monitorando', 'liquidado')
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    PERFORM public.assert_document_gate_for_disbursement(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_document_gate_before_disbursement ON public.operations;
CREATE TRIGGER trg_enforce_document_gate_before_disbursement
BEFORE INSERT OR UPDATE OF status ON public.operations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_document_gate_before_disbursement();

-- 4) RLS
ALTER TABLE public.template_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clause_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_workflow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own document instances"
  ON public.document_instances
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.operations op
      WHERE op.id = document_instances.operation_id
        AND op.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own document instances"
  ON public.document_instances
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.operations op
      WHERE op.id = document_instances.operation_id
        AND op.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage documental domain"
  ON public.template_registry
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage template versions"
  ON public.template_versions
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage clauses"
  ON public.clause_library
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage document instances"
  ON public.document_instances
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage signature workflow"
  ON public.signature_workflow
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage registration workflow"
  ON public.registration_workflow
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own signature workflow"
  ON public.signature_workflow
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.document_instances di
      JOIN public.operations op ON op.id = di.operation_id
      WHERE di.id = signature_workflow.document_instance_id
        AND op.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own registration workflow"
  ON public.registration_workflow
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.document_instances di
      JOIN public.operations op ON op.id = di.operation_id
      WHERE di.id = registration_workflow.document_instance_id
        AND op.user_id = auth.uid()
    )
  );
