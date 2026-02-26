import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, ClipboardPaste } from 'lucide-react';
import { useCombos, useCreateCombo, useDeleteCombo, useAddComboProduct, useRemoveComboProduct } from '@/hooks/useCombos';
import { useCampaignProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { handleDatabaseError } from '@/lib/error-handler';
import * as XLSX from 'xlsx';
import { normalizeRef, normalizeText, parseLocaleNumber, splitFlexibleLine } from '@/lib/import-utils';

type Props = { campaignId?: string };

export default function CombosTab({ campaignId }: Props) {
  const { data: combos, isLoading } = useCombos(campaignId);
  const { data: campaignProducts } = useCampaignProducts(campaignId);
  const createCombo = useCreateCombo();
  const deleteCombo = useDeleteCombo();
  const addProduct = useAddComboProduct();
  const removeProduct = useRemoveComboProduct();
  const fileRef = useRef<HTMLInputElement>(null);

  const [newName, setNewName] = useState('');
  const [newDiscount, setNewDiscount] = useState(5);
  const [expandedCombo, setExpandedCombo] = useState<string | null>(null);
  const [addingProductTo, setAddingProductTo] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [minDose, setMinDose] = useState(0);
  const [maxDose, setMaxDose] = useState(100);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const products = (campaignProducts || []).map((cp: any) => cp.product).filter(Boolean);

  const handleCreate = async () => {
    if (!newName.trim() || !campaignId) return;
    try {
      await createCombo.mutateAsync({ name: newName.trim(), campaign_id: campaignId, discount_percent: newDiscount });
      setNewName('');
      setNewDiscount(5);
      toast.success('Combo criado');
    } catch (e: any) { toast.error(handleDatabaseError(e)); }
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
    } catch (e: any) { toast.error(handleDatabaseError(e)); }
  };

  // Parse discount matrix text
  const parseMatrix = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const groups: { name: string; discount: number; items: { ref: string; minDose: number; maxDose: number }[] }[] = [];
    let current: typeof groups[0] | null = null;

    const pushCurrent = () => {
      if (current && current.items.length > 0) groups.push(current);
    };

    for (const line of lines) {
      const parts = splitFlexibleLine(line);
      if (parts.length < 2) continue;

      const first = normalizeText(parts[0] || '');
      const isHeader = first === 'grupo' || first === '#';
      if (isHeader) continue;

      // Pattern A: group + item in same row: OFERTA 1 | 1 | REF | 5% | 0,4 | 0,4
      const firstRaw = String(parts[0] || '').trim();
      const groupInline = /^(OFERTA\s*\d+|COMPLEMENTARES?|COMPLEMENTAR\w*)$/i.test(firstRaw);
      if (groupInline) {
        const groupName = firstRaw.toUpperCase();
        if (!current || normalizeText(current.name) !== normalizeText(groupName)) {
          pushCurrent();
          current = { name: groupName, discount: 0, items: [] };
        }

        if (parts.length >= 6) {
          const ref = String(parts[2] || '').trim();
          const discount = parseLocaleNumber(parts[3]);
          const dMin = parseLocaleNumber(parts[4]);
          const dMax = parseLocaleNumber(parts[5]);
          if (ref) {
            if (discount > 0 && current.discount === 0) current.discount = discount;
            current.items.push({ ref: ref.toUpperCase(), minDose: dMin, maxDose: dMax });
          }
        }
        continue;
      }

      // Pattern B: pure group title line (single cell)
      if (/^(OFERTA\s*\d+|COMPLEMENTARES?|COMPLEMENTAR\w*)$/i.test(line)) {
        pushCurrent();
        current = { name: line.toUpperCase(), discount: 0, items: [] };
        continue;
      }

      // Pattern C: item line: # | REF | DESC | MIN | MAX
      const cols = parts;
      let ref = '';
      let discount = 0;
      let dMin = 0;
      let dMax = 0;

      if (cols.length >= 5 && /^\d+$/.test(cols[0])) {
        ref = cols[1];
        discount = parseLocaleNumber(cols[2]);
        dMin = parseLocaleNumber(cols[3]);
        dMax = parseLocaleNumber(cols[4]);
      } else if (cols.length >= 4) {
        ref = cols[0];
        discount = parseLocaleNumber(cols[1]);
        dMin = parseLocaleNumber(cols[2]);
        dMax = parseLocaleNumber(cols[3]);
      }

      if (!ref || normalizeText(ref) === 'ref') continue;
      if (!current) continue;

      if (discount > 0 && current.discount === 0) current.discount = discount;
      current.items.push({ ref: String(ref).toUpperCase().trim(), minDose: dMin, maxDose: dMax });
    }

    pushCurrent();
    return groups;
  };

  const importMatrix = async (text: string) => {
    if (!campaignId) return;
    const groups = parseMatrix(text);
    if (groups.length === 0) { toast.error('Nenhum grupo válido encontrado'); return; }

    let comboCount = 0;
    let prodCount = 0;
    const notFoundRefs = new Set<string>();

    for (const group of groups) {
      try {
        const combo = await createCombo.mutateAsync({
          name: group.name,
          campaign_id: campaignId,
          discount_percent: group.discount,
        });

        for (const item of group.items) {
          // Find product by ref field
          const itemRef = normalizeRef(item.ref);
          const product = products.find((p: any) => {
            const productRef = normalizeRef(p.ref || '');
            const productName = normalizeText(p.name || '');
            return (productRef && productRef === itemRef) || (itemRef && productName.includes(itemRef));
          });
          if (product) {
            try {
              await addProduct.mutateAsync({
                combo_id: combo.id,
                product_id: product.id,
                min_dose_per_ha: item.minDose,
                max_dose_per_ha: item.maxDose,
              });
              prodCount++;
            } catch (e) { console.error(e); }
          } else {
            notFoundRefs.add(item.ref);
          }
        }
        comboCount++;
      } catch (e: any) { console.error(e); }
    }

    const notFoundMsg = notFoundRefs.size > 0 ? ` | REF não encontradas: ${Array.from(notFoundRefs).join(', ')}` : '';
    toast.success(`${comboCount} combos criados com ${prodCount} produtos vinculados${notFoundMsg}`);
    setImportOpen(false);
    setImportText('');
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      const text = await file.text();
      await importMatrix(text);
    } else {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: '\t' });
      await importMatrix(csv);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!campaignId) return <p className="text-center py-8 text-muted-foreground">Salve a campanha primeiro para gerenciar combos.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-base font-semibold text-foreground">Combos de Desconto</Label>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <ClipboardPaste className="w-4 h-4 mr-1" /> Importar Matriz
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" /> CSV/XLS
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden" onChange={handleFileImport} />
        </div>
      </div>

      {/* Create combo */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-foreground">Nome do Combo</Label>
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: OFERTA 1" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
        </div>
        <div className="w-32 space-y-1">
          <Label className="text-xs text-foreground">Desconto %</Label>
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
              Nenhum combo criado. Crie combos ou importe uma matriz de desconto.
            </p>
          )}
        </div>
      )}

      {/* Import matrix dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Importar Matriz de Desconto</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Cole a matriz no formato abaixo. Linhas com "OFERTA X" ou "COMPLEMENTARES" criam novos combos.
            Cada item usa o campo REF para buscar o produto.<br />
            <span className="font-mono">OFERTA 1</span><br />
            <span className="font-mono"># &nbsp; REF &nbsp; DESCONTO% &nbsp; DOSE_MIN &nbsp; DOSE_MAX</span>
          </p>
          <Textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            rows={14}
            placeholder={"OFERTA 1\n1\tFox\t5%\t0.40\t0.40\n2\tAURE\t5%\t0.25\t3.00\n...\nCOMPLEMENTARES\n1\tATEN\t4%\t0.30\t1.20"}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={() => importMatrix(importText)}>Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <span className="font-medium flex-1 text-foreground">{combo.name}</span>
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
                  <TableHead className="text-foreground">Produto</TableHead>
                  <TableHead className="text-foreground">REF</TableHead>
                  <TableHead className="text-foreground">Dose Mín</TableHead>
                  <TableHead className="text-foreground">Dose Máx</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(comboProducts || []).map((cp: any) => (
                  <TableRow key={cp.id}>
                    <TableCell className="text-foreground">{cp.product?.name || cp.product_id}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{cp.product?.ref || '-'}</TableCell>
                    <TableCell className="text-foreground">{cp.min_dose_per_ha}</TableCell>
                    <TableCell className="text-foreground">{cp.max_dose_per_ha}</TableCell>
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
                <Label className="text-xs text-foreground">Produto</Label>
                <Select value={selectedProduct} onValueChange={onSelectProduct}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.ref || '-'})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs text-foreground">Dose Mín</Label>
                <Input type="number" step="0.01" value={minDose} onChange={e => onMinDose(Number(e.target.value))} />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs text-foreground">Dose Máx</Label>
                <Input type="number" step="0.01" value={maxDose} onChange={e => onMaxDose(Number(e.target.value))} />
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
