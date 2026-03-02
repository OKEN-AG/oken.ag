import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type ChannelMargin = Tables<'channel_margins'>;

export function useChannelMargins(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['channel_margins', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_margins')
        .select('*')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveChannelMargins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, margins }: { campaignId: string; margins: { segment: 'direto' | 'distribuidor' | 'cooperativa'; margin_percent: number }[] }) => {
      const { error } = await supabase.rpc('upsert_campaign_channel_margins', {
        p_campaign_id: campaignId,
        p_margins: margins,
      });

      if (error) {
        throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['channel_margins', vars.campaignId] });
    },
  });
}
