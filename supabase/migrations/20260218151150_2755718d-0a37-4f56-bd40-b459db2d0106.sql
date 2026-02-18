
-- ============================================================
-- FIX 1: Tighten RLS on campaigns table
-- ============================================================
-- Remove overly permissive policy
DROP POLICY IF EXISTS "Authenticated can manage campaigns" ON public.campaigns;

-- Keep admin/manager manage policy (already exists)
-- Keep authenticated SELECT policy (already exists)

-- Add INSERT for authenticated (must set created_by)
CREATE POLICY "Authenticated can create campaigns"
  ON public.campaigns FOR INSERT
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Add UPDATE for owner or admin/manager
CREATE POLICY "Owner or admin can update campaigns"
  ON public.campaigns FOR UPDATE
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Add DELETE for admin only
CREATE POLICY "Admin can delete campaigns"
  ON public.campaigns FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- FIX 2: Tighten RLS on campaign sub-tables
-- Use campaign ownership check via created_by
-- ============================================================

-- Helper function for campaign ownership
CREATE OR REPLACE FUNCTION public.can_manage_campaign(_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE id = _campaign_id
    AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
$$;

-- campaign_clients
DROP POLICY IF EXISTS "Auth manage campaign_clients" ON public.campaign_clients;
CREATE POLICY "Read campaign_clients"
  ON public.campaign_clients FOR SELECT
  USING (public.can_manage_campaign(campaign_id));
CREATE POLICY "Manage campaign_clients"
  ON public.campaign_clients FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- campaign_payment_methods
DROP POLICY IF EXISTS "Auth manage campaign_payment_methods" ON public.campaign_payment_methods;
CREATE POLICY "Read campaign_payment_methods"
  ON public.campaign_payment_methods FOR SELECT
  USING (public.can_manage_campaign(campaign_id));
CREATE POLICY "Manage campaign_payment_methods"
  ON public.campaign_payment_methods FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- campaign_segments
DROP POLICY IF EXISTS "Auth manage campaign_segments" ON public.campaign_segments;
CREATE POLICY "Read campaign_segments"
  ON public.campaign_segments FOR SELECT
  USING (public.can_manage_campaign(campaign_id));
CREATE POLICY "Manage campaign_segments"
  ON public.campaign_segments FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- campaign_due_dates
DROP POLICY IF EXISTS "Auth manage campaign_due_dates" ON public.campaign_due_dates;
CREATE POLICY "Read campaign_due_dates"
  ON public.campaign_due_dates FOR SELECT
  USING (public.can_manage_campaign(campaign_id));
CREATE POLICY "Manage campaign_due_dates"
  ON public.campaign_due_dates FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- campaign_commodity_valorizations
DROP POLICY IF EXISTS "Auth manage campaign_commodity_valorizations" ON public.campaign_commodity_valorizations;
CREATE POLICY "Read campaign_commodity_valorizations"
  ON public.campaign_commodity_valorizations FOR SELECT
  USING (public.can_manage_campaign(campaign_id));
CREATE POLICY "Manage campaign_commodity_valorizations"
  ON public.campaign_commodity_valorizations FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- campaign_buyers
DROP POLICY IF EXISTS "Auth manage campaign_buyers" ON public.campaign_buyers;
CREATE POLICY "Read campaign_buyers"
  ON public.campaign_buyers FOR SELECT
  USING (public.can_manage_campaign(campaign_id));
CREATE POLICY "Manage campaign_buyers"
  ON public.campaign_buyers FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- campaign_delivery_locations
DROP POLICY IF EXISTS "Auth manage campaign_delivery_locations" ON public.campaign_delivery_locations;
CREATE POLICY "Read campaign_delivery_locations"
  ON public.campaign_delivery_locations FOR SELECT
  USING (public.can_manage_campaign(campaign_id));
CREATE POLICY "Manage campaign_delivery_locations"
  ON public.campaign_delivery_locations FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- campaign_indicative_prices
DROP POLICY IF EXISTS "Auth manage campaign_indicative_prices" ON public.campaign_indicative_prices;
CREATE POLICY "Read campaign_indicative_prices"
  ON public.campaign_indicative_prices FOR SELECT
  USING (public.can_manage_campaign(campaign_id));
CREATE POLICY "Manage campaign_indicative_prices"
  ON public.campaign_indicative_prices FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- campaign_products
DROP POLICY IF EXISTS "Authenticated can manage campaign_products" ON public.campaign_products;
CREATE POLICY "Read campaign_products"
  ON public.campaign_products FOR SELECT
  USING (public.can_manage_campaign(campaign_id));
CREATE POLICY "Manage campaign_products"
  ON public.campaign_products FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- ============================================================
-- FIX 3: Tighten combos & combo_products
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can manage combos" ON public.combos;
-- Keep SELECT policy
CREATE POLICY "Manage combos"
  ON public.combos FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

DROP POLICY IF EXISTS "Authenticated can manage combo_products" ON public.combo_products;
-- Keep SELECT policy
CREATE POLICY "Manage combo_products"
  ON public.combo_products FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.combos c WHERE c.id = combo_id AND public.can_manage_campaign(c.campaign_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.combos c WHERE c.id = combo_id AND public.can_manage_campaign(c.campaign_id)
  ));

