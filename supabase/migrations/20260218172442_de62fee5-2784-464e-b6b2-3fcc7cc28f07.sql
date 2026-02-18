
-- Drop permissive policies on products
DROP POLICY IF EXISTS "Authenticated can manage products" ON public.products;

-- Only admin/manager can manage products
CREATE POLICY "Admins can manage products"
ON public.products
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Keep SELECT open for all authenticated
-- (already exists: "Authenticated can view products")
