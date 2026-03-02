import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';

type DbOperationRow = Database['public']['Tables']['operations']['Row'];
type DbOperationInsert = Database['public']['Tables']['operations']['Insert'];
type DbOperationUpdate = Database['public']['Tables']['operations']['Update'];
type DbOperationItemInsert = Database['public']['Tables']['operation_items']['Insert'];
type DbOperationLogInsert = Database['public']['Tables']['operation_logs']['Insert'];
// operation_calculation_inputs may not be in generated types yet — use `any` as fallback
type DbOperationCalculationInputRow = any;
type DbOperationCalculationInputInsert = any;

type OperationalContext = {
  tenantId: string | null;
  campaignId: string | null;
};

const assertOperationalContext = (context: OperationalContext) => {
  if (!context.tenantId || !context.campaignId) {
    throw new Error('Contexto incompleto. Informe tenantId e campaignId.');
  }
};

export function useOperations(context: OperationalContext) {
  return useQuery({
    queryKey: ['operations', context.tenantId, context.campaignId],
    enabled: !!context.tenantId && !!context.campaignId,
    queryFn: async () => {
      assertOperationalContext(context);
      const { data, error } = await supabase
        .from('operations')
        .select('*')
        .eq('campaign_id', context.campaignId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useOperation(id?: string) {
  return useQuery({
    queryKey: ['operations', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('operations').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useOperationItems(operationId?: string) {
  return useQuery({
    queryKey: ['operation-items', operationId],
    enabled: !!operationId,
    queryFn: async () => {
      const { data, error } = await supabase.from('operation_items').select('*, product:products(*)').eq('operation_id', operationId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useOperationDocuments(operationId?: string) {
  return useQuery({
    queryKey: ['operation-documents', operationId],
    enabled: !!operationId,
    queryFn: async () => {
      const { data, error } = await supabase.from('operation_documents').select('*').eq('operation_id', operationId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateOperation(context: OperationalContext) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (operation: Omit<DbOperationInsert, 'campaign_id' | 'user_id'>) => {
      assertOperationalContext(context);
      if (!user?.id) throw new Error('Usuário autenticado não encontrado.');
      const payload: DbOperationInsert = { ...operation, campaign_id: context.campaignId, user_id: user.id };
      const { data, error } = await supabase.from('operations').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operations'] }),
  });
}

export function useUpdateOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DbOperationUpdate }) => {
      const { data, error } = await supabase.from('operations').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['operations'] });
      qc.invalidateQueries({ queryKey: ['operations', vars.id] });
    },
  });
}

export function useCreateOperationItems() { const qc = useQueryClient(); return useMutation({ mutationFn: async (items: DbOperationItemInsert[]) => { const { error } = await supabase.from('operation_items').insert(items); if (error) throw error; }, onSuccess: () => qc.invalidateQueries({ queryKey: ['operation-items'] }) }); }
export function useReplaceOperationItems() { const qc = useQueryClient(); return useMutation({ mutationFn: async ({ operationId, items }: { operationId: string; items: DbOperationItemInsert[] }) => { const { error: deleteError } = await supabase.from('operation_items').delete().eq('operation_id', operationId); if (deleteError) throw deleteError; if (items.length === 0) return; const { error: insertError } = await supabase.from('operation_items').insert(items); if (insertError) throw insertError; }, onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: ['operation-items'] }); qc.invalidateQueries({ queryKey: ['operation-items', vars.operationId] }); } }); }
export function useCreateOperationLog() { return useMutation({ mutationFn: async (log: DbOperationLogInsert) => { const { error } = await supabase.from('operation_logs').insert(log); if (error) throw error; } }); }

export function useOperationStats(context: OperationalContext) {
  return useQuery({
    queryKey: ['operation-stats', context.tenantId, context.campaignId],
    enabled: !!context.tenantId && !!context.campaignId,
    queryFn: async () => {
      assertOperationalContext(context);
      const { data, error } = await supabase
        .from('operations')
        .select('id, status, gross_revenue, total_sacas, client_name, created_at, commodity_price')
        .eq('campaign_id', context.campaignId);
      if (error) throw error;
      const totalVolume = (data || []).reduce((s, o) => s + (o.gross_revenue || 0), 0);
      const totalSacas = (data || []).reduce((s, o) => s + (o.total_sacas || 0), 0);
      const activeCount = (data || []).filter(o => !['liquidado'].includes(o.status)).length;
      return { operations: (data || []) as DbOperationRow[], totalVolume, totalSacas, activeCount, totalCount: (data || []).length };
    },
  });
}

export function useOperationCalculationInputs(operationId?: string) { return useQuery({ queryKey: ['operation-calculation-inputs', operationId], enabled: !!operationId, queryFn: async () => { const { data, error } = await (supabase as any).from('operation_calculation_inputs').select('*').eq('operation_id', operationId!).order('created_at', { ascending: false }); if (error) throw error; return (data || []) as DbOperationCalculationInputRow[]; } }); }
export function useUpsertOperationCalculationInput() { const qc = useQueryClient(); return useMutation({ mutationFn: async (payload: DbOperationCalculationInputInsert) => { const { data, error } = await (supabase as any).from('operation_calculation_inputs').upsert(payload, { onConflict: 'operation_id,scenario_type' }).select().single(); if (error) throw error; return data; }, onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['operation-calculation-inputs'] }); qc.invalidateQueries({ queryKey: ['operation-calculation-inputs', data?.operation_id] }); } }); }
