import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Search, Truck } from 'lucide-react';
import { toast } from 'sonner';

const emptyReducer = {
  origin: '', destination: '', distance_km: 0, cost_per_km: 0.10, adjustment: 0, campaign_id: null as string | null,
};

export default function FreightManagementPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyReducer });
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

  const { data: reducers = [], isLoading } = useQuery({
    queryKey: ['freight-reducers-mgmt'],
    queryFn: async () => {
      const { data, error } = await supabase.from('freight_reducers').select('*').order('origin');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns-for-freight'],
    queryFn: async () => {
      const { data, error } = await supabase.from('campaigns').select('id, name').eq('active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const totalReducer = form.distance_km * form.cost_per_km + form.adjustment;

  const upsert = useMutation({
    mutationFn: async (f: typeof emptyReducer & { id?: string }) => {
      const payload = { ...f, total_reducer: f.distance_km * f.cost_per_km + f.adjustment };
      if (f.id) {
        const { id, ...rest } = payload as any;
        const { error } = await supabase.from('freight_reducers').update(rest).eq('id', f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('freight_reducers').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freight-reducers-mgmt'] });
      toast.success(editingId ? 'Redutor atualizado' : 'Redutor criado');
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...emptyReducer });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      origin: r.origin, destination: r.destination,
      distance_km: r.distance_km, cost_per_km: r.cost_per_km,
      adjustment: r.adjustment || 0, campaign_id: r.campaign_id,
    });
    setDialogOpen(true);
  };

  const filtered = reducers.filter(r => {
    const matchSearch = r.origin.toLowerCase().includes(search.toLowerCase()) ||
      r.destination.toLowerCase().includes(search.toLowerCase());
    const matchCampaign = campaignFilter === 'all' || r.campaign_id === campaignFilter;
    return matchSearch && matchCampaign;
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Frete / Redutores Logísticos</h1>
          <p className="text-sm text-muted-foreground">{reducers.length} rotas cadastradas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditingId(null); setForm({ ...emptyReducer }); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Nova Rota</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? 'Editar Rota' : 'Nova Rota'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Campanha (opcional)</Label>
                <Select value={form.campaign_id || 'none'} onValueChange={v => setForm(f => ({ ...f, campaign_id: v === 'none' ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Global (todas campanhas)</SelectItem>
                    {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Origem (Cidade)</Label><Input value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))} /></div>
                <div><Label>Destino (Porto)</Label><Input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} /></div>
                <div><Label>Distância (km)</Label><Input type="number" value={form.distance_km} onChange={e => setForm(f => ({ ...f, distance_km: Number(e.target.value) }))} /></div>
                <div><Label>Custo/km (R$)</Label><Input type="number" step="0.01" value={form.cost_per_km} onChange={e => setForm(f => ({ ...f, cost_per_km: Number(e.target.value) }))} /></div>
                <div><Label>Ajuste Localizado (R$)</Label><Input type="number" step="0.01" value={form.adjustment} onChange={e => setForm(f => ({ ...f, adjustment: Number(e.target.value) }))} /></div>
              </div>
              <div className="glass-card p-3 text-sm">
                <span className="text-muted-foreground">Redutor Total Calculado: </span>
                <span className="font-mono font-semibold text-foreground">R$ {totalReducer.toFixed(2)}/saca</span>
                <span className="text-xs text-muted-foreground ml-2">({form.distance_km}km × R${form.cost_per_km.toFixed(2)} + R${form.adjustment.toFixed(2)})</span>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!form.origin || !form.destination || upsert.isPending} onClick={() => upsert.mutate(editingId ? { ...form, id: editingId } as any : form)}>
                {upsert.isPending ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por origem ou destino..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Campanha" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Origem</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Distância</TableHead>
              <TableHead>Custo/km</TableHead>
              <TableHead>Ajuste</TableHead>
              <TableHead>Redutor Total</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.origin}</TableCell>
                <TableCell>{r.destination}</TableCell>
                <TableCell className="font-mono">{r.distance_km} km</TableCell>
                <TableCell className="font-mono">R$ {r.cost_per_km.toFixed(2)}</TableCell>
                <TableCell className="font-mono">R$ {(r.adjustment || 0).toFixed(2)}</TableCell>
                <TableCell className="font-mono font-semibold">R$ {r.total_reducer.toFixed(2)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma rota encontrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
