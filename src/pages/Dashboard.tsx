import { motion } from 'framer-motion';
import StatCard from '@/components/StatCard';
import TrainTrack from '@/components/TrainTrack';
import { BarChart3, Wheat, ShoppingCart, FileText, TrendingUp, DollarSign } from 'lucide-react';
import type { WagonStage } from '@/types/barter';

const mockStages: WagonStage[] = [
  { id: '1', name: 'Termo de Adesão', module: 'adesao', status: 'concluido', requiredDocuments: ['termo_adesao'], completedDocuments: ['termo_adesao'], completedAt: '2025-02-01' },
  { id: '2', name: 'Simulação de Pedido', module: 'simulacao', status: 'concluido', requiredDocuments: [], completedDocuments: [], completedAt: '2025-02-05' },
  { id: '3', name: 'Seleção de Pagamento', module: 'pagamento', status: 'concluido', requiredDocuments: [], completedDocuments: [] },
  { id: '4', name: 'Paridade Barter', module: 'barter', status: 'em_progresso', requiredDocuments: ['termo_barter'], completedDocuments: [] },
  { id: '5', name: 'Seguro de Mercado', module: 'seguro', status: 'pendente', requiredDocuments: [], completedDocuments: [] },
  { id: '6', name: 'Emissão do Pedido', module: 'pedido', status: 'pendente', requiredDocuments: ['pedido'], completedDocuments: [] },
  { id: '7', name: 'Formalização', module: 'formalizacao', status: 'bloqueado', requiredDocuments: ['ccv', 'cessao_credito'], completedDocuments: [] },
  { id: '8', name: 'Garantias', module: 'garantias', status: 'bloqueado', requiredDocuments: ['cpr'], completedDocuments: [] },
];

const recentOps = [
  { id: 'OP-2025-001', client: 'Fazenda Santa Clara', amount: 'R$ 1.250.000', sacas: '8.420', status: 'formalizado' },
  { id: 'OP-2025-002', client: 'Agro Minas LTDA', amount: 'R$ 890.000', sacas: '5.980', status: 'simulacao' },
  { id: 'OP-2025-003', client: 'Cooperativa Agrisul', amount: 'R$ 2.100.000', sacas: '14.120', status: 'garantido' },
  { id: 'OP-2025-004', client: 'Fazenda Progresso', amount: 'R$ 560.000', sacas: '3.760', status: 'faturado' },
];

const statusColors: Record<string, string> = {
  simulacao: 'bg-info/10 text-info',
  formalizado: 'bg-warning/10 text-warning',
  garantido: 'bg-primary/10 text-primary',
  faturado: 'bg-success/10 text-success',
};

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Safra 2025/26 — Barter Soja</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="engine-badge bg-success/10 text-success">● Campanha Ativa</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Volume Total Negociado"
          value="R$ 4,8M"
          icon={<DollarSign className="w-4 h-4" />}
          trend="up"
          trendValue="+12% vs mês anterior"
        />
        <StatCard
          label="Operações Ativas"
          value="24"
          icon={<ShoppingCart className="w-4 h-4" />}
          trend="up"
          trendValue="+3 esta semana"
        />
        <StatCard
          label="Sacas Comprometidas"
          value="32.280"
          icon={<Wheat className="w-4 h-4" />}
          subtitle="Soja CBOT K26"
        />
        <StatCard
          label="Preço Ref. Soja"
          value="R$ 148,50"
          icon={<TrendingUp className="w-4 h-4" />}
          trend="down"
          trendValue="-1.2%"
          subtitle="/saca - Paranaguá"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Train Track */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <span className="text-gradient">🚂</span> Jornada da Operação — OP-2025-002
          </h2>
          <TrainTrack stages={mockStages} />
        </motion.div>

        {/* Recent Operations */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="glass-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" /> Operações Recentes
          </h2>
          <div className="space-y-2">
            {recentOps.map(op => (
              <div key={op.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-foreground">{op.id}</div>
                  <div className="text-xs text-muted-foreground">{op.client}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-medium text-foreground">{op.amount}</div>
                  <div className="text-xs text-muted-foreground">{op.sacas} sacas</div>
                </div>
                <span className={`engine-badge ${statusColors[op.status] || 'bg-muted text-muted-foreground'}`}>
                  {op.status}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Gross-to-Net Summary */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="glass-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" /> Análise Gross-to-Net Consolidada
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { label: 'Receita Bruta', value: 'R$ 4.800.000', color: 'text-foreground' },
            { label: 'Desc. Combo', value: '-R$ 288.000', color: 'text-warning' },
            { label: 'Desc. Barter', value: '-R$ 135.000', color: 'text-warning' },
            { label: 'Receita Líquida', value: 'R$ 4.377.000', color: 'text-success' },
            { label: 'Rec. Financeira', value: 'R$ 312.000', color: 'text-info' },
            { label: 'Margem Canal', value: 'R$ 480.000', color: 'text-muted-foreground' },
            { label: 'Net-Net', value: 'R$ 3.585.000', color: 'text-primary' },
          ].map(item => (
            <div key={item.label} className="text-center">
              <div className="stat-label mb-1">{item.label}</div>
              <div className={`font-mono font-bold text-sm ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
