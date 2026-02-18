import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Link2, Unlink, Edit2, X, Check } from 'lucide-react';
import { useProducts, useCreateProduct, useDeleteProduct, useUpdateProduct, useCampaignProducts, useLinkProductToCampaign, useUnlinkProductFromCampaign } from '@/hooks/useProducts';
import { toast } from 'sonner';

const CATEGORIES = ['Herbicida', 'Fungicida', 'Inseticida', 'Adjuvante', 'Fertilizante', 'Biológico', 'Tratamento de Sementes'];

const emptyProduct = {
  name: '', category: 'Herbicida', active_ingredient: '', unit_type: 'l',
  package_sizes: [] as number[], units_per_box: 4, boxes_per_pallet: 40, pallets_per_truck: 20,
  dose_per_hectare: 1, min_dose: 0.1, max_dose: 10, price_per_unit: 0,
  currency: 'USD', price_type: 'vista', includes_margin: false,
};

type Props = { campaignId?: string };

export default function ProductsTab({ campaignId }: Props) {
  const { data: allProducts, isLoading } = useProducts();
  const { data: linkedProducts } = useCampaignProducts(campaignId);
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();
  const linkMut = useLinkProductToCampaign();
  const unlinkMut = useUnlinkProductFromCampaign();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [pkgInput, setPkgInput] = useState('');

  const linkedIds = new Set((linkedProducts || []).map((lp: any) => lp.product_id));

  const onField = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const addPkg = () => {
    const n = Number(pkgInput);
    if (n > 0 && !form.package_sizes.includes(n)) {
      onField('package_sizes', [...form.package_sizes, n].sort((a, b) => a - b));
      setPkgInput('');
    }
  };

  const resetForm = () => { setForm(emptyProduct); setEditId(null); setShowForm(false); setPkgInput(''); };

  const handleSave = async () => {
    if (!form.name || !form.category) { toast.error('Nome e categoria são obrigatórios'); return; }
    try {
      if (editId) {
        await updateMut.mutateAsync({ id: editId, ...form });
        toast.success('Produto atualizado');
      } else {
        const created = await createMut.mutateAsync(form);
        if (campaignId) await linkMut.mutateAsync({ campaignId, productId: created.id });
        toast.success('Produto criado e vinculado');
      }
      resetForm();
    } catch (e: any) { toast.error(e.message); }
  };

  const startEdit = (p: any) => {
    setForm({
      name: p.name, category: p.category, active_ingredient: p.active_ingredient || '',
      unit_type: p.unit_type, package_sizes: p.package_sizes || [], units_per_box: p.units_per_box,
      boxes_per_pallet: p.boxes_per_pallet, pallets_per_truck: p.pallets_per_truck,
      dose_per_hectare: p.dose_per_hectare, min_dose: p.min_dose, max_dose: p.max_dose,
      price_per_unit: p.price_per_unit, currency: p.currency, price_type: p.price_type,
      includes_margin: p.includes_margin,
    });
    setEditId(p.id);
    setShowForm(true);
  };

  if (!campaignId) return <p className="text-center py-8 text-muted-foreground">Salve a campanha primeiro para gerenciar produtos.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Produtos da Campanha</Label>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}><Plus className="w-4 h-4 mr-1" /> Novo Produto</Button>
      </div>

      {showForm && (
        <div className="border border-border rounded-md p-4 space-y-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <Label className="font-semibold">{editId ? 'Editar Produto' : 'Novo Produto'}</Label>
            <Button variant="ghost" size="icon" onClick={resetForm}><X className="w-4 h-4" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={form.name} onChange={e => onField('name', e.target.value)} placeholder="Ex: Glifosato 480 SL" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={form.category} onValueChange={v => onField('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ingrediente Ativo</Label>
              <Input value={form.active_ingredient} onChange={e => onField('active_ingredient', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={form.unit_type} onValueChange={v => onField('unit_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="l">Litro (L)</SelectItem>
                  <SelectItem value="kg">Quilo (kg)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Embalagens ({form.unit_type})</Label>
              <div className="flex gap-1">
                <Input value={pkgInput} onChange={e => setPkgInput(e.target.value)} type="number" placeholder="Ex: 5" className="w-20" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPkg())} />
                <Button variant="outline" size="sm" onClick={addPkg}>+</Button>
                <div className="flex gap-1 flex-wrap items-center">
                  {form.package_sizes.map(s => (
                    <Badge key={s} variant="secondary" className="cursor-pointer" onClick={() => onField('package_sizes', form.package_sizes.filter(x => x !== s))}>
                      {s}{form.unit_type} ×
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unid/Caixa</Label>
              <Input type="number" value={form.units_per_box} onChange={e => onField('units_per_box', Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Caixas/Palet</Label>
              <Input type="number" value={form.boxes_per_pallet} onChange={e => onField('boxes_per_pallet', Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dose Recomendada/{form.unit_type}/ha</Label>
              <Input type="number" step="0.1" value={form.dose_per_hectare} onChange={e => onField('dose_per_hectare', Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Dose Mín</Label>
                <Input type="number" step="0.1" value={form.min_dose} onChange={e => onField('min_dose', Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dose Máx</Label>
                <Input type="number" step="0.1" value={form.max_dose} onChange={e => onField('max_dose', Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Preço Unitário</Label>
              <Input type="number" step="0.01" value={form.price_per_unit} onChange={e => onField('price_per_unit', Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Moeda</Label>
              <Select value={form.currency} onValueChange={v => onField('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="BRL">BRL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <Switch checked={form.includes_margin} onCheckedChange={v => onField('includes_margin', v)} />
              <Label className="text-xs">Inclui Margem</Label>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              <Check className="w-4 h-4 mr-1" /> {editId ? 'Atualizar' : 'Criar & Vincular'}
            </Button>
          </div>
        </div>
      )}

      {/* Linked products */}
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
        <>
          {(linkedProducts || []).length > 0 && (
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Dose/ha</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(linkedProducts || []).map((lp: any) => {
                    const p = lp.product;
                    if (!p) return null;
                    return (
                      <TableRow key={lp.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                        <TableCell>{p.currency} {Number(p.price_per_unit).toFixed(2)}</TableCell>
                        <TableCell>{p.dose_per_hectare} {p.unit_type}/ha</TableCell>
                        <TableCell className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}><Edit2 className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => unlinkMut.mutate({ campaignId: campaignId!, productId: p.id })}>
                            <Unlink className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Unlinked products to add */}
          {(() => {
            const unlinked = (allProducts || []).filter(p => !linkedIds.has(p.id));
            if (unlinked.length === 0) return null;
            return (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Produtos disponíveis (não vinculados)</Label>
                <div className="border border-dashed border-border rounded-md p-2 max-h-[200px] overflow-y-auto space-y-1">
                  {unlinked.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-1 px-2 hover:bg-muted/30 rounded text-sm">
                      <span>{p.name} <span className="text-muted-foreground">({p.category})</span></span>
                      <Button variant="ghost" size="sm" onClick={() => linkMut.mutate({ campaignId: campaignId!, productId: p.id })}>
                        <Link2 className="w-3 h-3 mr-1" /> Vincular
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
