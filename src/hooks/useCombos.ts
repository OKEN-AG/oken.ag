import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCombos(campaignId?: string) {
  return useQuery({
    queryKey: ['combos', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combos')
        .select('*')
        .eq('campaign_id', campaignId!)
        .order('discount_percent', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useComboProducts(comboId?: string) {
  return useQuery({
    queryKey: ['combo-products', comboId],
    enabled: !!comboId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combo_products')
        .select('*, product:products(*)')
        .eq('combo_id', comboId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (combo: { name: string; campaign_id: string; discount_percent: number }) => {
      const { data, error } = await supabase.from('combos').insert(combo).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['combos', v.campaign_id] }),
  });
}

export function useDeleteCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaignId }: { id: string; campaignId: string }) => {
      const { error } = await supabase.from('combos').delete().eq('id', id);
      if (error) throw error;
      return campaignId;
    },
    onSuccess: (campaignId) => qc.invalidateQueries({ queryKey: ['combos', campaignId] }),
  });
}

export function useUpdateCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaignId, ...data }: { id: string; campaignId: string; [key: string]: any }) => {
      const { error } = await supabase.from('combos').update(data).eq('id', id);
      if (error) throw error;
      return campaignId;
    },
    onSuccess: (campaignId) => qc.invalidateQueries({ queryKey: ['combos', campaignId] }),
  });
}

export function useAddComboProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { combo_id: string; product_id: string; min_dose_per_ha: number; max_dose_per_ha: number }) => {
      const { error } = await supabase.from('combo_products').insert(item);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['combo-products', v.combo_id] }),
  });
}

export function useRemoveComboProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comboId }: { id: string; comboId: string }) => {
      const { error } = await supabase.from('combo_products').delete().eq('id', id);
      if (error) throw error;
      return comboId;
    },
    onSuccess: (comboId) => qc.invalidateQueries({ queryKey: ['combo-products', comboId] }),
  });
}
