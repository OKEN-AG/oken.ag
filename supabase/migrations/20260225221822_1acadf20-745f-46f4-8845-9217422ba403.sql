-- Allow users who can manage a campaign to also insert/update products
-- (needed for product import flow)
CREATE POLICY "Sales can manage products"
ON public.products
FOR ALL
USING (
  has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'distributor'::app_role)
  OR has_role(auth.uid(), 'client'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'distributor'::app_role)
  OR has_role(auth.uid(), 'client'::app_role)
);