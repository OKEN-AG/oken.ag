
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS code text DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ref text DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_cash numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_term numeric DEFAULT 0;
