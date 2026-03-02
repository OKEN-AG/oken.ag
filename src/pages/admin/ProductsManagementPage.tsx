import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Search, Package } from 'lucide-react';
import { toast } from 'sonner';

const emptyProduct = {
  name: '', category: 'herbicida', code: '', ref: '', active_ingredient: '',
  unit_type: 'l', currency: 'USD', price_per_unit: 0, price_cash: 0, price_term: 0,
  price_type: 'vista', includes_margin: false,
  dose_per_hectare: 1, min_dose: 0.1, max_dose: 10,
  units_per_box: 4, boxes_per_pallet: 40, pallets_per_truck: 20,
  package_sizes: [] as number[],
};

type ProductForm = typeof emptyProduct;

export default function ProductsManagementPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>({ ...emptyProduct });
  const [packageInput, setPackageInput] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products-management'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (f: ProductForm & { id?: string }) => {
      if (f.id) {
        const { error } = await supabase.from('products').update(f).eq('id', f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert(f);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-management'] });
      toast.success(editingId ? 'Produto atualizado' : 'Produto criado');
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...emptyProduct });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      name: p.name, category: p.category, code: p.code || '', ref: p.ref || '',
      active_ingredient: p.active_ingredient || '', unit_type: p.unit_type,
      currency: p.currency, price_per_unit: p.price_per_unit,
      price_cash: p.price_cash || 0, price_term: p.price_term || 0,
      price_type: p.price_type, includes_margin: p.includes_margin,
      dose_per_hectare: p.dose_per_hectare, min_dose: p.min_dose, max_dose: p.max_dose,
      units_per_box: p.units_per_box, boxes_per_pallet: p.boxes_per_pallet,
      pallets_per_truck: p.pallets_per_truck, package_sizes: p.package_sizes || [],
    });
    setDialogOpen(true);
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.code || '').toLowerCase().includes(search.toLowerCase())
  );

  const addPackageSize = () => {
    const val = Number(packageInput);
    if (val > 0 && !form.package_sizes.includes(val)) {
      setForm(f => ({ ...f, package_sizes: [...f.package_sizes, val].sort((a, b) => a - b) }));
      setPackageInput('');
    }
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Produtos</h1>
          <p className="text-sm text-muted-foreground">{products.length} produtos cadastrados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditingId(null); setForm({ ...emptyProduct }); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Novo Produto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? 'Editar Produto' : 'Novo Produto'}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Código</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
              <div><Label>Referência</Label><Input value={form.ref} onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} /></div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['herbicida', 'fungicida', 'inseticida', 'adjuvante', 'semente', 'fertilizante', 'biologico', 'outro'].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Ingrediente Ativo</Label><Input value={form.active_ingredient} onChange={e => setForm(f => ({ ...f, active_ingredient: e.target.value }))} /></div>
              <div>
                <Label>Unidade</Label>
                <Select value={form.unit_type} onValueChange={v => setForm(f => ({ ...f, unit_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="l">Litros (L)</SelectItem>
                    <SelectItem value="kg">Quilos (kg)</SelectItem>
                    <SelectItem value="un">Unidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Moeda</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="BRL">BRL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Preço por Unidade</Label><Input type="number" value={form.price_per_unit} onChange={e => setForm(f => ({ ...f, price_per_unit: Number(e.target.value) }))} /></div>
              <div><Label>Preço à Vista</Label><Input type="number" value={form.price_cash} onChange={e => setForm(f => ({ ...f, price_cash: Number(e.target.value) }))} /></div>
              <div><Label>Preço a Prazo</Label><Input type="number" value={form.price_term} onChange={e => setForm(f => ({ ...f, price_term: Number(e.target.value) }))} /></div>
              <div>
                <Label>Tipo Preço</Label>
                <Select value={form.price_type} onValueChange={v => setForm(f => ({ ...f, price_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vista">À Vista</SelectItem>
                    <SelectItem value="prazo">A Prazo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.includes_margin} onCheckedChange={v => setForm(f => ({ ...f, includes_margin: v }))} />
                <Label>Inclui Margem</Label>
              </div>
              <div><Label>Dose/ha Padrão</Label><Input type="number" step="0.01" value={form.dose_per_hectare} onChange={e => setForm(f => ({ ...f, dose_per_hectare: Number(e.target.value) }))} /></div>
              <div><Label>Dose Mínima</Label><Input type="number" step="0.01" value={form.min_dose} onChange={e => setForm(f => ({ ...f, min_dose: Number(e.target.value) }))} /></div>
              <div><Label>Dose Máxima</Label><Input type="number" step="0.01" value={form.max_dose} onChange={e => setForm(f => ({ ...f, max_dose: Number(e.target.value) }))} /></div>
              <div><Label>Unidades/Caixa</Label><Input type="number" value={form.units_per_box} onChange={e => setForm(f => ({ ...f, units_per_box: Number(e.target.value) }))} /></div>
              <div><Label>Caixas/Pallet</Label><Input type="number" value={form.boxes_per_pallet} onChange={e => setForm(f => ({ ...f, boxes_per_pallet: Number(e.target.value) }))} /></div>
              <div><Label>Pallets/Caminhão</Label><Input type="number" value={form.pallets_per_truck} onChange={e => setForm(f => ({ ...f, pallets_per_truck: Number(e.target.value) }))} /></div>
              <div className="col-span-2">
                <Label>Embalagens Disponíveis ({form.unit_type})</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="number" step="0.5" value={packageInput} onChange={e => setPackageInput(e.target.value)} placeholder="Ex: 1, 4, 5, 10" className="w-32" />
                  <Button variant="outline" size="sm" onClick={addPackageSize}>Adicionar</Button>
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {form.package_sizes.map(s => (
                    <Badge key={s} variant="secondary" className="cursor-pointer" onClick={() => setForm(f => ({ ...f, package_sizes: f.package_sizes.filter(x => x !== s) }))}>
                      {s}{form.unit_type} ✕
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!form.name || upsert.isPending} onClick={() => upsert.mutate(editingId ? { ...form, id: editingId } as any : form)}>
                {upsert.isPending ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, código ou categoria..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Dose/ha</TableHead>
              <TableHead>Embalagem</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{p.code || '—'}</TableCell>
                <TableCell className="font-mono">{p.currency} {p.price_per_unit.toFixed(2)}</TableCell>
                <TableCell className="font-mono">{p.dose_per_hectare} {p.unit_type}/ha</TableCell>
                <TableCell className="text-xs">{p.units_per_box}×cx · {p.boxes_per_pallet}×plt</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum produto encontrado.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
