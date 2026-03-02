import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { User, FileText, Upload, CreditCard, FileCheck, CalendarDays, ArrowRight, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TomadorPortalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: myOperations } = useQuery({
    queryKey: ['tomador-operations', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('operations')
        .select('id, client_name, status, gross_revenue, due_date, commodity, total_sacas, payment_method, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  const { data: myDocs } = useQuery({
    queryKey: ['tomador-docs', user?.id],
    queryFn: async () => {
      const opIds = myOperations?.map(o => o.id) || [];
      if (!opIds.length) return [];
      const { data } = await supabase
        .from('operation_documents')
        .select('id, doc_type, status, operation_id, created_at')
        .in('operation_id', opIds)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!myOperations?.length,
  });

  const ops = myOperations || [];
  const activeOps = ops.filter(o => !['liquidado', 'cancelado'].includes(o.status));
  const totalDebt = activeOps.reduce((s, o) => s + (o.gross_revenue || 0), 0);
  const pendingDocs = (myDocs || []).filter(d => d.status === 'pendente').length;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portal do Tomador / Produtor</h1>
        <p className="text-sm text-muted-foreground">Cadastro, documentos, obrigações e acompanhamento</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Obrigações Ativas</p>
              <p className="text-xl font-bold">{activeOps.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-xs text-muted-foreground">Montante em Aberto</p>
              <p className="text-xl font-bold">R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="w-5 h-5 text-orange-400" />
            <div>
              <p className="text-xs text-muted-foreground">Docs Pendentes</p>
              <p className="text-xl font-bold">{pendingDocs}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-xs text-muted-foreground">KYC</p>
              <p className="text-sm font-medium text-muted-foreground">Pendente validação</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="operacoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="operacoes">Minhas Operações</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="cadastro">Cadastro / KYC</TabsTrigger>
          <TabsTrigger value="renegociacao">Renegociação</TabsTrigger>
        </TabsList>

        <TabsContent value="operacoes">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Montante</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ops.map(op => (
                    <TableRow key={op.id}>
                      <TableCell className="font-medium">{op.client_name || op.id.slice(0, 8)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-xs">{op.status}</Badge></TableCell>
                      <TableCell className="text-xs capitalize">{op.payment_method || '—'}</TableCell>
                      <TableCell className="text-xs">R$ {(op.gross_revenue || 0).toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-xs">{op.due_date ? new Date(op.due_date).toLocaleDateString('pt-BR') : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/operacao/${op.id}`)}>
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!ops.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma operação</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Envio de Documentos / Evidências</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Upload de documentos, comprovantes e evidências</p>
                <Badge variant="outline" className="mt-2">NEXT</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cadastro">
          <Card className="bg-card border-border p-8 text-center">
            <User className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Cadastro completo, KYC, consentimentos LGPD e validação documental</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="renegociacao">
          <Card className="bg-card border-border p-8 text-center">
            <FileCheck className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Renegociação, reestruturação e recomposição de garantias</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
