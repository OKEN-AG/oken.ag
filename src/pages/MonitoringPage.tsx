import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Wheat, Shield, TrendingUp, CheckCircle, ExternalLink } from 'lucide-react';
import StatCard from '@/components/StatCard';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useOperations } from '@/hooks/useOperations';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

const healthColor = (v: number) => v >= 90 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-destructive';

export default function MonitoringPage() {
  const navigate = useNavigate();
  const { data: operations, isLoading } = useOperations();
  const { data: campaignCurrencyMap = {} } = useQuery({
    queryKey: ['monitoring-campaign-currencies', operations?.map(o => o.campaign_id).join(',')],
    enabled: !!operations?.length,
    queryFn: async () => {
      const ids = Array.from(new Set((operations || []).map(o => o.campaign_id).filter(Boolean)));
      if (ids.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase.from('campaigns').select('id, currency').in('id', ids);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data || []) map[row.id] = (row.currency || 'BRL').toUpperCase();
      return map;
    },
  });

  const formatCurrency = (v: number, currency: string = 'BRL') => v.toLocaleString('pt-BR', { style: 'currency', currency: currency === 'USD' ? 'USD' : 'BRL' });

  // Filter to monitoring-relevant statuses
  const monitored = (operations || []).filter(o => ['garantido', 'faturado', 'monitorando', 'liquidado'].includes(o.status));
  const totalSacas = monitored.reduce((s, o) => s + (o.total_sacas || 0), 0);
  const totalGross = monitored.reduce((s, o) => s + (o.gross_revenue || 0), 0);
  const totalNet = monitored.reduce((s, o) => s + (o.net_revenue || 0), 0);
  const liquidatedCount = monitored.filter(o => o.status === 'liquidado').length;

  // Bug #17: Calculate coverage ratio (operations with sacas vs total)
  const withSacas = monitored.filter(o => (o.total_sacas || 0) > 0).length;
  const coveragePercent = monitored.length > 0 ? Math.round((withSacas / monitored.length) * 100) : 0;

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Monitoramento de Operações</h1>
        <p className="text-sm text-muted-foreground">Acompanhamento de garantias, produtividade e liquidação</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Operações Monitoradas" value={String(monitored.length)} icon={<BarChart3 className="w-4 h-4" />} subtitle={`${liquidatedCount} liquidadas`} />
        <StatCard label="Sacas Comprometidas" value={totalSacas.toLocaleString('pt-BR')} icon={<Wheat className="w-4 h-4" />} subtitle={`${formatCurrency(totalGross, 'BRL')} bruto`} />
        <StatCard label="Cobertura de Garantia" value={`${coveragePercent}%`} icon={<Shield className="w-4 h-4" />} subtitle={`${withSacas}/${monitored.length} com sacas`} />
        <StatCard label="Valor Líquido Total" value={formatCurrency(totalNet, 'BRL')} icon={<TrendingUp className="w-4 h-4" />} />
      </div>

      {monitored.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Nenhuma operação em fase de monitoramento. Operações aparecem aqui após a formalização.</div>
      ) : (
        <div className="space-y-4">
          {monitored.map((op, i) => {
            const sacasHealth = (op.total_sacas || 0) > 0 ? 100 : 0;
            const currency = campaignCurrencyMap[op.campaign_id] || 'BRL';
            return (
              <motion.div key={op.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{op.client_name || 'Sem nome'}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(op.gross_revenue || 0, currency)} · {new Date(op.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`engine-badge ${
                      op.status === 'liquidado' ? 'bg-success/10 text-success' :
                      op.status === 'monitorando' ? 'bg-info/10 text-info' :
                      'bg-warning/10 text-warning'
                    }`}>
                      {op.status === 'liquidado' ? <CheckCircle className="w-3 h-3 inline mr-1" /> : null}
                      {op.status}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/operacao/${op.id}`)}>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <div className="stat-label">Sacas</div>
                    <div className="font-mono text-sm text-foreground">{(op.total_sacas || 0).toLocaleString('pt-BR')}</div>
                  </div>
                  <div>
                    <div className="stat-label">Commodity</div>
                    <div className="font-mono text-sm text-foreground capitalize">{op.commodity || 'soja'}</div>
                  </div>
                  <div>
                    <div className="stat-label">Preço Ref.</div>
                    <div className="font-mono text-sm text-foreground">{formatCurrency(op.reference_price || 0, currency)}/saca</div>
                  </div>
                  <div>
                    <div className="stat-label">Valor Líquido</div>
                    <div className="font-mono text-sm text-foreground">{formatCurrency(op.net_revenue || 0, currency)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Saúde</div>
                    <Progress value={sacasHealth} className="h-2 mt-1 bg-muted" />
                    <div className={`text-xs mt-1 font-mono ${healthColor(sacasHealth)}`}>{sacasHealth}%</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
