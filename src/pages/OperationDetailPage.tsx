import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, FileText, Shield, Wheat, DollarSign, MapPin, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

const statusColor: Record<string, string> = {
  simulacao: 'bg-muted text-muted-foreground',
  pedido: 'bg-info/10 text-info',
  formalizado: 'bg-warning/10 text-warning',
  garantido: 'bg-primary/10 text-primary',
  faturado: 'bg-success/10 text-success',
  monitorando: 'bg-accent/10 text-accent-foreground',
  liquidado: 'bg-success/20 text-success',
};

export default function OperationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: operation, isLoading } = useQuery({
    queryKey: ['operation-detail', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('operations').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ['operation-detail-items', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('operation_items').select('*, products(name, unit_type, category)').eq('operation_id', id!);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['operation-detail-docs', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('operation_documents').select('*').eq('operation_id', id!).order('created_at');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: guarantees = [] } = useQuery({
    queryKey: ['operation-detail-guarantees', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('operation_guarantees').select('*').eq('operation_id', id!).order('created_at');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ['operation-detail-history', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('operation_status_history').select('*').eq('operation_id', id!).order('changed_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ['operation-detail-deliveries', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('grain_deliveries' as any).select('*').eq('operation_id', id!).order('delivered_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: campaign } = useQuery({
    queryKey: ['operation-detail-campaign', operation?.campaign_id],
    enabled: !!operation?.campaign_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('campaigns').select('name, season').eq('id', operation!.campaign_id).single();
      if (error) throw error;
      return data;
    },
  });

  const fmt = (v: number | null) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!operation) return <div className="p-6 text-center text-muted-foreground">Operação não encontrada.</div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{operation.client_name || 'Operação'}</h1>
          <p className="text-sm text-muted-foreground">{campaign?.name} · {campaign?.season}</p>
        </div>
        <Badge className={statusColor[operation.status] || 'bg-muted'}>{operation.status}</Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />Receita Bruta</div>
          <div className="text-lg font-mono font-bold">{fmt(operation.gross_revenue)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />Receita Líquida</div>
          <div className="text-lg font-mono font-bold">{fmt(operation.net_revenue)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Wheat className="w-3 h-3" />Sacas</div>
          <div className="text-lg font-mono font-bold">{(operation.total_sacas || 0).toLocaleString('pt-BR')}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />Área</div>
          <div className="text-lg font-mono font-bold">{(operation.area_hectares || 0).toLocaleString('pt-BR')} ha</div>
        </CardContent></Card>
      </div>

      {/* Context info */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Dados da Operação</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 text-sm">
            <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{operation.client_name}</span></div>
            <div><span className="text-muted-foreground">Documento:</span> <span className="font-mono">{operation.client_document || '—'}</span></div>
            <div><span className="text-muted-foreground">Canal:</span> <span>{operation.channel}</span></div>
            <div><span className="text-muted-foreground">Estado:</span> <span>{operation.state || '—'}</span></div>
            <div><span className="text-muted-foreground">Cidade:</span> <span>{operation.city || '—'}</span></div>
            <div><span className="text-muted-foreground">Commodity:</span> <span className="capitalize">{operation.commodity || 'soja'}</span></div>
            <div><span className="text-muted-foreground">Pagamento:</span> <span>{operation.payment_method || '—'}</span></div>
            <div><span className="text-muted-foreground">Vencimento:</span> <span>{operation.due_date || '—'}</span></div>
            <div><span className="text-muted-foreground">Contraparte:</span> <span>{operation.counterparty || '—'}</span></div>
            <div><span className="text-muted-foreground">Desconto Combo:</span> <span className="font-mono">{(operation.combo_discount || 0).toFixed(2)}%</span></div>
            <div><span className="text-muted-foreground">Desconto Barter:</span> <span className="font-mono">{(operation.barter_discount || 0).toFixed(2)}%</span></div>
            <div><span className="text-muted-foreground">Margem Distrib.:</span> <span className="font-mono">{fmt(operation.distributor_margin)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Produtos ({items.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Dose/ha</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Caixas</TableHead>
                  <TableHead>Preço Unit.</TableHead>
                  <TableHead>Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.products?.name || '—'}</TableCell>
                    <TableCell className="font-mono">{item.dose_per_hectare}</TableCell>
                    <TableCell className="font-mono">{(item.rounded_quantity || 0).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="font-mono">{item.boxes || 0}</TableCell>
                    <TableCell className="font-mono">{fmt(item.normalized_price)}</TableCell>
                    <TableCell className="font-mono font-semibold">{fmt(item.subtotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Gross-to-Net */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Análise Gross-to-Net</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Receita Bruta</span><span className="font-mono">{fmt(operation.gross_revenue)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>— Desconto Combo ({(operation.combo_discount || 0).toFixed(2)}%)</span><span className="font-mono">- {fmt((operation.gross_revenue || 0) * (operation.combo_discount || 0) / 100)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>— Desconto Barter ({(operation.barter_discount || 0).toFixed(2)}%)</span><span className="font-mono">- {fmt((operation.gross_revenue || 0) * (operation.barter_discount || 0) / 100)}</span></div>
            <Separator />
            <div className="flex justify-between"><span>Receita Comercial</span><span className="font-mono">{fmt((operation.gross_revenue || 0) - (operation.gross_revenue || 0) * ((operation.combo_discount || 0) + (operation.barter_discount || 0)) / 100)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>+ Receita Financeira</span><span className="font-mono">{fmt(operation.financial_revenue)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>— Margem Distribuidor</span><span className="font-mono">- {fmt(operation.distributor_margin)}</span></div>
            <Separator />
            <div className="flex justify-between font-semibold"><span>Receita Líquida</span><span className="font-mono">{fmt(operation.net_revenue)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      {documents.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Documentos ({documents.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded bg-muted/50 text-sm">
                  <div>
                    <span className="font-medium capitalize">{doc.doc_type.replace(/_/g, ' ')}</span>
                    {doc.guarantee_category && <Badge variant="outline" className="ml-2 text-xs">{doc.guarantee_category}</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={doc.status === 'assinado' ? 'default' : 'outline'}>{doc.status}</Badge>
                    {doc.signed_at && <span className="text-xs text-muted-foreground">{new Date(doc.signed_at).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guarantees */}
      {guarantees.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" />Garantias ({guarantees.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {guarantees.map((g: any) => (
                <div key={g.id} className="flex items-center justify-between p-3 rounded bg-muted/50 text-sm">
                  <div>
                    <span className="font-medium capitalize">{g.category.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground ml-2 font-mono">{fmt(g.estimated_value)}</span>
                  </div>
                  <Badge variant={g.status === 'aceita' ? 'default' : 'outline'}>{g.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grain deliveries */}
      {deliveries.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wheat className="w-4 h-4" />Entregas de Grãos ({deliveries.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Preço Unit.</TableHead>
                  <TableHead>Local</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell>{new Date(d.delivered_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="font-mono">{Number(d.delivered_quantity).toLocaleString('pt-BR')} sacas</TableCell>
                    <TableCell className="font-mono">R$ {Number(d.unit_price).toFixed(2)}</TableCell>
                    <TableCell>{d.delivery_location || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Status history */}
      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Calendar className="w-4 h-4" />Histórico de Status</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((h: any) => (
                <div key={h.id} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-muted-foreground w-36">{new Date(h.changed_at).toLocaleString('pt-BR')}</span>
                  <Badge variant="outline">{h.from_status}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge>{h.to_status}</Badge>
                  {h.notes && <span className="text-xs text-muted-foreground truncate">{h.notes}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
