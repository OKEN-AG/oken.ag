-- Financial reconciliation + accounting and tax trail (Phase 2)

-- 1) Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cash_account_type') THEN
    CREATE TYPE public.cash_account_type AS ENUM ('bank', 'wallet', 'internal_ledger', 'clearing');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_intent_status') THEN
    CREATE TYPE public.payment_intent_status AS ENUM (
      'created',
      'authorized',
      'captured',
      'settled',
      'failed',
      'canceled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_source') THEN
    CREATE TYPE public.settlement_source AS ENUM ('bank', 'webhook', 'ledger', 'event');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_event_status') THEN
    CREATE TYPE public.settlement_event_status AS ENUM ('pending', 'confirmed', 'reversed', 'ignored');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_status') THEN
    CREATE TYPE public.reconciliation_status AS ENUM ('matched', 'divergent', 'manual_review', 'error');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_closure_rule') THEN
    CREATE TYPE public.reconciliation_closure_rule AS ENUM ('D0', 'D1');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accounting_entry_type') THEN
    CREATE TYPE public.accounting_entry_type AS ENUM ('debit', 'credit');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tax_operation_type') THEN
    CREATE TYPE public.tax_operation_type AS ENUM (
      'sale',
      'purchase',
      'transfer',
      'service',
      'settlement',
      'cancellation',
      'other'
    );
  END IF;
END$$;

-- 2) Core tables
CREATE TABLE IF NOT EXISTS public.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  account_type public.cash_account_type NOT NULL,
  account_code TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  bank_name TEXT,
  bank_branch TEXT,
  bank_account_number TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, account_code)
);

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  payer_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  beneficiary_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  source_cash_account_id UUID REFERENCES public.cash_accounts(id) ON DELETE SET NULL,
  destination_cash_account_id UUID REFERENCES public.cash_accounts(id) ON DELETE SET NULL,
  intent_ref TEXT,
  status public.payment_intent_status NOT NULL DEFAULT 'created',
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  expected_settlement_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, intent_ref)
);

CREATE TABLE IF NOT EXISTS public.settlement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  source public.settlement_source NOT NULL,
  source_event_id TEXT,
  status public.settlement_event_status NOT NULL DEFAULT 'pending',
  gross_amount NUMERIC(18,2) NOT NULL,
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(18,2) GENERATED ALWAYS AS (gross_amount - fee_amount) STORED,
  currency TEXT NOT NULL DEFAULT 'BRL',
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_intent_id, source, source_event_id)
);

CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  closure_rule public.reconciliation_closure_rule,
  business_date DATE,
  status public.reconciliation_status NOT NULL,
  expected_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  bank_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  webhook_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  ledger_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  event_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  divergence_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  divergence_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  run_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  business_event_id UUID REFERENCES public.business_events(id) ON DELETE SET NULL,
  payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type public.accounting_entry_type NOT NULL,
  cash_account_id UUID REFERENCES public.cash_accounts(id) ON DELETE SET NULL,
  counterparty_account_id UUID REFERENCES public.cash_accounts(id) ON DELETE SET NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  business_event_id UUID REFERENCES public.business_events(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  operation_type public.tax_operation_type NOT NULL,
  operation_ref TEXT,
  tax_code TEXT,
  taxable_base NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(9,6),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlement_events_intent_status_idx
  ON public.settlement_events (payment_intent_id, status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS reconciliation_runs_intent_executed_idx
  ON public.reconciliation_runs (payment_intent_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS tax_events_operation_idx
  ON public.tax_events (tenant_id, operation_type, occurred_at DESC);

-- 3) Reconciliation engine (near real-time)
CREATE OR REPLACE FUNCTION public.reconcile_payment_intent(p_payment_intent_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.payment_intents%ROWTYPE;
  v_bank NUMERIC(18,2) := 0;
  v_webhook NUMERIC(18,2) := 0;
  v_ledger NUMERIC(18,2) := 0;
  v_event NUMERIC(18,2) := 0;
  v_status public.reconciliation_status := 'matched';
  v_reasons JSONB := '[]'::jsonb;
  v_divergence NUMERIC(18,2) := 0;
  v_run_id UUID;
BEGIN
  SELECT * INTO v_intent
  FROM public.payment_intents
  WHERE id = p_payment_intent_id;

  IF v_intent.id IS NULL THEN
    RAISE EXCEPTION 'payment_intent % not found', p_payment_intent_id;
  END IF;

  SELECT
    COALESCE(SUM(net_amount) FILTER (WHERE source = 'bank' AND status = 'confirmed'), 0),
    COALESCE(SUM(net_amount) FILTER (WHERE source = 'webhook' AND status = 'confirmed'), 0),
    COALESCE(SUM(net_amount) FILTER (WHERE source = 'ledger' AND status = 'confirmed'), 0),
    COALESCE(SUM(net_amount) FILTER (WHERE source = 'event' AND status = 'confirmed'), 0)
  INTO v_bank, v_webhook, v_ledger, v_event
  FROM public.settlement_events
  WHERE payment_intent_id = v_intent.id;

  IF v_bank <> v_intent.amount THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('type', 'bank_mismatch', 'expected', v_intent.amount, 'actual', v_bank));
  END IF;

  IF v_webhook <> v_intent.amount THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('type', 'webhook_mismatch', 'expected', v_intent.amount, 'actual', v_webhook));
  END IF;

  IF v_ledger <> v_intent.amount THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('type', 'ledger_mismatch', 'expected', v_intent.amount, 'actual', v_ledger));
  END IF;

  IF v_event <> v_intent.amount THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('type', 'event_mismatch', 'expected', v_intent.amount, 'actual', v_event));
  END IF;

  v_divergence := GREATEST(
    abs(v_intent.amount - v_bank),
    abs(v_intent.amount - v_webhook),
    abs(v_intent.amount - v_ledger),
    abs(v_intent.amount - v_event)
  );

  IF jsonb_array_length(v_reasons) > 0 THEN
    v_status := 'divergent';
  END IF;

  INSERT INTO public.reconciliation_runs (
    tenant_id,
    payment_intent_id,
    status,
    expected_amount,
    bank_amount,
    webhook_amount,
    ledger_amount,
    event_amount,
    divergence_amount,
    divergence_reasons,
    run_metadata
  ) VALUES (
    v_intent.tenant_id,
    v_intent.id,
    v_status,
    v_intent.amount,
    v_bank,
    v_webhook,
    v_ledger,
    v_event,
    v_divergence,
    v_reasons,
    jsonb_build_object('trigger', 'near_realtime')
  )
  RETURNING id INTO v_run_id;

  IF v_status = 'matched' AND v_intent.status <> 'settled' THEN
    UPDATE public.payment_intents
    SET status = 'settled', updated_at = now()
    WHERE id = v_intent.id;
  END IF;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reconcile_payment_intent_from_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reconcile_payment_intent(NEW.payment_intent_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reconcile_payment_intent_after_settlement_event ON public.settlement_events;
CREATE TRIGGER reconcile_payment_intent_after_settlement_event
  AFTER INSERT OR UPDATE OF status, gross_amount, fee_amount ON public.settlement_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_reconcile_payment_intent_from_settlement();

-- 4) D+0 / D+1 closure + divergence report
CREATE OR REPLACE FUNCTION public.run_reconciliation_closure(
  p_tenant_id UUID,
  p_business_date DATE,
  p_rule public.reconciliation_closure_rule
)
RETURNS TABLE (
  reconciliation_run_id UUID,
  payment_intent_id UUID,
  status public.reconciliation_status,
  divergence_amount NUMERIC(18,2),
  divergence_reasons JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_start TIMESTAMPTZ;
  v_cutoff_end TIMESTAMPTZ;
  v_intent_id UUID;
  v_run_id UUID;
BEGIN
  v_cutoff_start := p_business_date::timestamptz;

  IF p_rule = 'D0' THEN
    v_cutoff_end := (p_business_date + INTERVAL '1 day')::timestamptz;
  ELSE
    v_cutoff_end := (p_business_date + INTERVAL '2 day')::timestamptz;
  END IF;

  FOR v_intent_id IN
    SELECT pi.id
    FROM public.payment_intents pi
    WHERE pi.tenant_id = p_tenant_id
      AND pi.created_at >= v_cutoff_start
      AND pi.created_at < v_cutoff_end
  LOOP
    v_run_id := public.reconcile_payment_intent(v_intent_id);

    UPDATE public.reconciliation_runs
    SET closure_rule = p_rule,
        business_date = p_business_date,
        run_metadata = run_metadata || jsonb_build_object('trigger', 'closure')
    WHERE id = v_run_id;

    RETURN QUERY
    SELECT rr.id, rr.payment_intent_id, rr.status, rr.divergence_amount, rr.divergence_reasons
    FROM public.reconciliation_runs rr
    WHERE rr.id = v_run_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE VIEW public.v_reconciliation_divergence_report AS
SELECT
  rr.tenant_id,
  rr.business_date,
  rr.closure_rule,
  rr.payment_intent_id,
  rr.status,
  rr.expected_amount,
  rr.bank_amount,
  rr.webhook_amount,
  rr.ledger_amount,
  rr.event_amount,
  rr.divergence_amount,
  rr.divergence_reasons,
  rr.executed_at
FROM public.reconciliation_runs rr
WHERE rr.status IN ('divergent', 'manual_review', 'error');

-- 5) Accounting entries generated from business events
CREATE OR REPLACE FUNCTION public.generate_accounting_entries_from_business_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC(18,2);
  v_currency TEXT;
  v_payment_intent_id UUID;
  v_source_account_id UUID;
  v_destination_account_id UUID;
