import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCommodityPricing(campaignId?: string) {
  return useQuery({
    queryKey: ['commodity-pricing', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commodity_pricing')
        .select('*')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertCommodityPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pricing: any) => {
      if (pricing.id) {
        const { id, ...rest } = pricing;
        const { error } = await supabase.from('commodity_pricing').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('commodity_pricing').insert(pricing);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commodity-pricing'] }),
  });
}

export function useDeleteCommodityPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('commodity_pricing').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commodity-pricing'] }),
  });
}

export function useFreightReducers(campaignId?: string) {
  return useQuery({
    queryKey: ['freight-reducers', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freight_reducers')
        .select('*')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertFreightReducer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reducer: any) => {
      if (reducer.id && !reducer.id.startsWith('new-')) {
        const { id, ...rest } = reducer;
        const { error } = await supabase.from('freight_reducers').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { id, ...rest } = reducer;
        const { error } = await supabase.from('freight_reducers').insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['freight-reducers'] }),
  });
}

export function useDeleteFreightReducer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('freight_reducers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['freight-reducers'] }),
  });
}
