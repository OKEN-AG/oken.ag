import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, AlertTriangle, FileCheck, Clock, Wallet, BarChart3 } from 'lucide-react';

export default function CredorOemPortalPage() {
  const { data: operations } = useQuery({
    queryKey: ['credor-operations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('operations')
        .select('id, client_name, status, gross_revenue, net_revenue, financial_revenue, distributor_margin, commodity, total_sacas, due_date, created_at, payment_method')
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const ops = operations || [];
  const totalGross = ops.reduce((s, o) => s + (o.gross_revenue || 0), 0);
  const totalNet = ops.reduce((s, o) => s + (o.net_revenue || 0), 0);
  const totalFinancial = ops.reduce((s, o) => s + (o.financial_revenue || 0), 0);
  const statusCounts = ops.reduce((a, o) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {} as Record<string, number>);
  const activeCount = ops.filter(o => !['liquidado', 'cancelado'].includes(o.status)).length;
  const overdueCount = ops.filter(o => o.due_date && new Date(o.due_date) < new Date() && !['liquidado', 'cancelado'].includes(o.status)).length;

  const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portal Credor / OEM</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada por programa, carteira ativa, aging e reporting</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Receita Bruta Total</p>
                <p className="text-xl font-bold">{fmt(totalGross)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-xs text-muted-foreground">Receita Líquida</p>
                <p className="text-xl font-bold">{fmt(totalNet)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <div>
                <p className="text-xs text-muted-foreground">Carteira Ativa</p>
                <p className="text-xl font-bold">{activeCount} <span className="text-sm font-normal text-muted-foreground">operações</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <div>
                <p className="text-xs text-muted-foreground">Vencidas</p>
                <p className="text-xl font-bold">{overdueCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="carteira">Carteira Ativa</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="reports">Reports / Export</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Distribuição por Status</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {Object.entries(statusCounts).map(([s, c]) => (
                  <div key={s} className="border border-border rounded-md px-4 py-2 text-center min-w-[100px]">
                    <p className="text-lg font-bold">{c}</p>
                    <p className="text-xs text-muted-foreground capitalize">{s}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="carteira">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Commodity</TableHead>
                    <TableHead>Sacas</TableHead>
                    <TableHead>Receita Bruta</TableHead>
                    <TableHead>Vencimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ops.filter(o => !['liquidado', 'cancelado'].includes(o.status)).slice(0, 20).map(op => (
                    <TableRow key={op.id}>
                      <TableCell className="font-medium">{op.client_name}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-xs">{op.status}</Badge></TableCell>
                      <TableCell className="text-xs uppercase">{op.commodity || '—'}</TableCell>
                      <TableCell className="text-xs">{op.total_sacas?.toLocaleString('pt-BR') || '—'}</TableCell>
                      <TableCell className="text-xs">{op.gross_revenue ? fmt(op.gross_revenue) : '—'}</TableCell>
                      <TableCell className="text-xs">{op.due_date ? new Date(op.due_date).toLocaleDateString('pt-BR') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging">
          <Card className="bg-card border-border p-8 text-center">
            <Clock className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Aging detalhado com DSO, LGD, roll rate, inadimplência e concentração</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card className="bg-card border-border p-8 text-center">
            <FileCheck className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Packs por campanha/veículo, export CSV/PDF, data room por caso</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
