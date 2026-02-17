import { motion } from 'framer-motion';
import type { WagonStage } from '@/types/barter';
import { CheckCircle, Circle, Loader, Lock } from 'lucide-react';

interface TrainTrackProps {
  stages: WagonStage[];
}

const statusIcon = {
  concluido: <CheckCircle className="w-4 h-4 text-success" />,
  em_progresso: <Loader className="w-4 h-4 text-warning animate-spin" />,
  pendente: <Circle className="w-4 h-4 text-muted-foreground" />,
  bloqueado: <Lock className="w-4 h-4 text-destructive" />,
};

const statusLabel = {
  concluido: 'Concluído',
  em_progresso: 'Em Progresso',
  pendente: 'Pendente',
  bloqueado: 'Bloqueado',
};

export default function TrainTrack({ stages }: TrainTrackProps) {
  return (
    <div className="train-track">
      {stages.map((stage, i) => (
        <motion.div
          key={stage.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className={`wagon-node ${stage.status === 'concluido' ? 'completed' : ''} ${stage.status === 'em_progresso' ? 'active' : ''} py-3`}
        >
          <div className="glass-card p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {statusIcon[stage.status]}
              <div>
                <div className="text-sm font-medium text-foreground">{stage.name}</div>
                <div className="text-xs text-muted-foreground">
                  {stage.completedDocuments.length}/{stage.requiredDocuments.length} documentos
                </div>
              </div>
            </div>
            <span className={`engine-badge ${
              stage.status === 'concluido' ? 'bg-success/10 text-success' :
              stage.status === 'em_progresso' ? 'bg-warning/10 text-warning' :
              stage.status === 'bloqueado' ? 'bg-destructive/10 text-destructive' :
              'bg-muted text-muted-foreground'
            }`}>
              {statusLabel[stage.status]}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
