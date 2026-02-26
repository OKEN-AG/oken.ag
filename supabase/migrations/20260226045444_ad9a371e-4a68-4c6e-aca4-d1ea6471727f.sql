
-- Table for channel segments (distributor classification → margin)
CREATE TABLE public.campaign_channel_segments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  channel_segment_name text NOT NULL DEFAULT '',
  margin_percent numeric NOT NULL DEFAULT 0,
  price_adjustment_percent numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.campaign_channel_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage campaign_channel_segments"
  ON public.campaign_channel_segments FOR ALL
  USING (can_manage_campaign(campaign_id))
  WITH CHECK (can_manage_campaign(campaign_id));

CREATE POLICY "Read campaign_channel_segments"
  ON public.campaign_channel_segments FOR SELECT
  USING (can_manage_campaign(campaign_id));

-- Table for distributors whitelist
CREATE TABLE public.campaign_distributors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  short_name text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  channel_segment_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.campaign_distributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage campaign_distributors"
  ON public.campaign_distributors FOR ALL
  USING (can_manage_campaign(campaign_id))
  WITH CHECK (can_manage_campaign(campaign_id));

CREATE POLICY "Read campaign_distributors"
  ON public.campaign_distributors FOR SELECT
  USING (can_manage_campaign(campaign_id));

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
