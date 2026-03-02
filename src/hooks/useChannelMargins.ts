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
      // Delete existing margins for this campaign
      const { error: delError } = await supabase
        .from('channel_margins')
        .delete()
        .eq('campaign_id', campaignId);
      if (delError) throw delError;

      // Insert new margins
      if (margins.length > 0) {
        const { error: insError } = await supabase
          .from('channel_margins')
          .insert(margins.map(m => ({ campaign_id: campaignId, segment: m.segment, margin_percent: m.margin_percent })));
        if (insError) throw insError;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['channel_margins', vars.campaignId] });
    },
  });
}
