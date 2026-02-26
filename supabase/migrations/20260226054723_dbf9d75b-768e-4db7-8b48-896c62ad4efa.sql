
ALTER TABLE public.campaign_distributors
ADD COLUMN IF NOT EXISTS channel_type text NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
