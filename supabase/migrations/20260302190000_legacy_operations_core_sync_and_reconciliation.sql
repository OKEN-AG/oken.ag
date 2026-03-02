-- Legacy operations -> Common Core synchronization, snapshots, events and reconciliation dashboard

-- 1) Reconciliation logs
CREATE TABLE IF NOT EXISTS public.operation_deal_reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  tenant_id UUID,
  status TEXT NOT NULL DEFAULT 'ok',
  divergence_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  operation_payload JSONB NOT NULL,
  deal_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operation_deal_recon_operation_created_idx
  ON public.operation_deal_reconciliation_logs (operation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS operation_deal_recon_status_created_idx
  ON public.operation_deal_reconciliation_logs (status, created_at DESC);

ALTER TABLE public.operation_deal_reconciliation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users can view operation/deal reconciliation logs" ON public.operation_deal_reconciliation_logs;
CREATE POLICY "Tenant users can view operation/deal reconciliation logs"
  ON public.operation_deal_reconciliation_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

DROP POLICY IF EXISTS "Service role can insert operation/deal reconciliation logs" ON public.operation_deal_reconciliation_logs;
CREATE POLICY "Service role can insert operation/deal reconciliation logs"
  ON public.operation_deal_reconciliation_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Status mapper
CREATE OR REPLACE FUNCTION public.map_operation_status_to_deal_status(v_status public.operation_status)
RETURNS public.deal_status
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE v_status
    WHEN 'simulacao' THEN 'draft'::public.deal_status
    WHEN 'pedido' THEN 'approved'::public.deal_status
    WHEN 'formalizado' THEN 'formalized'::public.deal_status
    WHEN 'garantido' THEN 'formalized'::public.deal_status
    WHEN 'faturado' THEN 'settled'::public.deal_status
    WHEN 'monitorando' THEN 'settled'::public.deal_status
    WHEN 'liquidado' THEN 'closed'::public.deal_status
    ELSE 'draft'::public.deal_status
  END;
$$;

-- 3) Main sync trigger: operations -> deals + snapshots + business events + recon logs
CREATE OR REPLACE FUNCTION public.sync_legacy_operation_to_core_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id UUID;
  v_tenant_id UUID;
  v_deal_id UUID;
  v_deal_status public.deal_status;
  v_snapshot_id UUID;
  v_existing_snapshot_id UUID;
  v_snapshot_stage TEXT;
  v_business_event_name TEXT;
  v_idempotency_key TEXT;
  v_expected_requested_amount NUMERIC(18,2);
  v_expected_approved_amount NUMERIC(18,2);
  v_divergence_reasons JSONB := '[]'::jsonb;
  v_deal_row public.deals%ROWTYPE;
