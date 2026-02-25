import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCommodityCode, toCommodityLabel } from '@/lib/commodity';

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
      const { data, error } = await (supabase as any)
        .from('commodities_master_data')
        .select('code, name, active')
        .eq('active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as CommodityMasterRow[];
    },
  });
}

export function useCommodityOptions(campaignCommodities: string[] = [], fallback: string[] = []) {
  const { data: commoditiesMasterData = [], ...query } = useCommoditiesMasterData();

  const options = useMemo(() => {
    const optionsMap = new Map<string, CommodityOption>();

    for (const item of commoditiesMasterData) {
      const value = normalizeCommodityCode(item.code);
      if (!value) continue;
      optionsMap.set(value, {
        value,
        label: item.name || toCommodityLabel(value),
      });
    }

    const normalizedCampaignCommodities = (campaignCommodities || [])
      .map(normalizeCommodityCode)
      .filter(Boolean);

    if (normalizedCampaignCommodities.length > 0) {
      for (const code of normalizedCampaignCommodities) {
        if (!optionsMap.has(code)) {
          optionsMap.set(code, {
            value: code,
            label: toCommodityLabel(code),
          });
        }
      }

      return normalizedCampaignCommodities
        .map(code => optionsMap.get(code))
        .filter((option): option is CommodityOption => !!option);
    }

    if (optionsMap.size > 0) return Array.from(optionsMap.values());

    return fallback
      .map(normalizeCommodityCode)
      .filter(Boolean)
      .map(code => ({ value: code, label: toCommodityLabel(code) }));
  }, [commoditiesMasterData, campaignCommodities, fallback]);

  return { options, commoditiesMasterData, ...query };
}
