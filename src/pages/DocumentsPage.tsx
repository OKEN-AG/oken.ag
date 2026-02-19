import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, CheckCircle, Clock, AlertTriangle, Lock, Train, ArrowRight, PenLine, ShieldCheck } from 'lucide-react';
import { useOperations, useOperationDocuments } from '@/hooks/useOperations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { buildWagonStages, canAdvance, getBlockingReason } from '@/engines/orchestrator';
import TrainTrack from '@/components/TrainTrack';
import type { DocumentType, JourneyModule } from '@/types/barter';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: operations, isLoading } = useOperations();
  const [selectedOpId, setSelectedOpId] = useState<string>('');
  const { data: docs, refetch: refetchDocs } = useOperationDocuments(selectedOpId || undefined);
  const [emitting, setEmitting] = useState<string | null>(null);

  const selectedOp = operations?.find(op => op.id === selectedOpId);

  const { data: campaignModules } = useQuery({
    queryKey: ['campaign-modules-docs', selectedOp?.campaign_id],
    enabled: !!selectedOp?.campaign_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('active_modules')
        .eq('id', selectedOp!.campaign_id)
        .maybeSingle();
      if (error) throw error;
      return (data?.active_modules || []) as JourneyModule[];
    },
  });

  const activeModules: JourneyModule[] = campaignModules && campaignModules.length > 0
    ? campaignModules
    : ['adesao', 'simulacao', 'formalizacao', 'documentos', 'garantias'];

  const wagonStages = useMemo(() => {
    if (!selectedOp || !docs) return [];
    const docList = (docs || []).map(d => ({ doc_type: d.doc_type, status: d.status }));
    return buildWagonStages(activeModules, selectedOp.status as any, docList);
  }, [selectedOp, docs, activeModules]);

  const nextStatus = useMemo(() => {
    if (!selectedOp || !docs) return null;
    const docList = (docs || []).map(d => ({ doc_type: d.doc_type, status: d.status }));
    return canAdvance(activeModules, selectedOp.status as any, docList);
  }, [selectedOp, docs, activeModules]);

  const blockingReason = useMemo(() => {
    if (!selectedOp || !docs) return null;
    const docList = (docs || []).map(d => ({ doc_type: d.doc_type, status: d.status }));
    return getBlockingReason(activeModules, selectedOp.status as any, docList);
  }, [selectedOp, docs, activeModules]);

  const handleEmitDocument = async (docType: DocumentType) => {
    if (!selectedOpId || !user) return;
    setEmitting(docType);
    try {
      const existing = docs?.find(d => d.doc_type === docType);
      if (existing) {
        await supabase
          .from('operation_documents')
          .update({ status: 'emitido', generated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase.from('operation_documents').insert({
          operation_id: selectedOpId,
          doc_type: docType,
          status: 'emitido',
          generated_at: new Date().toISOString(),
        });
      }
      await supabase.from('operation_logs').insert({
        operation_id: selectedOpId, user_id: user.id,
        action: `documento_emitido_${docType}`, details: { doc_type: docType },
      });
      toast.success(`Documento "${docType}" emitido com sucesso`);
      refetchDocs();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setEmitting(null);
    }
  };

  // FIX: Sign document action
  const handleSignDocument = async (docType: DocumentType) => {
    if (!selectedOpId || !user) return;
    setEmitting(docType);
    try {
      const existing = docs?.find(d => d.doc_type === docType);
      if (!existing) return;
      await supabase
        .from('operation_documents')
        .update({ status: 'assinado', signed_at: new Date().toISOString() })
        .eq('id', existing.id);
      await supabase.from('operation_logs').insert({
        operation_id: selectedOpId, user_id: user.id,
        action: `documento_assinado_${docType}`, details: { doc_type: docType },
      });
      toast.success(`Documento "${docType}" assinado`);
      refetchDocs();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setEmitting(null);
    }
  };

  // FIX: Validate document action
  const handleValidateDocument = async (docType: DocumentType) => {
    if (!selectedOpId || !user) return;
    setEmitting(docType);
    try {
      const existing = docs?.find(d => d.doc_type === docType);
      if (!existing) return;
      await supabase
        .from('operation_documents')
        .update({ status: 'validado', validated_at: new Date().toISOString() } as any)
        .eq('id', existing.id);
      await supabase.from('operation_logs').insert({
        operation_id: selectedOpId, user_id: user.id,
        action: `documento_validado_${docType}`, details: { doc_type: docType },
      });
      toast.success(`Documento "${docType}" validado`);
      refetchDocs();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setEmitting(null);
    }
  };

  const handleAdvance = async () => {
    if (!selectedOpId || !nextStatus || !user) return;
    try {
      await supabase
        .from('operations')
        .update({ status: nextStatus })
        .eq('id', selectedOpId);
      await supabase.from('operation_logs').insert({
        operation_id: selectedOpId, user_id: user.id,
        action: `status_avancado_${nextStatus}`, details: { from: selectedOp?.status, to: nextStatus },
      });
      toast.success(`Operação avançada para: ${nextStatus}`);
      queryClient.invalidateQueries({ queryKey: ['operations'] });
      refetchDocs();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  const docMap = new Map((docs || []).map(d => [d.doc_type, d]));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documentos & Formalização</h1>
          <p className="text-sm text-muted-foreground">Gestão de documentos e certificação da operação</p>
        </div>
        <div className="flex items-center gap-3">
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
      </div>

      {!operations || operations.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Nenhuma operação encontrada. Crie uma simulação primeiro.</div>
      ) : !selectedOpId ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Selecione uma operação para ver seus documentos.</div>
      ) : (
        <>
          {wagonStages.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Train className="w-4 h-4 text-primary" /> Fluxo de Certificação (Trem)
                </h2>
                {selectedOp && (
                  <span className="engine-badge bg-primary/10 text-primary">
                    Status: {selectedOp.status}
                  </span>
                )}
              </div>
              <TrainTrack stages={wagonStages} />

              <div className="mt-4 flex items-center justify-between">
                {blockingReason ? (
                  <div className="flex items-center gap-2 text-xs text-warning">
                    <Lock className="w-3 h-3" /> {blockingReason}
                  </div>
                ) : nextStatus ? (
                  <div className="flex items-center gap-2 text-xs text-success">
                    <CheckCircle className="w-3 h-3" /> Todos os gates passaram!
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Selecione e emita documentos para avançar</div>
                )}
                {nextStatus && (
                  <Button size="sm" onClick={handleAdvance} className="bg-success text-success-foreground hover:bg-success/90">
                    <ArrowRight className="w-4 h-4 mr-1" /> Avançar para {nextStatus}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allDocTypes.map((doc, i) => {
              const existing = docMap.get(doc.type);
              const status = (existing?.status as keyof typeof statusConfig) || 'pendente';
              const config = statusConfig[status];
              const Icon = config.icon;
              return (
                <motion.div key={doc.type} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-card p-4 hover:glow-border transition-all group">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-sm font-semibold text-foreground">{doc.label}</span>
                    </div>
                    <span className={`engine-badge ${config.bg} ${config.color}`}><Icon className="w-3 h-3 inline mr-1" />{config.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{doc.description}</p>

                  {/* Actions based on current status */}
                  <div className="flex gap-2">
                    {status === 'pendente' && (
                      <Button size="sm" variant="outline" className="flex-1 text-xs border-primary/30 text-primary hover:bg-primary/10"
                        disabled={emitting === doc.type} onClick={() => handleEmitDocument(doc.type)}>
                        {emitting === doc.type ? 'Emitindo...' : 'Emitir Documento'}
                      </Button>
                    )}
                    {status === 'emitido' && (
                      <Button size="sm" variant="outline" className="flex-1 text-xs border-primary/30 text-primary hover:bg-primary/10"
                        disabled={emitting === doc.type} onClick={() => handleSignDocument(doc.type)}>
                        <PenLine className="w-3 h-3 mr-1" /> {emitting === doc.type ? 'Assinando...' : 'Assinar'}
                      </Button>
                    )}
                    {status === 'assinado' && (
                      <Button size="sm" variant="outline" className="flex-1 text-xs border-success/30 text-success hover:bg-success/10"
                        disabled={emitting === doc.type} onClick={() => handleValidateDocument(doc.type)}>
                        <ShieldCheck className="w-3 h-3 mr-1" /> {emitting === doc.type ? 'Validando...' : 'Validar'}
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
