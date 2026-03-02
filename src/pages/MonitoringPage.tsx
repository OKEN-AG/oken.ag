import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Wheat, Shield, TrendingUp, CheckCircle, ExternalLink, AlertTriangle, Bell } from 'lucide-react';
import StatCard from '@/components/StatCard';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useOperations } from '@/hooks/useOperations';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { computeOperationIndicators, evaluateMonitoringAlerts, type MonitoringAlertRule, type MonitoringOperationInput } from '../../supabase/functions/server/engines/monitoring';

const healthColor = (v: number) => v >= 90 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-destructive';
const severityColor: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-warning/10 text-warning',
  high: 'bg-orange-500/10 text-orange-500',
  critical: 'bg-destructive/10 text-destructive',
};

export default function MonitoringPage() {
  const navigate = useNavigate();
  const { data: operations, isLoading } = useOperations();

  const { data: grainDeliveries = [] } = useQuery({
    queryKey: ['monitoring-grain-deliveries'],
    queryFn: async () => {
      const { data, error } = await supabase.from('grain_deliveries' as any).select('*');
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: settlementEntries = [] } = useQuery({
    queryKey: ['monitoring-settlement-entries'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settlement_entries' as any).select('*');
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: alertRules = [] } = useQuery({
    queryKey: ['monitoring-alert-rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('monitoring_alert_rules' as any).select('*');
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const monitored = (operations || []).filter(o => ['garantido', 'faturado', 'monitorando', 'liquidado'].includes(o.status));
  const totalSacas = monitored.reduce((s, o) => s + (o.total_sacas || 0), 0);
  const totalGross = monitored.reduce((s, o) => s + (o.gross_revenue || 0), 0);
  const totalNet = monitored.reduce((s, o) => s + (o.net_revenue || 0), 0);
  const liquidatedCount = monitored.filter(o => o.status === 'liquidado').length;

  // Delivery progress
  const deliveriesByOp: Record<string, number> = {};
  grainDeliveries.forEach((d: any) => {
    deliveriesByOp[d.operation_id] = (deliveriesByOp[d.operation_id] || 0) + Number(d.delivered_quantity || 0);
  });

  const totalDelivered = Object.values(deliveriesByOp).reduce((s, v) => s + v, 0);
  const deliveryPercent = totalSacas > 0 ? Math.round((totalDelivered / totalSacas) * 100) : 0;

  // Settlement totals
  const totalSettled = settlementEntries.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  // Compute alerts using monitoring engine
  const monitoringRules: MonitoringAlertRule[] = alertRules.map((r: any) => ({
    id: r.id,
    name: r.name,
    metric: r.metric,
    operator: r.operator,
    threshold: Number(r.threshold),
    severity: r.severity,
    recipients: r.recipients || [],
    enabled: r.enabled,
  }));

  const allAlerts = monitored.flatMap(op => {
    const input: MonitoringOperationInput = {
      operationId: op.id,
      tenantId: '',
      campaignId: op.campaign_id,
      collateralValue: op.gross_revenue || 0,
      exposureValue: op.net_revenue || 0,
      commodityPrice: op.commodity_price || 0,
      commodityReferencePrice: op.reference_price || 1,
    };
    return evaluateMonitoringAlerts(input, monitoringRules);
  });

  const alertsBySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  allAlerts.forEach(a => { alertsBySeverity[a.severity as keyof typeof alertsBySeverity] += 1; });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Monitoramento de Operações</h1>
        <p className="text-sm text-muted-foreground">Garantias, entregas, conciliação e alertas de risco</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Operações Monitoradas" value={String(monitored.length)} icon={<BarChart3 className="w-4 h-4" />} subtitle={`${liquidatedCount} liquidadas`} />
        <StatCard label="Sacas Comprometidas" value={totalSacas.toLocaleString('pt-BR')} icon={<Wheat className="w-4 h-4" />} subtitle={`${deliveryPercent}% entregue`} />
        <StatCard label="Valor Conciliado" value={formatCurrency(totalSettled)} icon={<TrendingUp className="w-4 h-4" />} subtitle={`de ${formatCurrency(totalGross)}`} />
        <StatCard label="Alertas Ativos" value={String(allAlerts.length)} icon={<Bell className="w-4 h-4" />} subtitle={`${alertsBySeverity.critical} críticos`} />
      </div>

      {/* Alert summary */}
      {allAlerts.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                {allAlerts.length} alertas ativos
              </span>
              <span className="text-xs text-muted-foreground">expandir</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            {allAlerts.slice(0, 20).map((alert, i) => (
              <div key={`${alert.ruleId}-${alert.operationId}-${i}`} className="flex items-center justify-between px-3 py-2 rounded bg-muted/50 text-sm">
                <span>{alert.ruleName}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{alert.value.toFixed(2)}</span>
                  <Badge className={severityColor[alert.severity]}>{alert.severity}</Badge>
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Delivery progress bar */}
      <div className="glass-card p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">Progresso de Entregas</span>
          <span className="font-mono text-foreground">{totalDelivered.toLocaleString('pt-BR')} / {totalSacas.toLocaleString('pt-BR')} sacas</span>
        </div>
        <Progress value={deliveryPercent} className="h-3 bg-muted" />
      </div>

      {monitored.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Nenhuma operação em fase de monitoramento.</div>
      ) : (
        <div className="space-y-4">
          {monitored.map((op, i) => {
            const delivered = deliveriesByOp[op.id] || 0;
            const opSacas = op.total_sacas || 0;
            const opDeliveryPct = opSacas > 0 ? Math.round((delivered / opSacas) * 100) : 0;
            const opEntries = settlementEntries.filter((e: any) => e.operation_id === op.id);
            const opSettled = opEntries.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
            const opAlerts = allAlerts.filter(a => a.operationId === op.id);

            return (
              <motion.div key={op.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{op.client_name || 'Sem nome'}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(op.gross_revenue || 0)} · {new Date(op.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {opAlerts.length > 0 && (
                      <Badge variant="outline" className="text-warning border-warning/50 text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1" />{opAlerts.length}
                      </Badge>
                    )}
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
                    <div className="font-mono text-sm text-foreground">{opSacas.toLocaleString('pt-BR')}</div>
                  </div>
                  <div>
                    <div className="stat-label">Entregue</div>
                    <div className="font-mono text-sm text-foreground">{delivered.toLocaleString('pt-BR')} ({opDeliveryPct}%)</div>
                  </div>
                  <div>
                    <div className="stat-label">Conciliado</div>
                    <div className="font-mono text-sm text-foreground">{formatCurrency(opSettled)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Commodity</div>
                    <div className="font-mono text-sm text-foreground capitalize">{op.commodity || 'soja'}</div>
                  </div>
                  <div>
                    <div className="stat-label">Entrega</div>
                    <Progress value={opDeliveryPct} className="h-2 mt-1 bg-muted" />
                    <div className={`text-xs mt-1 font-mono ${healthColor(opDeliveryPct)}`}>{opDeliveryPct}%</div>
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
