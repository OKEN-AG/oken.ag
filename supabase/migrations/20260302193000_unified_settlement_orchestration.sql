-- Unified settlement orchestration: intents, maker-checker-signer quorum,
-- unified event pipeline (bank webhook + on-chain watcher), and fiat-token-vault reconciliation.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_intent_status') THEN
    CREATE TYPE public.settlement_intent_status AS ENUM ('requested', 'approved', 'executed', 'failed', 'canceled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_actor_role') THEN
    CREATE TYPE public.settlement_actor_role AS ENUM ('maker', 'checker', 'signer');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_event_pipeline_source') THEN
    CREATE TYPE public.settlement_event_pipeline_source AS ENUM ('bank_webhook', 'onchain_watcher');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_rail') THEN
    CREATE TYPE public.settlement_rail AS ENUM ('fiat', 'token', 'vault', 'hybrid');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_mismatch_type') THEN
    CREATE TYPE public.reconciliation_mismatch_type AS ENUM ('none', 'fiat_vs_token', 'fiat_vs_vault', 'token_vs_vault', 'all');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.settlement_approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE CASCADE,
  quorum_signers SMALLINT NOT NULL DEFAULT 1,
  enforce_maker_checker BOOLEAN NOT NULL DEFAULT true,
  enforce_checker_signer BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settlement_approval_policies_quorum_ck CHECK (quorum_signers >= 1),
  UNIQUE NULLS NOT DISTINCT (tenant_id, program_id)
);

CREATE TABLE IF NOT EXISTS public.settlement_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  rail public.settlement_rail NOT NULL DEFAULT 'hybrid',
  intent_ref TEXT,
  status public.settlement_intent_status NOT NULL DEFAULT 'requested',
  requested_amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  maker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  failed_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, intent_ref),
  CONSTRAINT settlement_intents_maker_checker_ck CHECK (
    maker_user_id IS NULL OR checker_user_id IS NULL OR maker_user_id <> checker_user_id
  )
);

CREATE TABLE IF NOT EXISTS public.settlement_intent_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_intent_id UUID NOT NULL REFERENCES public.settlement_intents(id) ON DELETE CASCADE,
  signer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (settlement_intent_id, signer_user_id)
);

CREATE TABLE IF NOT EXISTS public.settlement_event_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  settlement_intent_id UUID REFERENCES public.settlement_intents(id) ON DELETE SET NULL,
  payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  source public.settlement_event_pipeline_source NOT NULL,
  source_event_id TEXT NOT NULL,
  event_status public.settlement_event_status NOT NULL DEFAULT 'pending',
  gross_amount NUMERIC(18,2) NOT NULL,
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(18,2) GENERATED ALWAYS AS (gross_amount - fee_amount) STORED,
  currency TEXT NOT NULL DEFAULT 'BRL',
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_event_id)
);

