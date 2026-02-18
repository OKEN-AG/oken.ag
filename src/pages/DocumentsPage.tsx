import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { useOperations, useOperationDocuments } from '@/hooks/useOperations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { DocumentType } from '@/types/barter';

const allDocTypes: { type: DocumentType; label: string; description: string }[] = [
  { type: 'termo_adesao', label: 'Termo de Adesão', description: 'Aceite do distribuidor aos termos da campanha' },
  { type: 'pedido', label: 'Pedido de Compra', description: 'Formalização do pedido com produtos e condições' },
  { type: 'termo_barter', label: 'Termo de Barter', description: 'Compromisso de entrega de commodity e documentação' },
  { type: 'ccv', label: 'Contrato de Compra e Venda (CCV)', description: 'Contrato com comprador de grãos pré-aprovado' },
  { type: 'cessao_credito', label: 'Cessão de Crédito', description: 'Cessão de direitos do CCV para o credor' },
  { type: 'cpr', label: 'CPR (Cédula de Produto Rural)', description: 'Garantia de entrega da produção agrícola' },
  { type: 'duplicata', label: 'Duplicata', description: 'Título de crédito comercial' },
  { type: 'nota_comercial', label: 'Nota Comercial', description: 'Instrumento de crédito complementar' },
  { type: 'certificado_aceite', label: 'Certificado de Aceite', description: 'Validação final de documentação e liberação' },
];

const statusConfig = {
  validado: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: 'Validado' },
  assinado: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', label: 'Assinado' },
  emitido: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Emitido' },
  pendente: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Pendente' },
};

export default function DocumentsPage() {
  const { data: operations, isLoading } = useOperations();
  const [selectedOpId, setSelectedOpId] = useState<string>('');
  const { data: docs } = useOperationDocuments(selectedOpId || undefined);

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  const docMap = new Map((docs || []).map(d => [d.doc_type, d]));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documentos & Formalização</h1>
          <p className="text-sm text-muted-foreground">Gestão de documentos da operação</p>
        </div>
        {operations && operations.length > 0 && (
          <Select value={selectedOpId} onValueChange={setSelectedOpId}>
            <SelectTrigger className="w-72 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione operação..." /></SelectTrigger>
            <SelectContent>
              {operations.map(op => (
                <SelectItem key={op.id} value={op.id}>{op.client_name || 'Sem nome'} — {op.status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!operations || operations.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Nenhuma operação encontrada. Crie uma simulação primeiro.</div>
      ) : !selectedOpId ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Selecione uma operação para ver seus documentos.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allDocTypes.map((doc, i) => {
              const existing = docMap.get(doc.type);
              const status = (existing?.status as keyof typeof statusConfig) || 'pendente';
              const config = statusConfig[status];
              const Icon = config.icon;
              return (
                <motion.div key={doc.type} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-card p-4 hover:glow-border transition-all cursor-pointer group">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-sm font-semibold text-foreground">{doc.label}</span>
                    </div>
                    <span className={`engine-badge ${config.bg} ${config.color}`}><Icon className="w-3 h-3 inline mr-1" />{config.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{doc.description}</p>
                </motion.div>
              );
            })}
          </div>

          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Fluxo de Certificação</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {['Termo Adesão', 'Pedido', 'Termo Barter', 'CCV', 'Cessão', 'CPR/Garantias', 'Aceite', 'Faturamento'].map((step, i) => {
                const completed = i < (docs?.filter(d => d.status !== 'pendente').length || 0);
                return (
                  <div key={step} className="flex items-center gap-2">
                    <span className={`engine-badge ${completed ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{step}</span>
                    {i < 7 && <span className="text-muted-foreground">→</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
