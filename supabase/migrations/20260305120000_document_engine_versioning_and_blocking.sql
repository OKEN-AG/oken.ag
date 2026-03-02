-- Document engine evolution
-- 1) Explicit versioning for template and instance lifecycle
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS template_kind TEXT NOT NULL DEFAULT 'static',
  ADD COLUMN IF NOT EXISTS current_version_no INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.document_instances
  ADD COLUMN IF NOT EXISTS version_no INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_instance_id UUID REFERENCES public.document_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_from_operation BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_instances_operation_type_version
  ON public.document_instances(operation_id, document_type, version_no)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_instances_operation_type_updated
  ON public.document_instances(operation_id, document_type, updated_at DESC)
  WHERE operation_id IS NOT NULL;

-- 2) Dynamic templates for CCV / CPR / Cessão
INSERT INTO public.document_templates (template_code, name, description, language, jurisdiction, template_kind)
VALUES
  ('ccv', 'Template Dinâmico CCV', 'Template dinâmico para contrato de compra e venda vinculado à operação', 'pt-BR', 'BR', 'dynamic'),
  ('cpr', 'Template Dinâmico CPR', 'Template dinâmico para Cédula de Produto Rural com dados da operação', 'pt-BR', 'BR', 'dynamic'),
  ('cessao_credito', 'Template Dinâmico Cessão de Crédito', 'Template dinâmico para cessão de crédito vinculada ao CCV da operação', 'pt-BR', 'BR', 'dynamic')
ON CONFLICT (tenant_id, template_code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  template_kind = EXCLUDED.template_kind,
  updated_at = now();

WITH template_rows AS (
  SELECT id, template_code
  FROM public.document_templates
  WHERE template_code IN ('ccv', 'cpr', 'cessao_credito')
),
version_rows AS (
  INSERT INTO public.template_versions (template_id, version_number, body, variables, metadata)
  SELECT
    tr.id,
    1,
    CASE tr.template_code
      WHEN 'ccv' THEN 'CCV nº {{operation.id}} entre {{operation.client_name}} e {{counterparty.name}}.'
      WHEN 'cpr' THEN 'CPR nº {{operation.id}} para {{operation.client_name}} com entrega em {{operation.delivery_date}}.'
      ELSE 'Cessão de crédito da operação {{operation.id}} do cedente {{operation.client_name}} para {{counterparty.name}}.'
    END,
    CASE tr.template_code
      WHEN 'ccv' THEN '["operation.id","operation.client_name","counterparty.name"]'::jsonb
      WHEN 'cpr' THEN '["operation.id","operation.client_name","operation.delivery_date"]'::jsonb
      ELSE '["operation.id","operation.client_name","counterparty.name"]'::jsonb
    END,
    jsonb_build_object('dynamic', true)
  FROM template_rows tr
  ON CONFLICT (template_id, version_number) DO UPDATE
  SET
    body = EXCLUDED.body,
    variables = EXCLUDED.variables,
    metadata = EXCLUDED.metadata
  RETURNING template_id, id, version_number
)
UPDATE public.document_templates dt
SET
  active_version_id = vr.id,
  current_version_no = vr.version_number,
  updated_at = now()
FROM version_rows vr
WHERE dt.id = vr.template_id;

-- 3) Required-document rules and readable blocking reasons
CREATE TABLE IF NOT EXISTS public.document_requirement_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_status public.operation_status NOT NULL,
  document_type public.document_type NOT NULL,
  min_state TEXT NOT NULL DEFAULT 'assinado',
  reason_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operation_status, document_type)
);

INSERT INTO public.document_requirement_rules (operation_status, document_type, min_state, reason_template, is_active)
VALUES
  ('formalizado', 'pedido', 'assinado', 'Pedido assinado é obrigatório para continuidade da operação.', true),
  ('formalizado', 'termo_barter', 'assinado', 'Termo de Barter assinado é obrigatório para continuidade da operação.', true),
  ('garantido', 'ccv', 'assinado', 'CCV assinado é obrigatório para comprovação de liquidez.', true),
  ('garantido', 'cessao_credito', 'assinado', 'Cessão de crédito assinada é obrigatória quando houver estrutura de cessão.', true),
  ('garantido', 'cpr', 'assinado', 'CPR assinada é obrigatória para comprovação de produção.', true)
