import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, Clock, FileText, ShieldCheck, AlertTriangle } from 'lucide-react';

const statusColors: Record<string, string> = {
  pendente: 'bg-muted text-muted-foreground',
  emitido: 'bg-warning/10 text-warning',
  assinado: 'bg-primary/10 text-primary',
  validado: 'bg-success/10 text-success',
};

export default function BuyerPortalPage() {
  const { user } = useAuth();

  // Fetch operations where the logged-in user's buyer name matches the counterparty
  // For now, fetch all operations with barter payment that have documents
  const { data: operations, isLoading } = useQuery({
    queryKey: ['buyer-portal-operations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operations')
        .select('id, client_name, counterparty, status, commodity, total_sacas, commodity_price, created_at, campaign_id')
        .eq('payment_method', 'barter')
        .not('counterparty', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch documents (CCV + cessão) for all visible operations
  const operationIds = operations?.map(o => o.id) || [];
  const { data: documents, refetch: refetchDocs } = useQuery({
    queryKey: ['buyer-portal-docs', operationIds],
    enabled: operationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operation_documents')
        .select('*')
        .in('operation_id', operationIds)
        .in('doc_type', ['ccv', 'cessao_credito']);
      if (error) throw error;
      return data || [];
    },
  });

  const handleAcceptCession = async (docId: string) => {
    const doc = documents?.find(d => d.id === docId);
    if (!doc) return;
    const docData = (doc.data as any) || {};
    await supabase.from('operation_documents').update({
      data: { ...docData, counterparty_notified: true, cession_accepted: true, notification_method: 'portal_comprador', notified_at: new Date().toISOString() },
    } as any).eq('id', docId);
    toast.success('Cessão aceita com sucesso');
    refetchDocs();
  };

  const handleRejectCession = async (docId: string) => {
    const doc = documents?.find(d => d.id === docId);
    if (!doc) return;
    const docData = (doc.data as any) || {};
    await supabase.from('operation_documents').update({
      data: { ...docData, counterparty_notified: true, cession_accepted: false, notification_method: 'portal_comprador', notified_at: new Date().toISOString() },
    } as any).eq('id', docId);
    toast.info('Cessão rejeitada');
    refetchDocs();
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portal do Comprador</h1>
        <p className="text-sm text-muted-foreground">Gerencie contratos, cessões e confirmações de pagamento.</p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-center py-8">Carregando...</div>
      ) : !operations?.length ? (
        <div className="glass-card p-8 text-center text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Nenhuma operação de barter encontrada.
        </div>
      ) : (
        <div className="space-y-4">
          {operations.map(op => {
            const opDocs = documents?.filter(d => d.operation_id === op.id) || [];
            const ccv = opDocs.find(d => d.doc_type === 'ccv');
            const cessao = opDocs.find(d => d.doc_type === 'cessao_credito');
            const cessaoData = (cessao?.data as any) || {};

            return (
              <div key={op.id} className="glass-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{op.client_name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Comprador: {op.counterparty} • {op.commodity?.toUpperCase()} • {op.total_sacas?.toLocaleString('pt-BR')} sacas
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{op.status}</Badge>
                </div>

                <div className="border border-border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Documento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notificação</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ccv && (
                        <TableRow>
                          <TableCell className="font-medium">CCV (Contrato de Compra e Venda)</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${statusColors[ccv.status]}`}>
                              {ccv.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">—</TableCell>
                          <TableCell className="text-right">
                            <span className="text-xs text-muted-foreground">Visualização</span>
                          </TableCell>
                        </TableRow>
                      )}
                      {cessao && (
                        <TableRow>
                          <TableCell className="font-medium">Cessão de Crédito</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${statusColors[cessao.status]}`}>
                              {cessao.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            {cessaoData.counterparty_notified ? (
                              <span className="text-xs flex items-center gap-1">
                                {cessaoData.cession_accepted ? (
                                  <><CheckCircle className="w-3 h-3 text-success" /> Aceita</>
                                ) : cessaoData.cession_accepted === false ? (
                                  <><XCircle className="w-3 h-3 text-destructive" /> Rejeitada</>
                                ) : (
                                  <><Clock className="w-3 h-3 text-warning" /> Notificado ({cessaoData.notification_method})</>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Pendente
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!cessaoData.counterparty_notified || (!cessaoData.cession_accepted && cessaoData.cession_accepted !== false) ? (
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="outline" className="text-xs text-success border-success" onClick={() => handleAcceptCession(cessao.id)}>
                                  <CheckCircle className="w-3 h-3 mr-1" /> Aceitar
                                </Button>
                                <Button size="sm" variant="outline" className="text-xs text-destructive border-destructive" onClick={() => handleRejectCession(cessao.id)}>
                                  <XCircle className="w-3 h-3 mr-1" /> Rejeitar
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Concluído</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                      {!ccv && !cessao && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                            Nenhum documento de barter emitido ainda.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
