
-- Table to link products to campaigns (many-to-many)
CREATE TABLE public.campaign_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, product_id)
);

ALTER TABLE public.campaign_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage campaign_products"
  ON public.campaign_products FOR ALL
  USING (true) WITH CHECK (true);
