import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type CommodityMasterRow = {
  code: string;
  name: string;
  active: boolean;
};

export type CommodityOption = {
  value: string;
  label: string;
};

export function useCommoditiesMasterData() {
  return useQuery({
    queryKey: ['commodities-master-data-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commodities_master_data')
        .select('code, name, active')
        .eq('active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as CommodityMasterRow[];
    },
  });
}

export function useCommodityOptions(campaignCommodities: string[] = [], fallback: string[] = []) {
  const { data: commoditiesMasterData = [], ...query } = useCommoditiesMasterData();

  const options = useMemo(() => {
    const fromMaster: CommodityOption[] = commoditiesMasterData
      .map(item => ({
        value: String(item.code || '').toLowerCase(),
        label: item.name || item.code,
      }))
      .filter(item => !!item.value);

    if (campaignCommodities.length === 0) {
      if (fromMaster.length > 0) return fromMaster;
      return fallback.map(c => ({ value: c.toLowerCase(), label: c.charAt(0).toUpperCase() + c.slice(1) }));
    }

    const allowed = new Set(campaignCommodities.map(c => c.toLowerCase()));
    const filtered = fromMaster.filter(item => allowed.has(item.value));
    if (filtered.length > 0) return filtered;

    return campaignCommodities.map(c => ({ value: c.toLowerCase(), label: c.charAt(0).toUpperCase() + c.slice(1) }));
  }, [commoditiesMasterData, campaignCommodities, fallback]);

  return { options, commoditiesMasterData, ...query };
}
