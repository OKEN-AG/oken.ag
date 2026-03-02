import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Landmark, Timer, Waypoints } from 'lucide-react';
import StatCard from '@/components/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

type OpsRow = {
  rail: 'fiat' | 'token' | 'vault' | 'hybrid';
  status: string;
  intent_count: number;
  requested_amount: number;
};

type DelayRow = {
  rail: 'fiat' | 'token' | 'vault' | 'hybrid';
  status: string;
  delayed_2h_count: number;
  delayed_24h_count: number;
  avg_delay_hours: number;
};

type DivergenceRow = {
  rail: 'fiat' | 'token' | 'vault' | 'hybrid';
  open_alerts: number;
  critical_alerts: number;
};

export default function SettlementOpsPage() {
  const { data: ops = [], isLoading: opsLoading } = useQuery({
    queryKey: ['settlement-ops-panel'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('v_settlement_operational_panel')
        .select('rail,status,intent_count,requested_amount')
        .order('rail');
      if (error) throw error;
      return (data || []) as OpsRow[];
    },
  });

  const { data: delays = [], isLoading: delaysLoading } = useQuery({
    queryKey: ['settlement-delay-panel'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('v_settlement_delay_panel')
        .select('rail,status,delayed_2h_count,delayed_24h_count,avg_delay_hours')
        .order('rail');
      if (error) throw error;
      return (data || []) as DelayRow[];
    },
  });

  const { data: divergences = [], isLoading: divergencesLoading } = useQuery({
    queryKey: ['settlement-divergence-panel'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('v_settlement_divergence_by_rail')
        .select('rail,open_alerts,critical_alerts')
        .order('rail');
      if (error) throw error;
      return (data || []) as DivergenceRow[];
    },
  });

  if (opsLoading || delaysLoading || divergencesLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  const totalIntents = ops.reduce((acc, row) => acc + Number(row.intent_count || 0), 0);
  const totalRequested = ops.reduce((acc, row) => acc + Number(row.requested_amount || 0), 0);
  const delayed24h = delays.reduce((acc, row) => acc + Number(row.delayed_24h_count || 0), 0);
  const criticalAlerts = divergences.reduce((acc, row) => acc + Number(row.critical_alerts || 0), 0);

  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Painel Operacional de Liquidação</h1>
        <p className="text-sm text-muted-foreground">Orquestração unificada de intents, atrasos e divergências por rail.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Settlement Intents" value={String(totalIntents)} icon={<Waypoints className="w-4 h-4" />} subtitle="requested / approved / executed" />
        <StatCard label="Volume Solicitado" value={formatCurrency(totalRequested)} icon={<Landmark className="w-4 h-4" />} subtitle="fiat↔token↔vault" />
        <StatCard label="Atrasos > 24h" value={String(delayed24h)} icon={<Timer className="w-4 h-4" />} subtitle="status requested/approved" />
        <StatCard label="Alertas Críticos" value={String(criticalAlerts)} icon={<AlertTriangle className="w-4 h-4" />} subtitle="mismatches abertos" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <h2 className="font-semibold mb-3">Liquidação por Rail</h2>
          <div className="space-y-2 text-sm">
            {ops.map((row, idx) => (
              <div key={`${row.rail}-${row.status}-${idx}`} className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">{row.rail} · {row.status}</span>
                <span className="font-mono">{row.intent_count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-4">
          <h2 className="font-semibold mb-3">Atrasos</h2>
          <div className="space-y-2 text-sm">
            {delays.map((row, idx) => (
              <div key={`${row.rail}-${row.status}-${idx}`} className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">{row.rail} · {row.status}</span>
                <span className="font-mono">2h: {row.delayed_2h_count} · 24h: {row.delayed_24h_count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-4">
          <h2 className="font-semibold mb-3">Divergências por Rail</h2>
          <div className="space-y-2 text-sm">
            {divergences.map((row, idx) => (
              <div key={`${row.rail}-${idx}`} className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">{row.rail}</span>
                <span className="font-mono">abertos: {row.open_alerts} · críticos: {row.critical_alerts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
