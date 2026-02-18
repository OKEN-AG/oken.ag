import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useCombos, useCreateCombo, useDeleteCombo, useAddComboProduct, useRemoveComboProduct } from '@/hooks/useCombos';
import { useCampaignProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type Props = { campaignId?: string };

export default function CombosTab({ campaignId }: Props) {
  const { data: combos, isLoading } = useCombos(campaignId);
  const { data: campaignProducts } = useCampaignProducts(campaignId);
  const createCombo = useCreateCombo();
  const deleteCombo = useDeleteCombo();
  const addProduct = useAddComboProduct();
  const removeProduct = useRemoveComboProduct();
  const qc = useQueryClient();

  const [newName, setNewName] = useState('');
  const [newDiscount, setNewDiscount] = useState(5);
  const [expandedCombo, setExpandedCombo] = useState<string | null>(null);
  const [addingProductTo, setAddingProductTo] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [minDose, setMinDose] = useState(0);
  const [maxDose, setMaxDose] = useState(100);

  const products = (campaignProducts || []).map((cp: any) => cp.product).filter(Boolean);

  const handleCreate = async () => {
    if (!newName.trim() || !campaignId) return;
    try {
      await createCombo.mutateAsync({ name: newName.trim(), campaign_id: campaignId, discount_percent: newDiscount });
      setNewName('');
      setNewDiscount(5);
      toast.success('Combo criado');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddProduct = async (comboId: string) => {
    if (!selectedProduct) return;
    try {
      await addProduct.mutateAsync({ combo_id: comboId, product_id: selectedProduct, min_dose_per_ha: minDose, max_dose_per_ha: maxDose });
      setSelectedProduct('');
      setMinDose(0);
      setMaxDose(100);
      setAddingProductTo(null);
      toast.success('Produto adicionado ao combo');
    } catch (e: any) { toast.error(e.message); }
  };

  if (!campaignId) return <p className="text-center py-8 text-muted-foreground">Salve a campanha primeiro para gerenciar combos.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Combos de Desconto</Label>
      </div>

      {/* Create combo */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Nome do Combo</Label>
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Pacote Herbicida + Fungicida" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
        </div>
        <div className="w-32 space-y-1">
          <Label className="text-xs">Desconto %</Label>
          <Input type="number" step="0.5" value={newDiscount} onChange={e => setNewDiscount(Number(e.target.value))} />
        </div>
        <Button onClick={handleCreate} disabled={createCombo.isPending}><Plus className="w-4 h-4 mr-1" /> Criar</Button>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
        <div className="space-y-2">
          {(combos || []).map((combo, idx) => (
            <ComboCard
              key={combo.id}
              combo={combo}
              index={idx}
              products={products}
              campaignId={campaignId!}
              expanded={expandedCombo === combo.id}
              onToggle={() => setExpandedCombo(expandedCombo === combo.id ? null : combo.id)}
              onDelete={() => deleteCombo.mutate({ id: combo.id, campaignId: campaignId! })}
              addingProduct={addingProductTo === combo.id}
              onToggleAdding={() => setAddingProductTo(addingProductTo === combo.id ? null : combo.id)}
              selectedProduct={selectedProduct}
              onSelectProduct={setSelectedProduct}
              minDose={minDose}
              maxDose={maxDose}
              onMinDose={setMinDose}
              onMaxDose={setMaxDose}
              onAddProduct={() => handleAddProduct(combo.id)}
              onRemoveProduct={(id: string) => removeProduct.mutate({ id, comboId: combo.id })}
            />
          ))}
          {(combos || []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-md">
              Nenhum combo criado. Crie combos para definir pacotes de desconto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ComboCard({ combo, index, products, campaignId, expanded, onToggle, onDelete, addingProduct, onToggleAdding, selectedProduct, onSelectProduct, minDose, maxDose, onMinDose, onMaxDose, onAddProduct, onRemoveProduct }: any) {
  const { data: comboProducts } = useQuery({
    queryKey: ['combo-products', combo.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('combo_products').select('*, product:products(*)').eq('combo_id', combo.id);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 p-3 bg-muted/30 cursor-pointer" onClick={onToggle}>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Badge variant="outline" className="mr-1">#{index + 1}</Badge>
        <span className="font-medium flex-1">{combo.name}</span>
        <Badge>{combo.discount_percent}% desc.</Badge>
        <Badge variant="secondary">{(comboProducts || []).length} produtos</Badge>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); onDelete(); }}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {(comboProducts || []).length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Dose Mín</TableHead>
                  <TableHead>Dose Máx</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(comboProducts || []).map((cp: any) => (
                  <TableRow key={cp.id}>
                    <TableCell>{cp.product?.name || cp.product_id}</TableCell>
                    <TableCell>{cp.min_dose_per_ha}</TableCell>
                    <TableCell>{cp.max_dose_per_ha}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemoveProduct(cp.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {addingProduct ? (
            <div className="flex gap-2 items-end p-2 bg-muted/20 rounded">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Produto</Label>
                <Select value={selectedProduct} onValueChange={onSelectProduct}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">Dose Mín</Label>
                <Input type="number" step="0.1" value={minDose} onChange={e => onMinDose(Number(e.target.value))} />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">Dose Máx</Label>
                <Input type="number" step="0.1" value={maxDose} onChange={e => onMaxDose(Number(e.target.value))} />
              </div>
              <Button size="sm" onClick={onAddProduct}>Adicionar</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={onToggleAdding}><Plus className="w-3 h-3 mr-1" /> Adicionar Produto</Button>
          )}
        </div>
      )}
    </div>
  );
}
