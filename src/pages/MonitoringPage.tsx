import { motion } from 'framer-motion';
import { BarChart3, Wheat, Shield, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import StatCard from '@/components/StatCard';
import { Progress } from '@/components/ui/progress';

const operations = [
  { id: 'OP-2025-001', client: 'Fazenda Santa Clara', sacas: 8420, entregue: 5200, valor: 1250000, garantia: 95, ndvi: 0.82, status: 'monitorando' },
  { id: 'OP-2025-003', client: 'Cooperativa Agrisul', sacas: 14120, entregue: 0, valor: 2100000, garantia: 100, ndvi: 0.78, status: 'garantido' },
  { id: 'OP-2025-004', client: 'Fazenda Progresso', sacas: 3760, entregue: 3760, valor: 560000, garantia: 100, ndvi: 0.85, status: 'liquidado' },
];

const healthColor = (v: number) => v >= 90 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-destructive';
const ndviColor = (v: number) => v >= 0.7 ? 'text-success' : v >= 0.5 ? 'text-warning' : 'text-destructive';

export default function MonitoringPage() {
  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Monitoramento de Operações</h1>
        <p className="text-sm text-muted-foreground">Acompanhamento de garantias, produtividade e liquidação</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Operações Monitoradas" value="3" icon={<BarChart3 className="w-4 h-4" />} />
        <StatCard label="Sacas a Receber" value="17.100" icon={<Wheat className="w-4 h-4" />} trend="neutral" trendValue="Soja" />
        <StatCard label="Cobertura de Garantia" value="98%" icon={<Shield className="w-4 h-4" />} trend="up" trendValue="Saudável" />
        <StatCard label="NDVI Médio" value="0.82" icon={<TrendingUp className="w-4 h-4" />} trend="up" trendValue="Bom desenvolvimento" />
      </div>

      <div className="space-y-4">
        {operations.map((op, i) => {
          const entregaPercent = op.sacas > 0 ? (op.entregue / op.sacas) * 100 : 0;
          return (
            <motion.div key={op.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{op.id} — {op.client}</div>
                  <div className="text-xs text-muted-foreground">{formatCurrency(op.valor)}</div>
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
                  <div className="stat-label">Entrega de Grãos</div>
                  <div className="font-mono text-sm text-foreground">{op.entregue.toLocaleString('pt-BR')} / {op.sacas.toLocaleString('pt-BR')} sacas</div>
                  <Progress value={entregaPercent} className="h-2 mt-1 bg-muted" />
                </div>
                <div>
                  <div className="stat-label">Cobertura Garantia</div>
                  <div className={`font-mono font-bold text-lg ${healthColor(op.garantia)}`}>{op.garantia}%</div>
                </div>
                <div>
                  <div className="stat-label">NDVI Área</div>
                  <div className={`font-mono font-bold text-lg ${ndviColor(op.ndvi)}`}>{op.ndvi}</div>
                  <div className="text-xs text-muted-foreground">{op.ndvi >= 0.7 ? 'Vegetação saudável' : 'Atenção'}</div>
                </div>
                <div>
                  <div className="stat-label">Fluxo Financeiro</div>
                  <div className="font-mono text-sm text-foreground">{formatCurrency(op.entregue * 148.5)}</div>
                  <div className="text-xs text-muted-foreground">Recebido</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
