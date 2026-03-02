import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Scale, FileText, Pen, BookOpen, Users, GitCompare, ShieldCheck, Clock } from 'lucide-react';

export default function JuridicoPortalPage() {
  const { data: documents } = useQuery({
    queryKey: ['juridico-documents'],
    queryFn: async () => {
      const { data } = await supabase
        .from('operation_documents')
        .select('id, doc_type, status, operation_id, created_at, signed_at, validated_at, generated_at')
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ['juridico-templates'],
    queryFn: async () => {
      const { data } = await supabase
        .from('document_templates')
        .select('id, template_name, doc_type, active, variables, updated_at')
        .order('updated_at', { ascending: false });
      return data || [];
    },
  });

  const docs = documents || [];
  const pendingSign = docs.filter(d => d.status === 'emitido').length;
  const pendingValidation = docs.filter(d => d.status === 'assinado').length;
  const totalSigned = docs.filter(d => d.signed_at).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portal Jurídico / Formalização</h1>
        <p className="text-sm text-muted-foreground">Templates, minutas, assinatura, registro e evidências</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Pen className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-xs text-muted-foreground">Aguardando Assinatura</p>
              <p className="text-xl font-bold">{pendingSign}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <div>
              <p className="text-xs text-muted-foreground">Aguardando Validação</p>
              <p className="text-xl font-bold">{pendingValidation}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-xs text-muted-foreground">Documentos Assinados</p>
              <p className="text-xl font-bold">{totalSigned}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Templates Ativos</p>
              <p className="text-xl font-bold">{templates?.filter(t => t.active).length || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="documentos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="templates">Biblioteca de Templates</TabsTrigger>
          <TabsTrigger value="assinatura">Workflow de Assinatura</TabsTrigger>
          <TabsTrigger value="registro">Registry Hub</TabsTrigger>
        </TabsList>

        <TabsContent value="documentos">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Operação</TableHead>
                    <TableHead>Gerado em</TableHead>
                    <TableHead>Assinado em</TableHead>
                    <TableHead>Validado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium capitalize text-sm">{doc.doc_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-xs">{doc.status}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{doc.operation_id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{doc.generated_at ? new Date(doc.generated_at).toLocaleDateString('pt-BR') : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{doc.signed_at ? new Date(doc.signed_at).toLocaleDateString('pt-BR') : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{doc.validated_at ? new Date(doc.validated_at).toLocaleDateString('pt-BR') : '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!docs.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum documento encontrado</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Templates de Documentos</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Variáveis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Atualizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(templates || []).map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-sm">{t.template_name}</TableCell>
                      <TableCell className="text-xs capitalize">{t.doc_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.variables?.length || 0} vars</TableCell>
                      <TableCell>{t.active ? <Badge className="bg-emerald-500/10 text-emerald-400 text-xs">Ativo</Badge> : <Badge variant="outline" className="text-xs">Inativo</Badge>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString('pt-BR')}</TableCell>
                    </TableRow>
                  ))}
                  {!templates?.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum template cadastrado</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assinatura">
          <Card className="bg-card border-border p-8 text-center">
            <Users className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Poderes e signatários, workflow de assinatura + testemunhas, integração com assinatura eletrônica</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="registro">
          <Card className="bg-card border-border p-8 text-center">
            <Scale className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Registry Hub: pendências, exigências, retries, SLA por registrador, evidência de protocolo</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
