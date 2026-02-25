import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Unlink, Upload, ClipboardPaste } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useProducts, useCreateProduct, useDeleteProduct, useUpdateProduct, useCampaignProducts, useLinkProductToCampaign, useUnlinkProductFromCampaign } from '@/hooks/useProducts';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { parseLocaleNumber, splitFlexibleLine, normalizeText, normalizeRef } from '@/lib/import-utils';

type Props = { campaignId?: string };

type EditingCell = { rowId: string; field: string } | null;

export default function ProductsTab({ campaignId }: Props) {
  const { data: allProducts } = useProducts();
  const { data: linkedProducts, isLoading } = useCampaignProducts(campaignId);
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();
  const linkMut = useLinkProductToCampaign();
  const unlinkMut = useUnlinkProductFromCampaign();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const products = (linkedProducts || []).map((lp: any) => lp.product).filter(Boolean);

  const startEdit = (rowId: string, field: string, currentValue: any) => {
    setEditing({ rowId, field });
    setEditValue(String(currentValue ?? ''));
  };

  const commitEdit = async () => {
    if (!editing) return;
    const { rowId, field } = editing;
    const product = products.find((p: any) => p.id === rowId);
    if (!product) { setEditing(null); return; }

    let val: any = editValue;
    if (['price_cash', 'price_term', 'price_per_unit', 'units_per_box', 'dose_per_hectare', 'min_dose', 'max_dose', 'boxes_per_pallet'].includes(field)) {
      val = Number(editValue.replace(',', '.')) || 0;
    }
    if (val === product[field]) { setEditing(null); return; }

    try {
      await updateMut.mutateAsync({ id: rowId, [field]: val });
    } catch (e: any) { toast.error(e.message); }
    setEditing(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') setEditing(null);
  };

  const addEmptyRow = async () => {
    if (!campaignId) return;
    try {
      const created = await createMut.mutateAsync({
        name: 'Novo Produto', category: 'Herbicida', code: '', ref: '',
        price_cash: 0, price_term: 0, price_per_unit: 0, units_per_box: 12,
        unit_type: 'l', dose_per_hectare: 1, min_dose: 0.1, max_dose: 10,
        boxes_per_pallet: 40, pallets_per_truck: 20, currency: 'USD',
        price_type: 'vista', includes_margin: false,
      });
      await linkMut.mutateAsync({ campaignId, productId: created.id });
      toast.success('Linha adicionada');
    } catch (e: any) { toast.error(e.message); }
  };

  const parseRows = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const rows: any[] = [];

    for (const line of lines) {
      const parts = splitFlexibleLine(line);
      if (parts.length < 5) continue;

      const p0 = normalizeText(parts[0] || '');
      const p1 = normalizeText(parts[1] || '');
      if (p0 === '#' || p0 === 'codigo' || p1 === 'produtos' || p1 === 'produto') continue;

      const unitsPerBox = parts[5] ? parseLocaleNumber(parts[5]) : 12;
      const kgOrLiters = parts[6] ? parseLocaleNumber(parts[6]) : 1;

      rows.push({
        code: String(parts[0] || '').replace(/^\uFEFF/, '').trim(),
        name: String(parts[1] || '').trim(),
        ref: String(parts[2] || '').trim().toUpperCase(),
        price_cash: parseLocaleNumber(parts[3]),
        price_term: parseLocaleNumber(parts[4]),
        units_per_box: unitsPerBox > 0 ? unitsPerBox : 12,
        unit_type: 'l',
        dose_per_hectare: kgOrLiters > 0 ? kgOrLiters : 1,
        category: 'Herbicida',
        price_per_unit: parseLocaleNumber(parts[3]),
        min_dose: 0.1,
        max_dose: 10,
        boxes_per_pallet: 40,
        pallets_per_truck: 20,
        currency: 'USD',
        price_type: 'vista',
        includes_margin: false,
      });
    }
    return rows;
  };

  const importRows = async (rows: any[]) => {
    if (!campaignId || rows.length === 0) {
      toast.error('Nenhum dado válido encontrado');
      return;
    }

    const productsByCode = new Map<string, any>();
    const productsByRef = new Map<string, any>();
    for (const p of allProducts || []) {
      const code = normalizeText(p.code || '');
      const ref = normalizeRef(p.ref || '');
      if (code) productsByCode.set(code, p);
      if (ref) productsByRef.set(ref, p);
    }

    const linkedIds = new Set(products.map((p: any) => p.id));

    let createdCount = 0;
    let updatedCount = 0;
    let linkedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      try {
        const codeKey = normalizeText(row.code || '');
        const refKey = normalizeRef(row.ref || '');
        const existing = (codeKey && productsByCode.get(codeKey)) || (refKey && productsByRef.get(refKey));

        let productId: string | null = null;

        if (existing?.id) {
          productId = existing.id;
          await updateMut.mutateAsync({ id: existing.id, ...row });
          updatedCount++;
        } else {
          const created = await createMut.mutateAsync(row);
          productId = created.id;
          createdCount++;
        }

        if (productId && !linkedIds.has(productId)) {
          try {
            await linkMut.mutateAsync({ campaignId, productId });
            linkedIds.add(productId);
            linkedCount++;
          } catch {
            // already linked or constraint issue; keep import flow
          }
        }
      } catch (e) {
        console.error(e);
        skippedCount++;
      }
    }

    toast.success(
      `Importação concluída: ${createdCount} criados, ${updatedCount} atualizados, ${linkedCount} vinculados${skippedCount > 0 ? `, ${skippedCount} ignorados` : ''}.`,
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      const text = await file.text();
      await importRows(parseRows(text));
    } else {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: '\t' });
      await importRows(parseRows(csv));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePasteImport = async () => {
    await importRows(parseRows(pasteText));
    setPasteText('');
    setPasteOpen(false);
  };

  const renderCell = (product: any, field: string, display?: string) => {
    const isEditing = editing?.rowId === product.id && editing?.field === field;
    if (isEditing) {
      return (
        <Input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-7 text-xs px-1 bg-background border-primary"
        />
      );
    }
    return (
      <div
        className="cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5 min-h-[28px] flex items-center text-xs"
        onClick={() => startEdit(product.id, field, product[field])}
      >
        {display ?? (product[field] ?? '')}
      </div>
    );
  };

  if (!campaignId) return <p className="text-center py-8 text-muted-foreground">Salve a campanha primeiro para gerenciar produtos.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-base font-semibold text-foreground">Portfólio de Produtos</Label>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="w-4 h-4 mr-1" /> Colar Texto
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" /> Importar CSV/XLS
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden" onChange={handleFileUpload} />
          <Button size="sm" onClick={addEmptyRow} disabled={createMut.isPending}>
            <Plus className="w-4 h-4 mr-1" /> Linha
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Clique em qualquer célula para editar. Enter/Tab para confirmar, Esc para cancelar.</p>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
        <div className="border border-border rounded-md overflow-auto max-h-[70vh]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10 text-foreground">#</TableHead>
                <TableHead className="w-24 text-foreground">Código</TableHead>
                <TableHead className="min-w-[200px] text-foreground">Produto</TableHead>
                <TableHead className="w-16 text-foreground">REF</TableHead>
                <TableHead className="w-28 text-foreground">Preço Cash</TableHead>
                <TableHead className="w-28 text-foreground">Preço Prazo</TableHead>
                <TableHead className="w-16 text-foreground">Caixa</TableHead>
                <TableHead className="w-16 text-foreground">KG/L</TableHead>
                <TableHead className="w-20 text-foreground">Dose/ha</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p: any, idx: number) => (
                <TableRow key={p.id} className="hover:bg-accent/30">
                  <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                  <TableCell>{renderCell(p, 'code')}</TableCell>
                  <TableCell>{renderCell(p, 'name')}</TableCell>
                  <TableCell>{renderCell(p, 'ref')}</TableCell>
                  <TableCell>{renderCell(p, 'price_cash', p.price_cash ? Number(p.price_cash).toFixed(2) : '0.00')}</TableCell>
                  <TableCell>{renderCell(p, 'price_term', p.price_term ? Number(p.price_term).toFixed(2) : '0.00')}</TableCell>
                  <TableCell>{renderCell(p, 'units_per_box')}</TableCell>
                  <TableCell>{renderCell(p, 'dose_per_hectare')}</TableCell>
                  <TableCell>{renderCell(p, 'min_dose', `${p.min_dose}-${p.max_dose}`)}</TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => unlinkMut.mutate({ campaignId: campaignId!, productId: p.id })}>
                        <Unlink className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteMut.mutate(p.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Nenhum produto vinculado. Adicione uma linha ou importe dados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Paste dialog */}
      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Colar Dados de Produtos</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Cole dados separados por TAB ou ponto-e-vírgula no formato:<br />
            <span className="font-mono">CÓDIGO ; PRODUTO ; REF ; PREÇO CASH ; PREÇO PRAZO ; CAIXA ; KG/L</span>
          </p>
          <Textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={12}
            placeholder="Cole aqui os dados da planilha..."
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>Cancelar</Button>
            <Button onClick={handlePasteImport}>Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