BEGIN
  v_deal_status := public.map_operation_status_to_deal_status(NEW.status);
  v_expected_requested_amount := COALESCE(NEW.net_revenue, 0);
  v_expected_approved_amount := CASE
    WHEN NEW.status IN ('pedido', 'formalizado', 'garantido', 'faturado', 'monitorando', 'liquidado')
      THEN COALESCE(NEW.financial_revenue, NEW.net_revenue, 0)
    ELSE NULL
  END;

  SELECT p.id, p.tenant_id
    INTO v_program_id, v_tenant_id
  FROM public.programs p
  WHERE p.legacy_campaign_id = NEW.campaign_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    v_divergence_reasons := v_divergence_reasons || jsonb_build_array('missing_program_or_tenant_mapping');

    INSERT INTO public.operation_deal_reconciliation_logs (
      operation_id,
      tenant_id,
      status,
      divergence_reasons,
      operation_payload,
      deal_payload
    ) VALUES (
      NEW.id,
      NULL,
      'divergent',
      v_divergence_reasons,
      to_jsonb(NEW),
      NULL
    );

    RETURN NEW;
  END IF;

  IF NEW.status = 'simulacao' THEN
    v_snapshot_stage := 'simulacao';
  ELSIF NEW.status = 'pedido' THEN
    v_snapshot_stage := 'aprovacao';
  ELSIF NEW.status = 'formalizado' THEN
    v_snapshot_stage := 'formalizacao';
  END IF;

  IF v_snapshot_stage IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.core_snapshots (
      tenant_id,
      snapshot_type,
      domain_ref,
      domain_id,
      payload,
      payload_hash,
      created_by
    ) VALUES (
      v_tenant_id,
      format('legacy.operation.%s', v_snapshot_stage),
      'operations',
      NEW.id,
      jsonb_build_object(
        'operation', to_jsonb(NEW),
        'decision_point', v_snapshot_stage,
        'legacy_table', 'operations'
      ),
      md5(to_jsonb(NEW)::text),
      NEW.user_id
    )
    RETURNING id INTO v_snapshot_id;
  END IF;

  SELECT d.snapshot_id
    INTO v_existing_snapshot_id
  FROM public.deals d
  WHERE d.legacy_operation_id = NEW.id;

  INSERT INTO public.deals (
    tenant_id,
    program_id,
    applicant_party_id,
    status,
    currency,
    requested_amount,
    approved_amount,
    snapshot_id,
    metadata,
    legacy_operation_id
  ) VALUES (
    v_tenant_id,
    v_program_id,
    NULL,
    v_deal_status,
    'BRL',
    v_expected_requested_amount,
    v_expected_approved_amount,
    COALESCE(v_snapshot_id, v_existing_snapshot_id),
    jsonb_build_object(
      'source', 'legacy_operations_sync_trigger',
      'legacy_operation_status', NEW.status,
      'legacy_campaign_id', NEW.campaign_id,
      'operation_updated_at', NEW.updated_at
    ),
    NEW.id
  )
  ON CONFLICT (legacy_operation_id)
  DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    program_id = EXCLUDED.program_id,
    status = EXCLUDED.status,
    requested_amount = EXCLUDED.requested_amount,
    approved_amount = EXCLUDED.approved_amount,
    snapshot_id = COALESCE(EXCLUDED.snapshot_id, public.deals.snapshot_id),
    metadata = public.deals.metadata || EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_deal_id;

  SELECT * INTO v_deal_row
  FROM public.deals d
  WHERE d.id = v_deal_id;

  IF v_deal_row.program_id IS DISTINCT FROM v_program_id THEN
    v_divergence_reasons := v_divergence_reasons || jsonb_build_array('program_id_mismatch');
  END IF;

  IF v_deal_row.status IS DISTINCT FROM v_deal_status THEN
    v_divergence_reasons := v_divergence_reasons || jsonb_build_array('status_mismatch');
  END IF;

  IF COALESCE(v_deal_row.requested_amount, 0) IS DISTINCT FROM COALESCE(v_expected_requested_amount, 0) THEN
    v_divergence_reasons := v_divergence_reasons || jsonb_build_array('requested_amount_mismatch');
  END IF;

  IF COALESCE(v_deal_row.approved_amount, 0) IS DISTINCT FROM COALESCE(v_expected_approved_amount, 0) THEN
    v_divergence_reasons := v_divergence_reasons || jsonb_build_array('approved_amount_mismatch');
  END IF;

  IF NEW.status = 'simulacao' THEN
    v_business_event_name := 'legacy.operation.simulation_snapshot_recorded';
  ELSIF NEW.status = 'pedido' THEN
    v_business_event_name := 'legacy.operation.approval_snapshot_recorded';
  ELSIF NEW.status = 'formalizado' THEN
    v_business_event_name := 'legacy.operation.formalization_snapshot_recorded';
  ELSE
    v_business_event_name := 'legacy.operation.synced_to_deal';
  END IF;

  v_idempotency_key := format(
    'legacy-operation:%s:%s:%s',
    NEW.id,
    NEW.status,
    extract(epoch from COALESCE(NEW.updated_at, now()))::bigint
  );

  INSERT INTO public.business_events (
    tenant_id,
    event_name,
    event_version,
    event_status,
    aggregate_type,
    aggregate_id,
    correlation_id,
    idempotency_key,
    snapshot_id,
    payload,
    metadata,
    occurred_at
  ) VALUES (
    v_tenant_id,
    v_business_event_name,
    1,
    'pending',
    'deal',
    v_deal_id,
    NEW.id::text,
    v_idempotency_key,
    COALESCE(v_snapshot_id, v_deal_row.snapshot_id),
    jsonb_build_object(
      'operation_id', NEW.id,
      'deal_id', v_deal_id,
      'operation_status', NEW.status,
      'deal_status', v_deal_status
    ),
    jsonb_build_object(
      'source', 'legacy_operation_trigger',
      'decision_snapshot_id', COALESCE(v_snapshot_id, v_deal_row.snapshot_id)
    ),
    now()
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

  INSERT INTO public.operation_deal_reconciliation_logs (
    operation_id,
    deal_id,
    tenant_id,
    status,
    divergence_reasons,
    operation_payload,
    deal_payload
  ) VALUES (
    NEW.id,
    v_deal_id,
    v_tenant_id,
    CASE WHEN jsonb_array_length(v_divergence_reasons) = 0 THEN 'ok' ELSE 'divergent' END,
    v_divergence_reasons,
    to_jsonb(NEW),
    to_jsonb(v_deal_row)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_legacy_operation_to_core_deal_trigger ON public.operations;
CREATE TRIGGER sync_legacy_operation_to_core_deal_trigger
  AFTER INSERT OR UPDATE ON public.operations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_legacy_operation_to_core_deal();

-- 4) Divergence dashboard view
CREATE OR REPLACE VIEW public.operations_deals_divergence_dashboard AS
SELECT
  o.id AS operation_id,
  d.id AS deal_id,
  o.status AS operation_status,
  d.status AS deal_status,
  o.campaign_id,
  d.program_id,
  o.net_revenue,
  d.requested_amount,
  d.approved_amount,
  (d.id IS NULL) AS missing_deal,
  (
    d.id IS NULL
    OR d.program_id IS NULL
    OR d.status IS DISTINCT FROM public.map_operation_status_to_deal_status(o.status)
    OR COALESCE(d.requested_amount, 0) IS DISTINCT FROM COALESCE(o.net_revenue, 0)
  ) AS has_divergence,
  CASE
    WHEN d.id IS NULL THEN 'deal_not_found'
    WHEN d.program_id IS NULL THEN 'deal_without_program'
    WHEN d.status IS DISTINCT FROM public.map_operation_status_to_deal_status(o.status) THEN 'status_mismatch'
    WHEN COALESCE(d.requested_amount, 0) IS DISTINCT FROM COALESCE(o.net_revenue, 0) THEN 'requested_amount_mismatch'
    ELSE 'ok'
  END AS primary_reason,
  o.updated_at AS operation_updated_at,
  d.updated_at AS deal_updated_at
FROM public.operations o
LEFT JOIN public.deals d ON d.legacy_operation_id = o.id;
