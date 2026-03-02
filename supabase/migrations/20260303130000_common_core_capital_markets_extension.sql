-- Common Core capital-markets extension (Phase 2)
-- Adds canonical entities for instruments, collateral, positions, pools, offers, investor orders and cash accounts.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'instrument_status') THEN
    CREATE TYPE public.instrument_status AS ENUM ('draft', 'active', 'suspended', 'matured', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collateral_status') THEN
    CREATE TYPE public.collateral_status AS ENUM ('registered', 'validated', 'released', 'foreclosed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'position_status') THEN
    CREATE TYPE public.position_status AS ENUM ('pending', 'open', 'partially_closed', 'closed', 'defaulted');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pool_status') THEN
    CREATE TYPE public.pool_status AS ENUM ('draft', 'active', 'rebalancing', 'closed', 'archived');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_status') THEN
    CREATE TYPE public.offer_status AS ENUM ('draft', 'open', 'partially_filled', 'filled', 'cancelled', 'expired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'allocated', 'settled', 'cancelled', 'rejected');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cash_account_status') THEN
    CREATE TYPE public.cash_account_status AS ENUM ('active', 'blocked', 'closed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  instrument_code TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  status public.instrument_status NOT NULL DEFAULT 'draft',
  currency TEXT NOT NULL DEFAULT 'BRL',
  notional_amount NUMERIC(18,2) CHECK (notional_amount IS NULL OR notional_amount >= 0),
  issued_at TIMESTAMPTZ,
  maturity_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, instrument_code)
);

CREATE TABLE IF NOT EXISTS public.collaterals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE SET NULL,
  collateral_ref TEXT NOT NULL,
  collateral_type TEXT NOT NULL,
  status public.collateral_status NOT NULL DEFAULT 'registered',
  appraised_value NUMERIC(18,2) CHECK (appraised_value IS NULL OR appraised_value >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, collateral_ref)
);

CREATE TABLE IF NOT EXISTS public.pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  pool_code TEXT NOT NULL,
  name TEXT NOT NULL,
  status public.pool_status NOT NULL DEFAULT 'draft',
  target_size NUMERIC(18,2) CHECK (target_size IS NULL OR target_size >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pool_code)
);

CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  pool_id UUID REFERENCES public.pools(id) ON DELETE SET NULL,
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE SET NULL,
  offer_code TEXT NOT NULL,
  status public.offer_status NOT NULL DEFAULT 'draft',
  offered_amount NUMERIC(18,2) NOT NULL CHECK (offered_amount >= 0),
  min_ticket NUMERIC(18,2) CHECK (min_ticket IS NULL OR min_ticket >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, offer_code)
);

CREATE TABLE IF NOT EXISTS public.investor_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  investor_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  order_code TEXT NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending',
  ordered_amount NUMERIC(18,2) NOT NULL CHECK (ordered_amount >= 0),
  allocated_amount NUMERIC(18,2) CHECK (allocated_amount IS NULL OR allocated_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_code)
);

CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE SET NULL,
  investor_order_id UUID REFERENCES public.investor_orders(id) ON DELETE SET NULL,
  holder_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  position_ref TEXT NOT NULL,
  status public.position_status NOT NULL DEFAULT 'pending',
  quantity NUMERIC(20,8) NOT NULL CHECK (quantity >= 0),
  unit_price NUMERIC(18,8) CHECK (unit_price IS NULL OR unit_price >= 0),
  gross_value NUMERIC(18,2) CHECK (gross_value IS NULL OR gross_value >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, position_ref)
);

CREATE TABLE IF NOT EXISTS public.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  owner_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  account_ref TEXT NOT NULL,
  status public.cash_account_status NOT NULL DEFAULT 'active',
  currency TEXT NOT NULL DEFAULT 'BRL',
  balance NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  available_balance NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, account_ref)
);

-- Tenant/status/created_at indexes
CREATE INDEX IF NOT EXISTS instruments_tenant_status_created_idx ON public.instruments (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS collaterals_tenant_status_created_idx ON public.collaterals (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pools_tenant_status_created_idx ON public.pools (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_tenant_status_created_idx ON public.offers (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS investor_orders_tenant_status_created_idx ON public.investor_orders (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS positions_tenant_status_created_idx ON public.positions (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cash_accounts_tenant_status_created_idx ON public.cash_accounts (tenant_id, status, created_at DESC);

-- Explicit deal/program relationship lookup helpers
CREATE INDEX IF NOT EXISTS instruments_program_deal_idx ON public.instruments (program_id, deal_id);
CREATE INDEX IF NOT EXISTS collaterals_program_deal_idx ON public.collaterals (program_id, deal_id);
CREATE INDEX IF NOT EXISTS pools_program_deal_idx ON public.pools (program_id, deal_id);
CREATE INDEX IF NOT EXISTS offers_program_deal_idx ON public.offers (program_id, deal_id);
CREATE INDEX IF NOT EXISTS investor_orders_program_deal_idx ON public.investor_orders (program_id, deal_id);
CREATE INDEX IF NOT EXISTS positions_program_deal_idx ON public.positions (program_id, deal_id);
CREATE INDEX IF NOT EXISTS cash_accounts_program_deal_idx ON public.cash_accounts (program_id, deal_id);

-- Idempotency constraints where write retries are expected
CREATE UNIQUE INDEX IF NOT EXISTS investor_orders_idempotency_ux
  ON public.investor_orders (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cash_accounts_idempotency_ux
  ON public.cash_accounts (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Row-level security posture
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaterals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_instruments_updated_at ON public.instruments;
CREATE TRIGGER update_instruments_updated_at
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_collaterals_updated_at ON public.collaterals;
CREATE TRIGGER update_collaterals_updated_at
  BEFORE UPDATE ON public.collaterals
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

DROP TRIGGER IF EXISTS update_positions_updated_at ON public.positions;
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_cash_accounts_updated_at ON public.cash_accounts;
CREATE TRIGGER update_cash_accounts_updated_at
  BEFORE UPDATE ON public.cash_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tenant-aware policies
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

CREATE POLICY "Tenant users can view investor orders"
  ON public.investor_orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can insert investor orders"
  ON public.investor_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can update investor orders"
  ON public.investor_orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins can delete investor orders"
  ON public.investor_orders FOR DELETE TO authenticated
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

CREATE POLICY "Tenant users can view cash accounts"
  ON public.cash_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can insert cash accounts"
  ON public.cash_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant users can update cash accounts"
  ON public.cash_accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins can delete cash accounts"
  ON public.cash_accounts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
