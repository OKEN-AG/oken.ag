
-- App role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'sales', 'distributor', 'client');
CREATE TYPE public.channel_segment AS ENUM ('direto', 'distribuidor', 'cooperativa');
CREATE TYPE public.campaign_target AS ENUM ('produtor', 'distribuidor', 'venda_direta');
CREATE TYPE public.price_list_format AS ENUM ('brl_vista', 'brl_prazo', 'usd_vista', 'usd_prazo', 'brl_vista_com_margem', 'brl_prazo_com_margem', 'usd_vista_com_margem', 'usd_prazo_com_margem');
CREATE TYPE public.payment_method AS ENUM ('brl', 'usd', 'barter');
CREATE TYPE public.operation_status AS ENUM ('simulacao', 'pedido', 'formalizado', 'garantido', 'faturado', 'monitorando', 'liquidado');
CREATE TYPE public.document_type AS ENUM ('termo_adesao', 'pedido', 'termo_barter', 'ccv', 'cessao_credito', 'cpr', 'duplicata', 'nota_comercial', 'hipoteca', 'alienacao_fiduciaria', 'certificado_aceite');
CREATE TYPE public.document_status AS ENUM ('pendente', 'emitido', 'assinado', 'validado');
CREATE TYPE public.commodity_type AS ENUM ('soja', 'milho', 'cafe', 'algodao');

-- 1. Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  company TEXT DEFAULT '',
  position TEXT DEFAULT '',
  channel_segment public.channel_segment DEFAULT 'direto',
  state TEXT DEFAULT '',
  city TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL DEFAULT 'client',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  target public.campaign_target NOT NULL DEFAULT 'produtor',
  eligible_states TEXT[] DEFAULT '{}',
  eligible_mesoregions TEXT[] DEFAULT '{}',
  eligible_cities TEXT[] DEFAULT '{}',
  eligible_distributor_segments public.channel_segment[] DEFAULT '{}',
  eligible_client_segments TEXT[] DEFAULT '{}',
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 1.5,
  exchange_rate_products NUMERIC(8,4) NOT NULL DEFAULT 5.45,
  exchange_rate_barter NUMERIC(8,4) NOT NULL DEFAULT 5.40,
  max_discount_internal NUMERIC(5,2) NOT NULL DEFAULT 8,
  max_discount_reseller NUMERIC(5,2) NOT NULL DEFAULT 5,
  price_list_format public.price_list_format NOT NULL DEFAULT 'usd_vista',
  active_modules TEXT[] DEFAULT '{}',
  available_due_dates DATE[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- 5. Channel margins (per campaign)
CREATE TABLE public.channel_margins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  segment public.channel_segment NOT NULL,
  margin_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, segment)
);
ALTER TABLE public.channel_margins ENABLE ROW LEVEL SECURITY;

-- 6. Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  active_ingredient TEXT DEFAULT '',
  unit_type TEXT NOT NULL DEFAULT 'l',
  package_sizes NUMERIC[] DEFAULT '{}',
  units_per_box INTEGER NOT NULL DEFAULT 4,
  boxes_per_pallet INTEGER NOT NULL DEFAULT 40,
  pallets_per_truck INTEGER NOT NULL DEFAULT 20,
  dose_per_hectare NUMERIC(8,4) NOT NULL DEFAULT 1,
  min_dose NUMERIC(8,4) NOT NULL DEFAULT 0.1,
  max_dose NUMERIC(8,4) NOT NULL DEFAULT 10,
  price_per_unit NUMERIC(12,4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  price_type TEXT NOT NULL DEFAULT 'vista',
  includes_margin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 7. Combos
CREATE TABLE public.combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;

-- 8. Combo product rules
CREATE TABLE public.combo_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID REFERENCES public.combos(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  min_dose_per_ha NUMERIC(8,4) NOT NULL DEFAULT 0,
  max_dose_per_ha NUMERIC(8,4) NOT NULL DEFAULT 100
);
ALTER TABLE public.combo_products ENABLE ROW LEVEL SECURITY;

-- 9. Commodity pricing
CREATE TABLE public.commodity_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  commodity public.commodity_type NOT NULL DEFAULT 'soja',
  exchange TEXT NOT NULL DEFAULT 'CBOT',
  contract TEXT NOT NULL DEFAULT 'K',
  exchange_price NUMERIC(10,4) NOT NULL DEFAULT 0,
  option_cost NUMERIC(10,4) DEFAULT 0,
  exchange_rate_bolsa NUMERIC(8,4) NOT NULL DEFAULT 5.40,
  exchange_rate_option NUMERIC(8,4) DEFAULT 5.40,
  basis_by_port JSONB DEFAULT '{}',
  security_delta_market NUMERIC(5,2) DEFAULT 2,
  security_delta_freight NUMERIC(5,2) DEFAULT 15,
  stop_loss NUMERIC(10,4) DEFAULT 0,
  volatility NUMERIC(5,2) DEFAULT 25,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.commodity_pricing ENABLE ROW LEVEL SECURITY;

-- 10. Freight reducers
CREATE TABLE public.freight_reducers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  distance_km NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_per_km NUMERIC(6,4) NOT NULL DEFAULT 0.10,
  adjustment NUMERIC(10,2) DEFAULT 0,
  total_reducer NUMERIC(10,2) NOT NULL DEFAULT 0
);
ALTER TABLE public.freight_reducers ENABLE ROW LEVEL SECURITY;

