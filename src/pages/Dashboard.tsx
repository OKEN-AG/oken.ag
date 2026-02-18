import { motion } from 'framer-motion';
import StatCard from '@/components/StatCard';
import { useOperationStats } from '@/hooks/useOperations';
import { BarChart3, Wheat, ShoppingCart, FileText, TrendingUp, DollarSign } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const statusColors: Record<string, string> = {
  simulacao: 'bg-info/10 text-info',
  pedido: 'bg-warning/10 text-warning',
  formalizado: 'bg-warning/10 text-warning',
  garantido: 'bg-primary/10 text-primary',
  faturado: 'bg-success/10 text-success',
  monitorando: 'bg-info/10 text-info',
  liquidado: 'bg-success/10 text-success',
};

export default function Dashboard() {
  const { data: stats, isLoading } = useOperationStats();

  const formatCurrency = (v: number) => {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
    return `R$ ${v.toFixed(0)}`;
  };

  const formatNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral das operações</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Volume Total Negociado" value={formatCurrency(stats?.totalVolume || 0)} icon={<DollarSign className="w-4 h-4" />} />
            <StatCard label="Operações Ativas" value={String(stats?.activeCount || 0)} icon={<ShoppingCart className="w-4 h-4" />} subtitle={`${stats?.totalCount || 0} total`} />
            <StatCard label="Sacas Comprometidas" value={formatNum(stats?.totalSacas || 0)} icon={<Wheat className="w-4 h-4" />} />
            <StatCard label="Total de Operações" value={String(stats?.totalCount || 0)} icon={<BarChart3 className="w-4 h-4" />} />
          </div>

          {/* Recent Operations */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="glass-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" /> Operações Recentes
            </h2>
            {!stats?.operations || stats.operations.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">Nenhuma operação registrada ainda. Crie uma simulação para começar.</div>
            ) : (
              <div className="space-y-2">
                {stats.operations.slice(0, 10).map(op => (
                  <div key={op.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div>
                      <div className="text-sm font-medium text-foreground">{op.client_name || 'Sem nome'}</div>
                      <div className="text-xs text-muted-foreground">{new Date(op.created_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-medium text-foreground">
                        {(op.gross_revenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                      {op.total_sacas ? <div className="text-xs text-muted-foreground">{formatNum(op.total_sacas)} sacas</div> : null}
                    </div>
                    <span className={`engine-badge ${statusColors[op.status] || 'bg-muted text-muted-foreground'}`}>
                      {op.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
