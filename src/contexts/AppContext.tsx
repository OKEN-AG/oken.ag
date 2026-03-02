import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveCampaigns } from '@/hooks/useActiveCampaign';

const ACTIVE_TENANT_STORAGE_KEY = 'app.activeTenantId';
const ACTIVE_CAMPAIGN_STORAGE_KEY = 'app.activeCampaignId';

type CampaignLite = {
  id: string;
  company_name: string | null;
  name: string;
};

interface AppContextType {
  isResolving: boolean;
  tenantId: string | null;
  campaignId: string | null;
  tenants: string[];
  campaigns: CampaignLite[];
  setTenantId: (tenantId: string | null) => void;
  setCampaignId: (campaignId: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const defaultContext: AppContextType = {
  isResolving: false,
  tenantId: null,
  campaignId: null,
  tenants: [],
  campaigns: [],
  setTenantId: () => {},
  setCampaignId: () => {},
};

export function AppContextResolver({ children }: { children: ReactNode }) {
  const { data: activeCampaigns, isLoading } = useActiveCampaigns();
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [campaignId, setCampaignIdState] = useState<string | null>(null);

  const campaigns = useMemo(() => (activeCampaigns || []).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    company_name: campaign.company_name,
  })), [activeCampaigns]);

  const tenants = useMemo(() => {
    const unique = new Set<string>();
    campaigns.forEach((campaign) => {
      if (campaign.company_name) unique.add(campaign.company_name);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [campaigns]);

  useEffect(() => {
    if (!isLoading) {
      const storedTenant = window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
      const storedCampaign = window.localStorage.getItem(ACTIVE_CAMPAIGN_STORAGE_KEY);

      const tenantExists = storedTenant ? tenants.includes(storedTenant) : false;
      setTenantIdState(tenantExists ? storedTenant : null);

      const campaignExists = storedCampaign
        ? campaigns.some((campaign) => campaign.id === storedCampaign)
        : false;
      setCampaignIdState(campaignExists ? storedCampaign : null);
    }
  }, [isLoading, tenants, campaigns]);

  useEffect(() => {
    if (!tenantId || !campaignId) return;
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      setCampaignIdState(null);
      return;
    }
    if (campaign.company_name !== tenantId) {
      setCampaignIdState(null);
    }
  }, [tenantId, campaignId, campaigns]);

  const setTenantId = (nextTenantId: string | null) => {
    setTenantIdState(nextTenantId);
    if (nextTenantId) window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, nextTenantId);
    else window.localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
  };

  const setCampaignId = (nextCampaignId: string | null) => {
    setCampaignIdState(nextCampaignId);
    if (nextCampaignId) window.localStorage.setItem(ACTIVE_CAMPAIGN_STORAGE_KEY, nextCampaignId);
    else window.localStorage.removeItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
  };

  return (
    <AppContext.Provider
      value={{
        isResolving: isLoading,
        tenantId,
        campaignId,
        tenants,
        campaigns,
        setTenantId,
        setCampaignId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  return context ?? defaultContext;
}
