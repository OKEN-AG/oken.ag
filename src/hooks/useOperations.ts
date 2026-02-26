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

export function useOperations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['operations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operations')
        .select('*')
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
      const { data, error } = await supabase
        .from('operations')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
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
      const { data, error } = await supabase
        .from('operation_items')
        .select('*, product:products(*)')
        .eq('operation_id', operationId!);
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
      const { data, error } = await supabase
        .from('operation_documents')
        .select('*')
        .eq('operation_id', operationId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (operation: DbOperationInsert) => {
      const { data, error } = await supabase
        .from('operations')
        .insert(operation)
        .select()
        .single();
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
      const { data, error } = await supabase
        .from('operations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['operations'] });
      qc.invalidateQueries({ queryKey: ['operations', vars.id] });
    },
  });
}

export function useCreateOperationItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: DbOperationItemInsert[]) => {
      const { error } = await supabase.from('operation_items').insert(items);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operation-items'] }),
  });
}

export function useReplaceOperationItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ operationId, items }: { operationId: string; items: DbOperationItemInsert[] }) => {
      const { error: deleteError } = await supabase
        .from('operation_items')
        .delete()
        .eq('operation_id', operationId);
      if (deleteError) throw deleteError;

      if (items.length === 0) return;

      const { error: insertError } = await supabase
        .from('operation_items')
        .insert(items);
      if (insertError) throw insertError;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['operation-items'] });
      qc.invalidateQueries({ queryKey: ['operation-items', vars.operationId] });
    },
  });
}

export function useCreateOperationLog() {
  return useMutation({
    mutationFn: async (log: DbOperationLogInsert) => {
      const { error } = await supabase.from('operation_logs').insert(log);
      if (error) throw error;
    },
  });
}

export function useOperationStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['operation-stats', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operations')
        .select('id, status, gross_revenue, total_sacas, client_name, created_at, commodity_price');
      if (error) throw error;

      const totalVolume = (data || []).reduce((s, o) => s + (o.gross_revenue || 0), 0);
      const totalSacas = (data || []).reduce((s, o) => s + (o.total_sacas || 0), 0);
      const activeCount = (data || []).filter(o => !['liquidado'].includes(o.status)).length;

      return {
        operations: (data || []) as DbOperationRow[],
        totalVolume,
        totalSacas,
        activeCount,
        totalCount: (data || []).length,
      };
    },
  });
}


export function useOperationCalculationInputs(operationId?: string) {
  return useQuery({
    queryKey: ['operation-calculation-inputs', operationId],
    enabled: !!operationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('operation_calculation_inputs')
        .select('*')
        .eq('operation_id', operationId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DbOperationCalculationInputRow[];
    },
  });
}

export function useUpsertOperationCalculationInput() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DbOperationCalculationInputInsert) => {
      const { data, error } = await (supabase as any)
        .from('operation_calculation_inputs')
        .upsert(payload, { onConflict: 'operation_id,scenario_type' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['operation-calculation-inputs'] });
      qc.invalidateQueries({ queryKey: ['operation-calculation-inputs', data?.operation_id] });
    },
  });
}
