
-- Allow any authenticated user to manage products (catalog items)
-- Real access control is on campaign_products junction table
DROP POLICY IF EXISTS "Admin/manager can manage products" ON public.products;

CREATE POLICY "Authenticated can manage products"
ON public.products
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