-- ============================================================
-- FIX 4: Tighten products - read all, write admin/manager only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can manage products" ON public.products;
CREATE POLICY "Admin/manager can manage products"
  ON public.products FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- ============================================================
-- FIX 5: Tighten channel_margins
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can manage margins" ON public.channel_margins;
CREATE POLICY "Manage margins"
  ON public.channel_margins FOR ALL
  USING (public.can_manage_campaign(campaign_id))
  WITH CHECK (public.can_manage_campaign(campaign_id));

-- ============================================================
-- FIX 6: Add missing UPDATE/DELETE on operation_items & operation_documents
-- ============================================================
CREATE POLICY "Users can update own operation items"
  ON public.operation_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.operations WHERE id = operation_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own operation items"
  ON public.operation_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.operations WHERE id = operation_id AND user_id = auth.uid()
    AND status = 'simulacao'
  ));

CREATE POLICY "Users can update own operation docs"
  ON public.operation_documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.operations WHERE id = operation_id AND user_id = auth.uid()
  ));

-- ============================================================
-- FIX 7: Business logic validation triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_campaign_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.interest_rate < 0 OR NEW.interest_rate > 100 THEN
    RAISE EXCEPTION 'interest_rate must be between 0 and 100';
  END IF;
  IF NEW.max_discount_internal < 0 OR NEW.max_discount_internal > 100 THEN
    RAISE EXCEPTION 'max_discount_internal must be between 0 and 100';
  END IF;
  IF NEW.max_discount_reseller < 0 OR NEW.max_discount_reseller > 100 THEN
    RAISE EXCEPTION 'max_discount_reseller must be between 0 and 100';
  END IF;
  IF NEW.exchange_rate_products <= 0 THEN
    RAISE EXCEPTION 'exchange_rate_products must be positive';
  END IF;
  IF NEW.exchange_rate_barter <= 0 THEN
    RAISE EXCEPTION 'exchange_rate_barter must be positive';
  END IF;
  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL AND NEW.start_date > NEW.end_date THEN
    RAISE EXCEPTION 'start_date must be before end_date';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_campaign_before_save
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_data();

CREATE OR REPLACE FUNCTION public.validate_combo_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.discount_percent < 0 OR NEW.discount_percent > 100 THEN
    RAISE EXCEPTION 'discount_percent must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_combo_before_save
  BEFORE INSERT OR UPDATE ON public.combos
  FOR EACH ROW EXECUTE FUNCTION public.validate_combo_data();

CREATE OR REPLACE FUNCTION public.validate_product_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.price_per_unit < 0 THEN
    RAISE EXCEPTION 'price_per_unit must be non-negative';
  END IF;
  IF NEW.dose_per_hectare <= 0 THEN
    RAISE EXCEPTION 'dose_per_hectare must be positive';
  END IF;
  IF NEW.min_dose < 0 THEN
    RAISE EXCEPTION 'min_dose must be non-negative';
  END IF;
  IF NEW.max_dose < NEW.min_dose THEN
    RAISE EXCEPTION 'max_dose must be >= min_dose';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_product_before_save
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_data();

CREATE OR REPLACE FUNCTION public.validate_channel_margin_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.margin_percent < 0 OR NEW.margin_percent > 100 THEN
    RAISE EXCEPTION 'margin_percent must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_channel_margin_before_save
  BEFORE INSERT OR UPDATE ON public.channel_margins
  FOR EACH ROW EXECUTE FUNCTION public.validate_channel_margin_data();
