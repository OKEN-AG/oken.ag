import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type Campaign = Tables<'campaigns'>;
export type CampaignInsert = TablesInsert<'campaigns'>;
export type CampaignUpdate = TablesUpdate<'campaigns'>;

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaign: CampaignInsert) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert(campaign)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['active-campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign-full', data.id] });
      qc.invalidateQueries({ queryKey: ['campaign-products-full', data.id] });
      qc.invalidateQueries({ queryKey: ['campaign-combos-full', data.id] });
      qc.invalidateQueries({ queryKey: ['campaign-margins-full', data.id] });
      qc.invalidateQueries({ queryKey: ['campaign-commodity-unified', data.id] });
      qc.invalidateQueries({ queryKey: ['campaign-freight-full', data.id] });
      qc.invalidateQueries({ queryKey: ['campaign-delivery-locations', data.id] });
      qc.invalidateQueries({ queryKey: ['campaign-due-dates-sim', data.id] });
      qc.invalidateQueries({ queryKey: ['campaign-segments-sim', data.id] });
      qc.invalidateQueries({ queryKey: ['campaign-payment-methods-sim', data.id] });
    },
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: CampaignUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      const id = vars.id;
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaigns', id] });
      qc.invalidateQueries({ queryKey: ['active-campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign-full', id] });
      qc.invalidateQueries({ queryKey: ['campaign-products-full', id] });
      qc.invalidateQueries({ queryKey: ['campaign-combos-full', id] });
      qc.invalidateQueries({ queryKey: ['campaign-margins-full', id] });
      qc.invalidateQueries({ queryKey: ['campaign-commodity-unified', id] });
      qc.invalidateQueries({ queryKey: ['campaign-freight-full', id] });
      qc.invalidateQueries({ queryKey: ['campaign-delivery-locations', id] });
      qc.invalidateQueries({ queryKey: ['campaign-due-dates-sim', id] });
      qc.invalidateQueries({ queryKey: ['campaign-segments-sim', id] });
      qc.invalidateQueries({ queryKey: ['campaign-payment-methods-sim', id] });
    },
  });
}
