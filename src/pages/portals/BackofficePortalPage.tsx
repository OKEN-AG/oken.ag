import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditTrail } from '@/contexts/audit/AuditTrailContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ClipboardList, FileText, ShieldCheck, CreditCard, BarChart3, AlertTriangle,
  ArrowRight, Clock, CheckCircle2, XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const queueDefs = [
  { key: 'kyc', label: 'KYC / Cadastro', icon: ShieldCheck, color: 'text-blue-400' },
  { key: 'docs', label: 'Documentos Pendentes', icon: FileText, color: 'text-amber-400' },
  { key: 'formalizacao', label: 'Formalização', icon: ClipboardList, color: 'text-purple-400' },
  { key: 'pagamentos', label: 'Pagamentos', icon: CreditCard, color: 'text-emerald-400' },
  { key: 'reconciliacao', label: 'Reconciliação', icon: BarChart3, color: 'text-cyan-400' },
  { key: 'cobranca', label: 'Cobrança', icon: AlertTriangle, color: 'text-red-400' },
];

export default function BackofficePortalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { entries, logCriticalAction } = useAuditTrail();

  const { data: operations } = useQuery({
    queryKey: ['backoffice-operations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('operations')
        .select('id, client_name, status, campaign_id, created_at, payment_method, commodity, total_sacas, city, state')
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const { data: pendingDocs } = useQuery({
    queryKey: ['backoffice-pending-docs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('operation_documents')
        .select('id, doc_type, status, operation_id, created_at')
        .eq('status', 'pendente')
        .order('created_at', { ascending: true })
        .limit(20);
      return data || [];
    },
  });

  const statusCounts = (operations || []).reduce((acc, op) => {
    acc[op.status] = (acc[op.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const recentAudit = entries.slice(0, 10);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cockpit Operacional</h1>
        <p className="text-sm text-muted-foreground">Central de filas, exceções, reprocesso e conciliação</p>
      </div>

      {/* Queue Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {queueDefs.map(q => {
          const count = q.key === 'docs' ? (pendingDocs?.length || 0) :
            q.key === 'formalizacao' ? (statusCounts['pedido'] || 0) :
            q.key === 'pagamentos' ? (statusCounts['faturado'] || 0) :
            q.key === 'reconciliacao' ? (statusCounts['liquidado'] || 0) :
            q.key === 'cobranca' ? (statusCounts['inadimplente'] || 0) : 0;
          return (
            <Card key={q.key} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <q.icon className={`w-5 h-5 ${q.color}`} />
                    <div>
                      <p className="text-sm font-medium">{q.label}</p>
                      <p className="text-2xl font-bold">{count}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">SLA 24h</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="operacoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="operacoes">Operações Recentes</TabsTrigger>
          <TabsTrigger value="docs">Docs Pendentes</TabsTrigger>
          <TabsTrigger value="excecoes">Exceções / Incidentes</TabsTrigger>
          <TabsTrigger value="auditoria">Trilha de Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="operacoes">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(operations || []).slice(0, 15).map(op => (
                    <TableRow key={op.id}>
                      <TableCell className="font-medium">{op.client_name || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-xs">{op.status}</Badge></TableCell>
                      <TableCell className="text-xs capitalize">{op.payment_method || '—'}</TableCell>
                      <TableCell className="text-xs">{op.city}{op.state ? ` / ${op.state}` : ''}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(op.created_at).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/operacao/${op.id}`)}>
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Operação</TableHead>
                    <TableHead>Criado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pendingDocs || []).map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium capitalize">{doc.doc_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{doc.status}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{doc.operation_id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</TableCell>
                    </TableRow>
                  ))}
                  {!pendingDocs?.length && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum documento pendente</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="excecoes">
          <Card className="bg-card border-border p-8 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Case management real (owner, comentários, playbooks, reabertura, DLQ, reprocesso idempotente)</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="auditoria">
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-2">
              {recentAudit.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">Nenhuma ação crítica registrada.</p>}
              {recentAudit.map(entry => (
                <div key={entry.id} className="border border-border rounded-md p-3 text-sm">
                  <p className="font-medium">{entry.action}</p>
                  <p className="text-muted-foreground">{entry.actor} • {new Date(entry.timestamp).toLocaleString('pt-BR')}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