ON CONFLICT (operation_status, document_type) DO UPDATE
SET
  min_state = EXCLUDED.min_state,
  reason_template = EXCLUDED.reason_template,
  is_active = EXCLUDED.is_active;

CREATE OR REPLACE FUNCTION public.issue_operation_documents(
  p_operation_id UUID,
  p_snapshot_id UUID,
  p_document_types public.document_type[] DEFAULT ARRAY['pedido'::public.document_type, 'termo_barter'::public.document_type]
)
RETURNS TABLE(document_instance_id UUID, document_type public.document_type, version_no INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_document_type public.document_type;
  v_template_id UUID;
  v_template_version_id UUID;
  v_version_no INTEGER;
  v_document_instance_id UUID;
BEGIN
  FOREACH v_document_type IN ARRAY p_document_types LOOP
    SELECT dt.id, dt.active_version_id
      INTO v_template_id, v_template_version_id
    FROM public.document_templates dt
    WHERE dt.template_code = v_document_type::text
    LIMIT 1;

    IF v_template_id IS NULL OR v_template_version_id IS NULL THEN
      RAISE EXCEPTION 'Template ativo não encontrado para document_type=%', v_document_type;
    END IF;

    SELECT COALESCE(MAX(di.version_no), 0) + 1
      INTO v_version_no
    FROM public.document_instances di
    WHERE di.operation_id = p_operation_id
      AND di.document_type = v_document_type;

    INSERT INTO public.document_instances (
      operation_id,
      snapshot_id,
      template_id,
      template_version_id,
      document_type,
      version_no,
      state,
      payload_frozen,
      rendered_content,
      issued_from_operation,
      created_by
    )
    SELECT
      p_operation_id,
      p_snapshot_id,
      v_template_id,
      v_template_version_id,
      v_document_type,
      v_version_no,
      'draft',
      cs.payload,
      tv.body,
      true,
      auth.uid()
    FROM public.core_snapshots cs
    JOIN public.template_versions tv ON tv.id = v_template_version_id
    WHERE cs.id = p_snapshot_id
    RETURNING id INTO v_document_instance_id;

    document_instance_id := v_document_instance_id;
    document_type := v_document_type;
    version_no := v_version_no;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_operation_document_blocking_reasons(p_operation_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
  WITH op AS (
    SELECT status
    FROM public.operations
    WHERE id = p_operation_id
  ),
  active_rules AS (
    SELECT rr.document_type, rr.min_state, rr.reason_template
    FROM public.document_requirement_rules rr
    JOIN op ON op.status = rr.operation_status
    WHERE rr.is_active = true
  ),
  latest_documents AS (
    SELECT DISTINCT ON (di.document_type)
      di.document_type,
      di.state
    FROM public.document_instances di
    WHERE di.operation_id = p_operation_id
    ORDER BY di.document_type, di.version_no DESC, di.updated_at DESC
  )
  SELECT COALESCE(array_agg(ar.reason_template ORDER BY ar.document_type), ARRAY[]::TEXT[])
  FROM active_rules ar
  LEFT JOIN latest_documents ld ON ld.document_type = ar.document_type
  WHERE ld.document_type IS NULL
     OR (
       CASE ar.min_state
         WHEN 'draft' THEN 0
         WHEN 'aprovado' THEN 1
         WHEN 'assinado' THEN 2
         WHEN 'registrado' THEN 3
         ELSE 999
       END
     ) > (
       CASE ld.state
         WHEN 'draft' THEN 0
         WHEN 'aprovado' THEN 1
         WHEN 'assinado' THEN 2
         WHEN 'registrado' THEN 3
         ELSE -1
       END
     );
$$;
