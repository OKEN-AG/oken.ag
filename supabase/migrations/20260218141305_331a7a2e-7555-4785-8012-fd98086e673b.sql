
-- Fix combos: allow all authenticated users to manage
DROP POLICY IF EXISTS "Admins can manage combos" ON public.combos;
CREATE POLICY "Authenticated can manage combos"
  ON public.combos FOR ALL
  USING (true)
  WITH CHECK (true);

-- Fix combo_products: allow all authenticated users to manage
DROP POLICY IF EXISTS "Admins can manage combo products" ON public.combo_products;
CREATE POLICY "Authenticated can manage combo_products"
  ON public.combo_products FOR ALL
  USING (true)
  WITH CHECK (true);

-- Fix products: allow all authenticated users to manage
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Authenticated can manage products"
  ON public.products FOR ALL
  USING (true)
  WITH CHECK (true);
