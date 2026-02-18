import { motion } from 'framer-motion';
import { BarChart3, Wheat, Shield, TrendingUp, CheckCircle } from 'lucide-react';
import StatCard from '@/components/StatCard';
import { Progress } from '@/components/ui/progress';
import { useOperations } from '@/hooks/useOperations';
import { Skeleton } from '@/components/ui/skeleton';

const healthColor = (v: number) => v >= 90 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-destructive';

export default function MonitoringPage() {
  const { data: operations, isLoading } = useOperations();
  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Filter to monitoring-relevant statuses
  const monitored = (operations || []).filter(o => ['garantido', 'faturado', 'monitorando', 'liquidado'].includes(o.status));
  const totalSacas = monitored.reduce((s, o) => s + (o.total_sacas || 0), 0);

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Monitoramento de Operações</h1>
        <p className="text-sm text-muted-foreground">Acompanhamento de garantias, produtividade e liquidação</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Operações Monitoradas" value={String(monitored.length)} icon={<BarChart3 className="w-4 h-4" />} />
        <StatCard label="Sacas Comprometidas" value={totalSacas.toLocaleString('pt-BR')} icon={<Wheat className="w-4 h-4" />} />
        <StatCard label="Cobertura de Garantia" value={monitored.length > 0 ? '—' : 'N/A'} icon={<Shield className="w-4 h-4" />} />
        <StatCard label="Operações Liquidadas" value={String(monitored.filter(o => o.status === 'liquidado').length)} icon={<TrendingUp className="w-4 h-4" />} />
      </div>

      {monitored.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Nenhuma operação em fase de monitoramento. Operações aparecem aqui após a formalização.</div>
      ) : (
        <div className="space-y-4">
          {monitored.map((op, i) => (
            <motion.div key={op.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{op.client_name || 'Sem nome'}</div>
                  <div className="text-xs text-muted-foreground">{formatCurrency(op.gross_revenue || 0)}</div>
                </div>
                <span className={`engine-badge ${
                  op.status === 'liquidado' ? 'bg-success/10 text-success' :
                  op.status === 'monitorando' ? 'bg-info/10 text-info' :
                  'bg-warning/10 text-warning'
                }`}>
                  {op.status === 'liquidado' ? <CheckCircle className="w-3 h-3 inline mr-1" /> : null}
                  {op.status}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="stat-label">Sacas</div>
                  <div className="font-mono text-sm text-foreground">{(op.total_sacas || 0).toLocaleString('pt-BR')} sacas</div>
                </div>
                <div>
                  <div className="stat-label">Commodity</div>
                  <div className="font-mono text-sm text-foreground capitalize">{op.commodity || 'soja'}</div>
                </div>
                <div>
                  <div className="stat-label">Preço Ref.</div>
                  <div className="font-mono text-sm text-foreground">{formatCurrency(op.reference_price || 0)}/saca</div>
                </div>
                <div>
                  <div className="stat-label">Valor Líquido</div>
                  <div className="font-mono text-sm text-foreground">{formatCurrency(op.net_revenue || 0)}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