BEGIN
  v_amount := COALESCE((NEW.payload ->> 'amount')::numeric, 0);
  v_currency := COALESCE(NEW.payload ->> 'currency', 'BRL');
  v_payment_intent_id := NULLIF(NEW.payload ->> 'payment_intent_id', '')::uuid;
  v_source_account_id := NULLIF(NEW.payload ->> 'source_cash_account_id', '')::uuid;
  v_destination_account_id := NULLIF(NEW.payload ->> 'destination_cash_account_id', '')::uuid;

  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.accounting_entries (
    tenant_id,
    business_event_id,
    payment_intent_id,
    entry_type,
    cash_account_id,
    counterparty_account_id,
    amount,
    currency,
    description,
    metadata
  ) VALUES
  (
    NEW.tenant_id,
    NEW.id,
    v_payment_intent_id,
    'debit',
    v_source_account_id,
    v_destination_account_id,
    v_amount,
    v_currency,
    format('Event %s debit entry', NEW.event_name),
    jsonb_build_object('event_name', NEW.event_name)
  ),
  (
    NEW.tenant_id,
    NEW.id,
    v_payment_intent_id,
    'credit',
    v_destination_account_id,
    v_source_account_id,
    v_amount,
    v_currency,
    format('Event %s credit entry', NEW.event_name),
    jsonb_build_object('event_name', NEW.event_name)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_accounting_entries_from_event ON public.business_events;
CREATE TRIGGER generate_accounting_entries_from_event
  AFTER INSERT ON public.business_events
  FOR EACH ROW EXECUTE FUNCTION public.generate_accounting_entries_from_business_event();

-- 6) Initial fiscal trail generated by operation type
CREATE OR REPLACE FUNCTION public.generate_tax_event_from_business_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_type public.tax_operation_type;
  v_taxable_base NUMERIC(18,2);
  v_tax_rate NUMERIC(9,6);
  v_tax_amount NUMERIC(18,2);
BEGIN
  v_operation_type := COALESCE(NULLIF(NEW.payload ->> 'operation_type', '')::public.tax_operation_type, 'other');
  v_taxable_base := COALESCE((NEW.payload ->> 'taxable_base')::numeric, COALESCE((NEW.payload ->> 'amount')::numeric, 0));
  v_tax_rate := COALESCE((NEW.payload ->> 'tax_rate')::numeric, 0);
  v_tax_amount := COALESCE((NEW.payload ->> 'tax_amount')::numeric, round(v_taxable_base * v_tax_rate, 2));

  INSERT INTO public.tax_events (
    tenant_id,
    business_event_id,
    deal_id,
    payment_intent_id,
    operation_type,
    operation_ref,
    tax_code,
    taxable_base,
    tax_rate,
    tax_amount,
    occurred_at,
    metadata
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    NEW.aggregate_id,
    NULLIF(NEW.payload ->> 'payment_intent_id', '')::uuid,
    v_operation_type,
    COALESCE(NEW.payload ->> 'operation_ref', NEW.correlation_id),
    NEW.payload ->> 'tax_code',
    v_taxable_base,
    v_tax_rate,
    v_tax_amount,
    NEW.occurred_at,
    jsonb_build_object('event_name', NEW.event_name)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_tax_event_from_business_event ON public.business_events;
CREATE TRIGGER generate_tax_event_from_business_event
  AFTER INSERT ON public.business_events
  FOR EACH ROW
  WHEN (
    NEW.payload ? 'operation_type'
    OR NEW.payload ? 'tax_code'
    OR NEW.payload ? 'taxable_base'
    OR NEW.payload ? 'tax_amount'
  )
  EXECUTE FUNCTION public.generate_tax_event_from_business_event();

-- 7) RLS + base policies
ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view cash accounts" ON public.cash_accounts;
CREATE POLICY "Authenticated can view cash accounts"
  ON public.cash_accounts FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage cash accounts" ON public.cash_accounts;
CREATE POLICY "Admins can manage cash accounts"
  ON public.cash_accounts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view payment intents" ON public.payment_intents;
CREATE POLICY "Authenticated can view payment intents"
  ON public.payment_intents FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage payment intents" ON public.payment_intents;
CREATE POLICY "Admins can manage payment intents"
  ON public.payment_intents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view settlement events" ON public.settlement_events;
CREATE POLICY "Authenticated can view settlement events"
  ON public.settlement_events FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage settlement events" ON public.settlement_events;
CREATE POLICY "Admins can manage settlement events"
  ON public.settlement_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view reconciliation runs" ON public.reconciliation_runs;
CREATE POLICY "Authenticated can view reconciliation runs"
  ON public.reconciliation_runs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage reconciliation runs" ON public.reconciliation_runs;
CREATE POLICY "Admins can manage reconciliation runs"
  ON public.reconciliation_runs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view accounting entries" ON public.accounting_entries;
CREATE POLICY "Authenticated can view accounting entries"
  ON public.accounting_entries FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage accounting entries" ON public.accounting_entries;
CREATE POLICY "Admins can manage accounting entries"
  ON public.accounting_entries FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view tax events" ON public.tax_events;
CREATE POLICY "Authenticated can view tax events"
  ON public.tax_events FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage tax events" ON public.tax_events;
CREATE POLICY "Admins can manage tax events"
  ON public.tax_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8) Updated-at triggers
DROP TRIGGER IF EXISTS update_cash_accounts_updated_at ON public.cash_accounts;
CREATE TRIGGER update_cash_accounts_updated_at
  BEFORE UPDATE ON public.cash_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_intents_updated_at ON public.payment_intents;
CREATE TRIGGER update_payment_intents_updated_at
  BEFORE UPDATE ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
