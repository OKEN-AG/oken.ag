import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Investor, InvestorEventEvidence, InvestorOrder, InvestorJourneyState, RegulatoryWrapper } from '@/domains/core/investors/types';

const db = supabase as any;

export function useInvestors() {
  return useQuery<Investor[]>({
    queryKey: ['investors-portal'],
    queryFn: async () => {
      const { data, error } = await db.from('investors').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvestorOrders(investorId?: string) {
  return useQuery<InvestorOrder[]>({
    queryKey: ['investor-orders', investorId],
    enabled: !!investorId,
    queryFn: async () => {
      const { data, error } = await db.from('investor_orders').select('*').eq('investor_id', investorId).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvestorEvidence(investorId?: string) {
  return useQuery<InvestorEventEvidence[]>({
    queryKey: ['investor-evidence', investorId],
    enabled: !!investorId,
    queryFn: async () => {
      const { data, error } = await db.from('investor_event_evidences').select('*').eq('investor_id', investorId).order('happened_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateInvestor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { full_name: string; document_number: string; email?: string; wrapper_type: RegulatoryWrapper }) => {
      const { data, error } = await db.from('investors').insert(payload).select('*').single();
      if (error) throw error;
      return data as Investor;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['investors-portal'] }),
  });
}

export function useAdvanceInvestorJourney() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      investorId: string;
      investorOrderId?: string | null;
      eventType: string;
      toState: InvestorJourneyState;
      eventPayload?: Record<string, unknown>;
    }) => {
      const { error } = await db.rpc('register_investor_event', {
        p_investor_id: payload.investorId,
        p_investor_order_id: payload.investorOrderId ?? null,
        p_event_type: payload.eventType,
        p_to_state: payload.toState,
        p_payload: payload.eventPayload ?? {},
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['investors-portal'] });
      queryClient.invalidateQueries({ queryKey: ['investor-orders', variables.investorId] });
      queryClient.invalidateQueries({ queryKey: ['investor-evidence', variables.investorId] });
    },
  });
}

export function useCreateInvestorOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { investor_id: string; gross_amount: number; net_amount: number }) => {
      const { data, error } = await db
        .from('investor_orders')
        .insert({
          ...payload,
          allocated_amount: 0,
          journey_state: 'order_submitted',
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as InvestorOrder;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['investor-orders', order.investor_id] });
      queryClient.invalidateQueries({ queryKey: ['investors-portal'] });
    },
  });
}
