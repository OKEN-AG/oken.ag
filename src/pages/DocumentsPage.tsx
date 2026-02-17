import { motion } from 'framer-motion';
import { FileText, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import type { DocumentType } from '@/types/barter';

interface DocItem {
  type: DocumentType;
  label: string;
  description: string;
  status: 'emitido' | 'pendente' | 'assinado' | 'validado';
}

const documents: DocItem[] = [
  { type: 'termo_adesao', label: 'Termo de Adesão', description: 'Aceite do distribuidor aos termos da campanha', status: 'assinado' },
  { type: 'pedido', label: 'Pedido de Compra', description: 'Formalização do pedido com produtos e condições', status: 'emitido' },
  { type: 'termo_barter', label: 'Termo de Barter', description: 'Compromisso de entrega de commodity e documentação', status: 'pendente' },
  { type: 'ccv', label: 'Contrato de Compra e Venda (CCV)', description: 'Contrato com comprador de grãos pré-aprovado', status: 'pendente' },
  { type: 'cessao_credito', label: 'Cessão de Crédito', description: 'Cessão de direitos do CCV para o credor', status: 'pendente' },
  { type: 'cpr', label: 'CPR (Cédula de Produto Rural)', description: 'Garantia de entrega da produção agrícola', status: 'pendente' },
  { type: 'duplicata', label: 'Duplicata', description: 'Título de crédito comercial', status: 'pendente' },
  { type: 'nota_comercial', label: 'Nota Comercial', description: 'Instrumento de crédito complementar', status: 'pendente' },
  { type: 'certificado_aceite', label: 'Certificado de Aceite', description: 'Validação final de documentação e liberação', status: 'pendente' },
];

const statusConfig = {
  validado: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: 'Validado' },
  assinado: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', label: 'Assinado' },
  emitido: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Emitido' },
  pendente: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Pendente' },
};

export default function DocumentsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documentos & Formalização</h1>
        <p className="text-sm text-muted-foreground">Gestão de documentos da operação — emissão, assinatura e validação</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc, i) => {
          const config = statusConfig[doc.status];
          const Icon = config.icon;
          return (
            <motion.div
              key={doc.type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass-card p-4 hover:glow-border transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm font-semibold text-foreground">{doc.label}</span>
                </div>
                <span className={`engine-badge ${config.bg} ${config.color}`}>
                  <Icon className="w-3 h-3 inline mr-1" />
                  {config.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{doc.description}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Fluxo de Certificação</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {['Termo Adesão', 'Pedido', 'Termo Barter', 'CCV', 'Cessão', 'CPR/Garantias', 'Aceite', 'Faturamento'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span className={`engine-badge ${i < 2 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                {step}
              </span>
              {i < 7 && <span className="text-muted-foreground">→</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