-- 11. Operations (main order/simulation entity)
CREATE TABLE public.operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  status public.operation_status NOT NULL DEFAULT 'simulacao',
  channel public.channel_segment NOT NULL DEFAULT 'distribuidor',
  client_name TEXT NOT NULL DEFAULT '',
  client_document TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  distributor_id UUID REFERENCES auth.users(id),
  payment_method public.payment_method DEFAULT 'barter',
  due_date DATE,
  due_months INTEGER DEFAULT 12,
  area_hectares NUMERIC(12,2) DEFAULT 0,
  gross_revenue NUMERIC(14,2) DEFAULT 0,
  combo_discount NUMERIC(14,2) DEFAULT 0,
  barter_discount NUMERIC(14,2) DEFAULT 0,
  net_revenue NUMERIC(14,2) DEFAULT 0,
  financial_revenue NUMERIC(14,2) DEFAULT 0,
  distributor_margin NUMERIC(14,2) DEFAULT 0,
  total_sacas NUMERIC(12,2) DEFAULT 0,
  commodity public.commodity_type DEFAULT 'soja',
  commodity_price NUMERIC(10,4) DEFAULT 0,
  reference_price NUMERIC(10,4) DEFAULT 0,
  has_existing_contract BOOLEAN DEFAULT false,
  counterparty TEXT DEFAULT '',
  insurance_premium_sacas NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;

-- 12. Operation items (products in an operation)
CREATE TABLE public.operation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID REFERENCES public.operations(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  dose_per_hectare NUMERIC(8,4) NOT NULL DEFAULT 1,
  raw_quantity NUMERIC(12,4) DEFAULT 0,
  rounded_quantity NUMERIC(12,4) DEFAULT 0,
  boxes INTEGER DEFAULT 0,
  pallets INTEGER DEFAULT 0,
  base_price NUMERIC(12,4) DEFAULT 0,
  normalized_price NUMERIC(12,4) DEFAULT 0,
  interest_component NUMERIC(12,4) DEFAULT 0,
  margin_component NUMERIC(12,4) DEFAULT 0,
  subtotal NUMERIC(14,2) DEFAULT 0
);
ALTER TABLE public.operation_items ENABLE ROW LEVEL SECURITY;

-- 13. Operation documents
CREATE TABLE public.operation_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID REFERENCES public.operations(id) ON DELETE CASCADE NOT NULL,
  doc_type public.document_type NOT NULL,
  status public.document_status NOT NULL DEFAULT 'pendente',
  data JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.operation_documents ENABLE ROW LEVEL SECURITY;

-- 14. Operation logs (audit trail)
CREATE TABLE public.operation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID REFERENCES public.operations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;

-- ========== RLS POLICIES ==========

-- Profiles: users see/edit own profile, admins see all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- User roles: only admins manage, users can read own
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Campaigns: readable by all authenticated, writable by admin/manager
CREATE POLICY "Authenticated can view active campaigns" ON public.campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage campaigns" ON public.campaigns FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Channel margins: same as campaigns
CREATE POLICY "Authenticated can view margins" ON public.channel_margins FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage margins" ON public.channel_margins FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Products: readable by all authenticated, writable by admin
CREATE POLICY "Authenticated can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Combos: readable by all authenticated
CREATE POLICY "Authenticated can view combos" ON public.combos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage combos" ON public.combos FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Combo products: same
CREATE POLICY "Authenticated can view combo products" ON public.combo_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage combo products" ON public.combo_products FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Commodity pricing: readable by all authenticated
CREATE POLICY "Authenticated can view commodity pricing" ON public.commodity_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage commodity pricing" ON public.commodity_pricing FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Freight reducers: readable by all authenticated
CREATE POLICY "Authenticated can view freight reducers" ON public.freight_reducers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage freight reducers" ON public.freight_reducers FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Operations: users see own, admins/managers see all
CREATE POLICY "Users can view own operations" ON public.operations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create operations" ON public.operations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own operations" ON public.operations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all operations" ON public.operations FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Operation items: through operation ownership
CREATE POLICY "Users can view own operation items" ON public.operation_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.operations WHERE id = operation_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert own operation items" ON public.operation_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.operations WHERE id = operation_id AND user_id = auth.uid())
);
CREATE POLICY "Admins can view all operation items" ON public.operation_items FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Operation documents: through operation ownership
CREATE POLICY "Users can view own operation docs" ON public.operation_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.operations WHERE id = operation_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert own operation docs" ON public.operation_documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.operations WHERE id = operation_id AND user_id = auth.uid())
);
CREATE POLICY "Admins can view all operation docs" ON public.operation_documents FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Operation logs: through operation ownership
CREATE POLICY "Users can view own operation logs" ON public.operation_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.operations WHERE id = operation_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert own operation logs" ON public.operation_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all logs" ON public.operation_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ========== TRIGGERS ==========

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_operations_updated_at BEFORE UPDATE ON public.operations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
