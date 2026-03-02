import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useActiveCampaigns } from '@/hooks/useActiveCampaign';

const DEFAULT_TENANT = 'empresa-padrao';

export function useNavigationContext() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: activeCampaigns = [] } = useActiveCampaigns();

  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const tenantId = search.get('tenant') || DEFAULT_TENANT;
  const campaignId = search.get('campaign') || activeCampaigns[0]?.id || '';

  const withContext = (path: string) => {
    const params = new URLSearchParams();
    params.set('tenant', tenantId);
    if (campaignId) params.set('campaign', campaignId);
    return `${path}?${params.toString()}`;
  };

  const setCampaign = (nextCampaignId: string) => {
    const params = new URLSearchParams(location.search);
    params.set('tenant', tenantId);
    params.set('campaign', nextCampaignId);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  return {
    tenantId,
    campaignId,
    campaigns: activeCampaigns,
    withContext,
    setCampaign,
    hasFullContext: Boolean(tenantId && campaignId),
  };
}
