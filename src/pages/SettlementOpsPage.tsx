import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Landmark, Timer, Wheat, Plus, CheckCircle2 } from 'lucide-react';
import StatCard from '@/components/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useOperations } from '@/hooks/useOperations';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function SettlementOpsPage() {
  const queryClient = useQueryClient();
  const { data: operations = [], isLoading: opsLoading } = useOperations();
  const [selectedOpId, setSelectedOpId] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({
    delivered_quantity: '',
    expected_quantity: '',
    unit_price: '',
    quality_discount_pct: '0',
    delivery_location: '',
    notes: '',
  });

  const settleOps = operations.filter(o => ['faturado', 'monitorando', 'garantido', 'liquidado'].includes(o.status));

  const { data: grainDeliveries = [], isLoading: deliveriesLoading } = useQuery({
    queryKey: ['settlement-grain-deliveries'],
    queryFn: async () => {
      const { data, error } = await supabase.from('grain_deliveries' as any).select('*').order('delivered_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: settlementEntries = [] } = useQuery({
    queryKey: ['settlement-entries-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settlement_entries' as any).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const insertDelivery = useMutation({
    mutationFn: async (form: typeof deliveryForm & { operation_id: string }) => {
      const qty = Number(form.delivered_quantity);
      const price = Number(form.unit_price);
      const qualityFactor = 1 - Number(form.quality_discount_pct) / 100;
      const amount = Math.round(qty * price * qualityFactor * 100) / 100;

      const { data: delivery, error: e1 } = await supabase.from('grain_deliveries' as any).insert({
        operation_id: form.operation_id,
        delivered_quantity: qty,
        expected_quantity: Number(form.expected_quantity),
        unit_price: price,
        quality_discount_pct: Number(form.quality_discount_pct),
        delivery_location: form.delivery_location,
        notes: form.notes,
      } as any).select().single();
      if (e1) throw e1;

      const { error: e2 } = await supabase.from('settlement_entries' as any).insert({
        operation_id: form.operation_id,
        kind: 'grain_delivery',
        amount,
        currency: 'BRL',
        description: `Entrega ${qty} sacas @ R$${price}`,
        grain_delivery_id: (delivery as any).id,
      } as any);
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlement-grain-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['settlement-entries-all'] });
      toast.success('Entrega registrada com sucesso');
      setDialogOpen(false);
      setDeliveryForm({ delivered_quantity: '', expected_quantity: '', unit_price: '', quality_discount_pct: '0', delivery_location: '', notes: '' });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const totalDeliveredQty = grainDeliveries.reduce((s: number, d: any) => s + Number(d.delivered_quantity || 0), 0);
  const totalSettledAmount = settlementEntries.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const totalExpectedSacas = settleOps.reduce((s, o) => s + (o.total_sacas || 0), 0);
  const deliveryPct = totalExpectedSacas > 0 ? Math.round((totalDeliveredQty / totalExpectedSacas) * 100) : 0;
  const pendingOps = settleOps.filter(o => o.status !== 'liquidado').length;

  if (opsLoading || deliveriesLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Liquidação de Operações</h1>
          <p className="text-sm text-muted-foreground">Registro de entregas, conciliação e compensação</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Registrar Entrega</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Entrega de Grãos</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Operação</Label>
                <Select value={selectedOpId} onValueChange={setSelectedOpId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {settleOps.map(op => (
                      <SelectItem key={op.id} value={op.id}>{op.client_name} — {(op.total_sacas || 0).toLocaleString('pt-BR')} sacas</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Qtd Entregue (sacas)</Label><Input type="number" value={deliveryForm.delivered_quantity} onChange={e => setDeliveryForm(f => ({ ...f, delivered_quantity: e.target.value }))} /></div>
                <div><Label>Qtd Esperada (sacas)</Label><Input type="number" value={deliveryForm.expected_quantity} onChange={e => setDeliveryForm(f => ({ ...f, expected_quantity: e.target.value }))} /></div>
                <div><Label>Preço Unitário (R$)</Label><Input type="number" value={deliveryForm.unit_price} onChange={e => setDeliveryForm(f => ({ ...f, unit_price: e.target.value }))} /></div>
                <div><Label>Desconto Qualidade (%)</Label><Input type="number" value={deliveryForm.quality_discount_pct} onChange={e => setDeliveryForm(f => ({ ...f, quality_discount_pct: e.target.value }))} /></div>
              </div>
              <div><Label>Local de Entrega</Label><Input value={deliveryForm.delivery_location} onChange={e => setDeliveryForm(f => ({ ...f, delivery_location: e.target.value }))} /></div>
              <div><Label>Observações</Label><Input value={deliveryForm.notes} onChange={e => setDeliveryForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button disabled={!selectedOpId || !deliveryForm.delivered_quantity || insertDelivery.isPending} onClick={() => insertDelivery.mutate({ ...deliveryForm, operation_id: selectedOpId })}>
                {insertDelivery.isPending ? 'Salvando...' : 'Registrar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sacas Entregues" value={totalDeliveredQty.toLocaleString('pt-BR')} icon={<Wheat className="w-4 h-4" />} subtitle={`${deliveryPct}% do total`} />
        <StatCard label="Valor Conciliado" value={formatCurrency(totalSettledAmount)} icon={<Landmark className="w-4 h-4" />} subtitle={`${settlementEntries.length} lançamentos`} />
        <StatCard label="Operações Pendentes" value={String(pendingOps)} icon={<Timer className="w-4 h-4" />} subtitle={`de ${settleOps.length} total`} />
        <StatCard label="Entregas Registradas" value={String(grainDeliveries.length)} icon={<CheckCircle2 className="w-4 h-4" />} subtitle="grain_deliveries" />
      </div>

      {/* Global delivery progress */}
      <div className="glass-card p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">Progresso Global</span>
          <span className="font-mono text-foreground">{totalDeliveredQty.toLocaleString('pt-BR')} / {totalExpectedSacas.toLocaleString('pt-BR')} sacas</span>
        </div>
        <Progress value={deliveryPct} className="h-3 bg-muted" />
      </div>

      {/* Operations with delivery detail */}
      <div className="space-y-4">
        {settleOps.map((op, i) => {
          const opDeliveries = grainDeliveries.filter((d: any) => d.operation_id === op.id);
          const opDelivered = opDeliveries.reduce((s: number, d: any) => s + Number(d.delivered_quantity || 0), 0);
          const opSacas = op.total_sacas || 0;
          const opPct = opSacas > 0 ? Math.round((opDelivered / opSacas) * 100) : 0;
          const opEntries = settlementEntries.filter((e: any) => e.operation_id === op.id);
          const opSettled = opEntries.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

          return (
            <motion.div key={op.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-semibold text-foreground">{op.client_name || 'Sem nome'}</span>
                  <span className="text-xs text-muted-foreground ml-2">{new Date(op.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                <Badge variant={op.status === 'liquidado' ? 'default' : 'outline'}>{op.status}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div><span className="stat-label">Sacas Esperadas</span><div className="font-mono">{opSacas.toLocaleString('pt-BR')}</div></div>
                <div><span className="stat-label">Sacas Entregues</span><div className="font-mono">{opDelivered.toLocaleString('pt-BR')}</div></div>
                <div><span className="stat-label">Valor Conciliado</span><div className="font-mono">{formatCurrency(opSettled)}</div></div>
                <div><span className="stat-label">Entregas</span><div className="font-mono">{opDeliveries.length}</div></div>
              </div>
              <Progress value={opPct} className="h-2 bg-muted" />
              <div className="text-xs font-mono text-muted-foreground mt-1">{opPct}% entregue</div>

              {opDeliveries.length > 0 && (
                <div className="mt-3 border-t border-border/50 pt-3 space-y-1">
                  {opDeliveries.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(d.delivered_at).toLocaleDateString('pt-BR')} · {Number(d.delivered_quantity).toLocaleString('pt-BR')} sacas @ R${Number(d.unit_price).toFixed(2)}</span>
                      <span className="font-mono">{d.delivery_location || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