CREATE TABLE IF NOT EXISTS public.settlement_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  settlement_intent_id UUID NOT NULL REFERENCES public.settlement_intents(id) ON DELETE CASCADE,
  fiat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  token_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  vault_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  mismatch_type public.reconciliation_mismatch_type NOT NULL DEFAULT 'none',
  mismatch_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  mismatch_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settlement_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  settlement_intent_id UUID REFERENCES public.settlement_intents(id) ON DELETE CASCADE,
  rail public.settlement_rail NOT NULL,
  alert_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS settlement_intents_tenant_status_idx
  ON public.settlement_intents (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS settlement_event_pipeline_intent_idx
  ON public.settlement_event_pipeline (settlement_intent_id, event_status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS settlement_alerts_intent_open_idx
  ON public.settlement_alerts (settlement_intent_id, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.evaluate_settlement_intent_governance(p_settlement_intent_id UUID)
RETURNS public.settlement_intent_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.settlement_intents%ROWTYPE;
  v_policy public.settlement_approval_policies%ROWTYPE;
  v_signers_count INT := 0;
BEGIN
  SELECT * INTO v_intent
  FROM public.settlement_intents
  WHERE id = p_settlement_intent_id;

  IF v_intent.id IS NULL THEN
    RAISE EXCEPTION 'settlement_intent % not found', p_settlement_intent_id;
  END IF;

  SELECT * INTO v_policy
  FROM public.settlement_approval_policies sap
  WHERE sap.tenant_id IS NOT DISTINCT FROM v_intent.tenant_id
    AND sap.program_id IS NOT DISTINCT FROM v_intent.program_id
    AND sap.is_active = true
  ORDER BY sap.program_id NULLS LAST
  LIMIT 1;

  IF v_policy.id IS NULL THEN
    v_policy.quorum_signers := 1;
    v_policy.enforce_maker_checker := true;
    v_policy.enforce_checker_signer := true;
  END IF;

  IF v_policy.enforce_maker_checker
    AND v_intent.maker_user_id IS NOT NULL
    AND v_intent.checker_user_id IS NOT NULL
    AND v_intent.maker_user_id = v_intent.checker_user_id THEN
    RAISE EXCEPTION 'maker/checker segregation violation for settlement_intent %', p_settlement_intent_id;
  END IF;

  SELECT COUNT(*) INTO v_signers_count
  FROM public.settlement_intent_signatures sis
  WHERE sis.settlement_intent_id = v_intent.id
    AND (
      NOT v_policy.enforce_checker_signer
      OR sis.signer_user_id IS DISTINCT FROM v_intent.checker_user_id
    )
    AND sis.signer_user_id IS DISTINCT FROM v_intent.maker_user_id;

  IF v_intent.checker_user_id IS NOT NULL AND v_signers_count >= v_policy.quorum_signers THEN
    UPDATE public.settlement_intents
    SET status = 'approved', approved_at = COALESCE(approved_at, now()), updated_at = now()
    WHERE id = v_intent.id
      AND status IN ('requested', 'failed');
  END IF;

  RETURN (SELECT status FROM public.settlement_intents WHERE id = v_intent.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_settlement_pipeline_event(
  p_tenant_id UUID,
  p_source public.settlement_event_pipeline_source,
  p_source_event_id TEXT,
  p_payment_intent_id UUID,
  p_settlement_intent_id UUID,
  p_status public.settlement_event_status,
  p_gross_amount NUMERIC,
  p_fee_amount NUMERIC,
  p_currency TEXT,
  p_payload JSONB,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id UUID;
BEGIN
  INSERT INTO public.settlement_event_pipeline (
    tenant_id,
    settlement_intent_id,
    payment_intent_id,
    source,
    source_event_id,
    event_status,
    gross_amount,
    fee_amount,
    currency,
    event_payload,
    occurred_at
  ) VALUES (
    p_tenant_id,
    p_settlement_intent_id,
    p_payment_intent_id,
    p_source,
    p_source_event_id,
    COALESCE(p_status, 'pending'),
    p_gross_amount,
    COALESCE(p_fee_amount, 0),
    COALESCE(p_currency, 'BRL'),
    COALESCE(p_payload, '{}'::jsonb),
    COALESCE(p_occurred_at, now())
  )
  ON CONFLICT (source, source_event_id) DO UPDATE
  SET event_status = EXCLUDED.event_status,
      gross_amount = EXCLUDED.gross_amount,
      fee_amount = EXCLUDED.fee_amount,
      currency = EXCLUDED.currency,
      event_payload = EXCLUDED.event_payload,
      occurred_at = EXCLUDED.occurred_at
  RETURNING id INTO v_pipeline_id;

  INSERT INTO public.settlement_events (
    tenant_id,
    payment_intent_id,
    source,
    source_event_id,
    status,
    gross_amount,
    fee_amount,
    currency,
    event_payload,
    occurred_at
  )
  SELECT
    p_tenant_id,
    p_payment_intent_id,
    CASE
      WHEN p_source = 'bank_webhook' THEN 'webhook'::public.settlement_source
      ELSE 'event'::public.settlement_source
    END,
    p_source_event_id,
    COALESCE(p_status, 'pending'),
    p_gross_amount,
    COALESCE(p_fee_amount, 0),
    COALESCE(p_currency, 'BRL'),
    COALESCE(p_payload, '{}'::jsonb),
    COALESCE(p_occurred_at, now())
  WHERE p_payment_intent_id IS NOT NULL
  ON CONFLICT (payment_intent_id, source, source_event_id) DO UPDATE
  SET status = EXCLUDED.status,
      gross_amount = EXCLUDED.gross_amount,
      fee_amount = EXCLUDED.fee_amount,
      event_payload = EXCLUDED.event_payload,
      occurred_at = EXCLUDED.occurred_at;

  RETURN v_pipeline_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_settlement_intent_assets(p_settlement_intent_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.settlement_intents%ROWTYPE;
  v_fiat NUMERIC(18,2) := 0;
  v_token NUMERIC(18,2) := 0;
  v_vault NUMERIC(18,2) := 0;
  v_reasons JSONB := '[]'::jsonb;
  v_mismatch_type public.reconciliation_mismatch_type := 'none';
  v_mismatch NUMERIC(18,2) := 0;
  v_run_id UUID;
BEGIN
  SELECT * INTO v_intent
  FROM public.settlement_intents
  WHERE id = p_settlement_intent_id;

  IF v_intent.id IS NULL THEN
    RAISE EXCEPTION 'settlement_intent % not found', p_settlement_intent_id;
  END IF;

  SELECT
    COALESCE(SUM(net_amount) FILTER (WHERE source = 'bank_webhook' AND event_status = 'confirmed'), 0),
    COALESCE(SUM(net_amount) FILTER (WHERE source = 'onchain_watcher' AND event_status = 'confirmed'), 0)
  INTO v_fiat, v_token
  FROM public.settlement_event_pipeline
  WHERE settlement_intent_id = v_intent.id;

  v_vault := COALESCE((v_intent.metadata ->> 'vault_amount')::numeric, 0);

  IF v_fiat <> v_token THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('type', 'fiat_vs_token', 'fiat', v_fiat, 'token', v_token));
  END IF;

  IF v_fiat <> v_vault THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('type', 'fiat_vs_vault', 'fiat', v_fiat, 'vault', v_vault));
  END IF;

  IF v_token <> v_vault THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('type', 'token_vs_vault', 'token', v_token, 'vault', v_vault));
  END IF;

  IF jsonb_array_length(v_reasons) = 0 THEN
    v_mismatch_type := 'none';
    v_mismatch := 0;
  ELSIF jsonb_array_length(v_reasons) = 1 THEN
    v_mismatch_type := (v_reasons -> 0 ->> 'type')::public.reconciliation_mismatch_type;
    v_mismatch := GREATEST(abs(v_fiat - v_token), abs(v_fiat - v_vault), abs(v_token - v_vault));
  ELSE
    v_mismatch_type := 'all';
    v_mismatch := GREATEST(abs(v_fiat - v_token), abs(v_fiat - v_vault), abs(v_token - v_vault));
  END IF;

  INSERT INTO public.settlement_reconciliation_runs (
    tenant_id,
    settlement_intent_id,
    fiat_amount,
    token_amount,
    vault_amount,
    mismatch_type,
    mismatch_amount,
    mismatch_reasons
  ) VALUES (
    v_intent.tenant_id,
    v_intent.id,
    v_fiat,
    v_token,
    v_vault,
    v_mismatch_type,
    v_mismatch,
    v_reasons
  )
  RETURNING id INTO v_run_id;

  IF v_mismatch_type <> 'none' THEN
    INSERT INTO public.settlement_alerts (
      tenant_id,
      settlement_intent_id,
      rail,
      alert_code,
      severity,
      message,
      payload
    ) VALUES (
      v_intent.tenant_id,
      v_intent.id,
      v_intent.rail,
      'FIAT_TOKEN_VAULT_MISMATCH',
      CASE WHEN v_mismatch > 100 THEN 'critical' ELSE 'warning' END,
      'Divergência entre trilhas fiat↔token↔vault detectada',
      jsonb_build_object('mismatch_type', v_mismatch_type, 'mismatch_amount', v_mismatch, 'reasons', v_reasons)
    );
  END IF;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE VIEW public.v_settlement_operational_panel AS
SELECT
  si.tenant_id,
  si.program_id,
  si.rail,
  si.status,
  COUNT(*) AS intent_count,
  SUM(si.requested_amount) AS requested_amount,
  MAX(si.updated_at) AS last_update_at
FROM public.settlement_intents si
GROUP BY si.tenant_id, si.program_id, si.rail, si.status;

CREATE OR REPLACE VIEW public.v_settlement_delay_panel AS
SELECT
  si.tenant_id,
  si.program_id,
  si.rail,
  si.status,
  COUNT(*) FILTER (WHERE now() - si.created_at > interval '2 hours') AS delayed_2h_count,
  COUNT(*) FILTER (WHERE now() - si.created_at > interval '24 hours') AS delayed_24h_count,
  AVG(EXTRACT(EPOCH FROM (now() - si.created_at))/3600.0) AS avg_delay_hours
FROM public.settlement_intents si
WHERE si.status IN ('requested', 'approved')
GROUP BY si.tenant_id, si.program_id, si.rail, si.status;

CREATE OR REPLACE VIEW public.v_settlement_divergence_by_rail AS
SELECT
  sa.tenant_id,
  sa.rail,
  COUNT(*) AS open_alerts,
  COUNT(*) FILTER (WHERE sa.severity = 'critical') AS critical_alerts,
  MAX(sa.created_at) AS last_alert_at
FROM public.settlement_alerts sa
WHERE sa.resolved_at IS NULL
GROUP BY sa.tenant_id, sa.rail;

ALTER TABLE public.settlement_approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_intent_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_event_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view settlement intents" ON public.settlement_intents;
CREATE POLICY "Authenticated can view settlement intents"
  ON public.settlement_intents FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage settlement intents" ON public.settlement_intents;
CREATE POLICY "Admins can manage settlement intents"
  ON public.settlement_intents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view settlement policies" ON public.settlement_approval_policies;
CREATE POLICY "Authenticated can view settlement policies"
  ON public.settlement_approval_policies FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage settlement policies" ON public.settlement_approval_policies;
CREATE POLICY "Admins can manage settlement policies"
  ON public.settlement_approval_policies FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view settlement signatures" ON public.settlement_intent_signatures;
CREATE POLICY "Authenticated can view settlement signatures"
  ON public.settlement_intent_signatures FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can sign settlement intents" ON public.settlement_intent_signatures;
CREATE POLICY "Authenticated can sign settlement intents"
  ON public.settlement_intent_signatures FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = signer_user_id);

DROP POLICY IF EXISTS "Authenticated can view settlement pipeline events" ON public.settlement_event_pipeline;
CREATE POLICY "Authenticated can view settlement pipeline events"
  ON public.settlement_event_pipeline FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage settlement pipeline events" ON public.settlement_event_pipeline;
CREATE POLICY "Admins can manage settlement pipeline events"
  ON public.settlement_event_pipeline FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view settlement reconciliations" ON public.settlement_reconciliation_runs;
CREATE POLICY "Authenticated can view settlement reconciliations"
  ON public.settlement_reconciliation_runs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can view settlement alerts" ON public.settlement_alerts;
CREATE POLICY "Authenticated can view settlement alerts"
  ON public.settlement_alerts FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage settlement alerts" ON public.settlement_alerts;
CREATE POLICY "Admins can manage settlement alerts"
  ON public.settlement_alerts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
