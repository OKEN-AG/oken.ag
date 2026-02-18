-- Drop the restrictive admin-only ALL policy
DROP POLICY IF EXISTS "Admins can manage commodity pricing" ON public.commodity_pricing;

-- Create a broader management policy using can_manage_campaign
CREATE POLICY "Manage commodity_pricing"
ON public.commodity_pricing FOR ALL
TO authenticated
USING (can_manage_campaign(campaign_id))
WITH CHECK (can_manage_campaign(campaign_id));

-- Also fix freight_reducers with same pattern
DROP POLICY IF EXISTS "Admins can manage freight reducers" ON public.freight_reducers;

CREATE POLICY "Manage freight_reducers"
ON public.freight_reducers FOR ALL
TO authenticated
USING (can_manage_campaign(campaign_id))
WITH CHECK (can_manage_campaign(campaign_id));