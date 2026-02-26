
-- Table for channel types (B2B, B2C, B2B2C + free text) per campaign
CREATE TABLE public.campaign_channel_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  channel_type_name text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '', -- B2B, B2C, B2B2C
  active boolean NOT NULL DEFAULT true,
  price_adjustment_percent numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.campaign_channel_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage campaign_channel_types"
  ON public.campaign_channel_types FOR ALL
  USING (can_manage_campaign(campaign_id))
  WITH CHECK (can_manage_campaign(campaign_id));

CREATE POLICY "Read campaign_channel_types"
  ON public.campaign_channel_types FOR SELECT
  USING (can_manage_campaign(campaign_id));

-- Add channel_type column to campaign_channel_segments
ALTER TABLE public.campaign_channel_segments 
  ADD COLUMN channel_type text NOT NULL DEFAULT '';
