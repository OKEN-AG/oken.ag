-- Common Core expansion: instruments, collaterals, positions, pools, offers, investor_orders, cash_accounts
-- Adds tenant-aware lifecycle entities with temporal trail, idempotency and explicit core relationships.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'instrument_status') THEN
    CREATE TYPE public.instrument_status AS ENUM ('draft', 'active', 'matured', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collateral_status') THEN
    CREATE TYPE public.collateral_status AS ENUM ('proposed', 'perfected', 'released', 'executed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'position_status') THEN
    CREATE TYPE public.position_status AS ENUM ('open', 'partially_closed', 'closed', 'liquidated', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pool_status') THEN
    CREATE TYPE public.pool_status AS ENUM ('draft', 'active', 'suspended', 'closed', 'archived');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_status') THEN
    CREATE TYPE public.offer_status AS ENUM ('draft', 'published', 'partially_subscribed', 'subscribed', 'withdrawn', 'expired', 'closed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'investor_order_status') THEN
    CREATE TYPE public.investor_order_status AS ENUM ('pending', 'confirmed', 'allocated', 'partially_allocated', 'cancelled', 'rejected', 'settled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cash_account_status') THEN
    CREATE TYPE public.cash_account_status AS ENUM ('pending', 'active', 'blocked', 'closed');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  issuer_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  status public.instrument_status NOT NULL DEFAULT 'draft',
  instrument_type TEXT NOT NULL,
  code TEXT,
  external_ref TEXT,
  notional_amount NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  maturity_date DATE,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT instruments_notional_amount_non_negative_ck CHECK (notional_amount IS NULL OR notional_amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.collaterals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  provider_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  beneficiary_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  status public.collateral_status NOT NULL DEFAULT 'proposed',
  collateral_type TEXT NOT NULL,
  reference_code TEXT,
  description TEXT,
  secured_amount NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT collaterals_secured_amount_non_negative_ck CHECK (secured_amount IS NULL OR secured_amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE SET NULL,
  status public.position_status NOT NULL DEFAULT 'open',
  quantity NUMERIC(20,6),
  gross_amount NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  position_date DATE NOT NULL DEFAULT CURRENT_DATE,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT positions_quantity_non_negative_ck CHECK (quantity IS NULL OR quantity >= 0),
  CONSTRAINT positions_gross_amount_non_negative_ck CHECK (gross_amount IS NULL OR gross_amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  manager_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  status public.pool_status NOT NULL DEFAULT 'draft',
  code TEXT,
  name TEXT NOT NULL,
  target_amount NUMERIC(18,2),
  current_amount NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pools_target_amount_non_negative_ck CHECK (target_amount IS NULL OR target_amount >= 0),
  CONSTRAINT pools_current_amount_non_negative_ck CHECK (current_amount IS NULL OR current_amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  pool_id UUID REFERENCES public.pools(id) ON DELETE SET NULL,
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE SET NULL,
  status public.offer_status NOT NULL DEFAULT 'draft',
  offer_code TEXT,
  offered_amount NUMERIC(18,2),
  min_ticket NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT offers_offered_amount_non_negative_ck CHECK (offered_amount IS NULL OR offered_amount >= 0),
  CONSTRAINT offers_min_ticket_non_negative_ck CHECK (min_ticket IS NULL OR min_ticket >= 0)
);

CREATE TABLE IF NOT EXISTS public.investor_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  investor_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  pool_id UUID REFERENCES public.pools(id) ON DELETE SET NULL,
  status public.investor_order_status NOT NULL DEFAULT 'pending',
  external_order_id TEXT,
  order_amount NUMERIC(18,2) NOT NULL,
  allocated_amount NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT investor_orders_amount_non_negative_ck CHECK (order_amount >= 0 AND (allocated_amount IS NULL OR allocated_amount >= 0))
);

CREATE TABLE IF NOT EXISTS public.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  status public.cash_account_status NOT NULL DEFAULT 'pending',
  account_role TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  bank_code TEXT,
  branch_code TEXT,
  account_number TEXT,
  currency TEXT NOT NULL DEFAULT 'BRL',
  available_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  blocked_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cash_accounts_balances_non_negative_ck CHECK (available_balance >= 0 AND blocked_balance >= 0)
);

-- Canonical lifecycle query index
CREATE INDEX IF NOT EXISTS instruments_tenant_status_created_idx ON public.instruments (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS collaterals_tenant_status_created_idx ON public.collaterals (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS positions_tenant_status_created_idx ON public.positions (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pools_tenant_status_created_idx ON public.pools (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_tenant_status_created_idx ON public.offers (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS investor_orders_tenant_status_created_idx ON public.investor_orders (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cash_accounts_tenant_status_created_idx ON public.cash_accounts (tenant_id, status, created_at DESC);

-- Business uniqueness + idempotency
CREATE UNIQUE INDEX IF NOT EXISTS instruments_tenant_program_code_ux
  ON public.instruments (tenant_id, program_id, code)
  WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS instruments_tenant_external_ref_ux
  ON public.instruments (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS instruments_tenant_idempotency_ux
  ON public.instruments (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS collaterals_tenant_deal_reference_code_ux
  ON public.collaterals (tenant_id, deal_id, reference_code)
  WHERE reference_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS collaterals_tenant_idempotency_ux
  ON public.collaterals (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS positions_tenant_instrument_party_date_ux
  ON public.positions (tenant_id, instrument_id, party_id, position_date);
CREATE UNIQUE INDEX IF NOT EXISTS positions_tenant_idempotency_ux
  ON public.positions (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pools_tenant_program_code_ux
  ON public.pools (tenant_id, program_id, code)
  WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pools_tenant_idempotency_ux
  ON public.pools (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_tenant_pool_offer_code_ux
  ON public.offers (tenant_id, pool_id, offer_code)
  WHERE offer_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS offers_tenant_idempotency_ux
  ON public.offers (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investor_orders_tenant_offer_external_order_ux
  ON public.investor_orders (tenant_id, offer_id, external_order_id)
  WHERE external_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS investor_orders_tenant_idempotency_ux
  ON public.investor_orders (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cash_accounts_tenant_provider_account_ux
  ON public.cash_accounts (tenant_id, provider_name, provider_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS cash_accounts_tenant_idempotency_ux
  ON public.cash_accounts (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- updated_at automation
DROP TRIGGER IF EXISTS update_instruments_updated_at ON public.instruments;
CREATE TRIGGER update_instruments_updated_at
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_collaterals_updated_at ON public.collaterals;
CREATE TRIGGER update_collaterals_updated_at
  BEFORE UPDATE ON public.collaterals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_positions_updated_at ON public.positions;
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_pools_updated_at ON public.pools;
CREATE TRIGGER update_pools_updated_at
  BEFORE UPDATE ON public.pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_offers_updated_at ON public.offers;
CREATE TRIGGER update_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_investor_orders_updated_at ON public.investor_orders;
CREATE TRIGGER update_investor_orders_updated_at
  BEFORE UPDATE ON public.investor_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_cash_accounts_updated_at ON public.cash_accounts;
CREATE TRIGGER update_cash_accounts_updated_at
  BEFORE UPDATE ON public.cash_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS posture aligned to tenant-aware core tables
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaterals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view instruments"
  ON public.instruments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can insert instruments"
  ON public.instruments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can update instruments"
  ON public.instruments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins can delete instruments"
  ON public.instruments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant users can view collaterals"
  ON public.collaterals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can insert collaterals"
  ON public.collaterals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can update collaterals"
  ON public.collaterals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins can delete collaterals"
  ON public.collaterals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant users can view positions"
  ON public.positions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can insert positions"
  ON public.positions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can update positions"
  ON public.positions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins can delete positions"
  ON public.positions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant users can view pools"
  ON public.pools FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can insert pools"
  ON public.pools FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can update pools"
  ON public.pools FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins can delete pools"
  ON public.pools FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant users can view offers"
  ON public.offers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can insert offers"
  ON public.offers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can update offers"
  ON public.offers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins can delete offers"
  ON public.offers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant users can view investor_orders"
  ON public.investor_orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can insert investor_orders"
  ON public.investor_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can update investor_orders"
  ON public.investor_orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins can delete investor_orders"
  ON public.investor_orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant users can view cash_accounts"
  ON public.cash_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can insert cash_accounts"
  ON public.cash_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can update cash_accounts"
  ON public.cash_accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins can delete cash_accounts"
  ON public.cash_accounts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
