import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useCampaignProducts(campaignId?: string) {
  return useQuery({
    queryKey: ['campaign-products', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('campaign_products')
        .select('*, product:products(*)')
        .eq('campaign_id', campaignId);
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (product: any) => {
      const { data, error } = await supabase.from('products').insert(product).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...product }: any) => {
      const { data, error } = await supabase.from('products').update(product).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useLinkProductToCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, productId }: { campaignId: string; productId: string }) => {
      const { error } = await (supabase as any)
        .from('campaign_products')
        .insert({ campaign_id: campaignId, product_id: productId });
      if (error) throw error;
    },
    onSuccess: (_, { campaignId }) => qc.invalidateQueries({ queryKey: ['campaign-products', campaignId] }),
  });
}

export function useUnlinkProductFromCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, productId }: { campaignId: string; productId: string }) => {
      const { error } = await (supabase as any)
        .from('campaign_products')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('product_id', productId);
      if (error) throw error;
    },
    onSuccess: (_, { campaignId }) => qc.invalidateQueries({ queryKey: ['campaign-products', campaignId] }),
  });
}
