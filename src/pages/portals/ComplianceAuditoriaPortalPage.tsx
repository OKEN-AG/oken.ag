import { useAuditTrail } from '@/contexts/audit/AuditTrailContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldCheck, FileSearch, Scale, AlertTriangle, Lock, Eye, BookOpen } from 'lucide-react';

export default function ComplianceAuditoriaPortalPage() {
  const { entries } = useAuditTrail();

  const { data: statusHistory } = useQuery({
    queryKey: ['compliance-status-history'],
    queryFn: async () => {
      const { data } = await supabase
        .from('operation_status_history')
        .select('id, operation_id, from_status, to_status, changed_by, changed_at, notes')
        .order('changed_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const { data: docs } = useQuery({
    queryKey: ['compliance-docs-overview'],
    queryFn: async () => {
      const { data } = await supabase
        .from('operation_documents')
        .select('id, doc_type, status, operation_id, created_at, signed_at, validated_at')
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const docStatusCounts = (docs || []).reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {} as Record<string, number>);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portal Compliance / Auditoria</h1>
        <p className="text-sm text-muted-foreground">Rastreabilidade, segregação, reconciliação e reporting regulatório</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Eye className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Ações Auditadas</p>
              <p className="text-xl font-bold">{entries.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <FileSearch className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-xs text-muted-foreground">Docs Pendentes</p>
              <p className="text-xl font-bold">{docStatusCounts['pendente'] || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-xs text-muted-foreground">Docs Validados</p>
              <p className="text-xl font-bold">{docStatusCounts['validado'] || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Transições de Status</p>
              <p className="text-xl font-bold">{statusHistory?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="auditoria" className="space-y-4">
        <TabsList>
          <TabsTrigger value="auditoria">Trilha de Auditoria</TabsTrigger>
          <TabsTrigger value="transicoes">Transições de Status</TabsTrigger>
          <TabsTrigger value="politicas">Políticas Versionadas</TabsTrigger>
          <TabsTrigger value="regulatorio">Reports Regulatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="auditoria">
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-2">
              {entries.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Nenhuma ação crítica registrada nesta sessão.</p>}
              {entries.slice(0, 20).map(entry => (
                <div key={entry.id} className="border border-border rounded-md p-3 text-sm">
                  <div className="flex justify-between">
                    <p className="font-medium">{entry.action}</p>
                    <Badge variant="outline" className="text-xs">{entry.portal || 'sistema'}</Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">{entry.actor} • {new Date(entry.timestamp).toLocaleString('pt-BR')}</p>
                  {entry.details && <p className="text-muted-foreground text-xs mt-1">{entry.details}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transicoes">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operação</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>Para</TableHead>
                    <TableHead>Por</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(statusHistory || []).map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs font-mono">{h.operation_id.slice(0, 8)}…</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{h.from_status}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{h.to_status}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{h.changed_by.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(h.changed_at).toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{h.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!statusHistory?.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma transição registrada</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="politicas">
          <Card className="bg-card border-border p-8 text-center">
            <Lock className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Publish/Draft de policies, versionamento, effective_from/to, "policy used" por decisão</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="regulatorio">
          <Card className="bg-card border-border p-8 text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Relatórios por wrapper (88/fundos/sec), por tenant, export regulatório e LGPD</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
