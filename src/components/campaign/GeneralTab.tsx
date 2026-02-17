import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, Upload, ClipboardPaste } from 'lucide-react';

export type ClientRow = { document: string; name: string };

const TARGETS = [
  { value: 'produtor', label: 'Produtor' },
  { value: 'distribuidor', label: 'Distribuidor' },
  { value: 'venda_direta', label: 'Venda Direta' },
];

const COMMODITIES = [
  { value: 'soja', label: 'Soja' },
  { value: 'milho', label: 'Milho' },
  { value: 'cafe', label: 'Café' },
  { value: 'algodao', label: 'Algodão' },
];

type Props = {
  form: {
    name: string;
    season: string;
    currency: string;
    target: string;
    active: boolean;
    commodities: string[];
  };
  onFieldChange: (key: string, value: any) => void;
  clients: ClientRow[];
  onClientsChange: (clients: ClientRow[]) => void;
};

export default function GeneralTab({ form, onFieldChange, clients, onClientsChange }: Props) {
  const [newDoc, setNewDoc] = useState('');
  const [newName, setNewName] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const addClient = () => {
    if (!newDoc.trim() && !newName.trim()) return;
    onClientsChange([...clients, { document: newDoc.trim(), name: newName.trim() }]);
    setNewDoc('');
    setNewName('');
  };

  const removeClient = (idx: number) => {
    onClientsChange(clients.filter((_, i) => i !== idx));
  };

  const handlePaste = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split('\n');
    const newClients = lines
      .map(line => {
        const parts = line.split(/[;\t,]/).map(p => p.trim());
        return { document: parts[0] || '', name: parts[1] || '' };
      })
      .filter(c => c.document || c.name);
    onClientsChange([...clients, ...newClients]);
    setPasteText('');
    setPasteMode(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const lines = text.trim().split('\n').slice(1);
        const newClients = lines
          .map(line => {
            const parts = line.split(/[;\t,]/).map(p => p.trim());
            return { document: parts[0] || '', name: parts[1] || '' };
          })
          .filter(c => c.document || c.name);
        onClientsChange([...clients, ...newClients]);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
        const newClients = rows.slice(1)
          .map(row => ({
            document: String(row[0] || '').trim(),
            name: String(row[1] || '').trim(),
          }))
          .filter(c => c.document || c.name);
        onClientsChange([...clients, ...newClients]);
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = '';
  };

  const toggleCommodity = (value: string) => {
    const current = form.commodities || [];
    onFieldChange(
      'commodities',
      current.includes(value) ? current.filter(c => c !== value) : [...current, value]
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome da Campanha</Label>
          <Input value={form.name} onChange={e => onFieldChange('name', e.target.value)} placeholder="Ex: Safra 2025/26 Barter Soja" />
        </div>
        <div className="space-y-2">
          <Label>Safra</Label>
          <Input value={form.season} onChange={e => onFieldChange('season', e.target.value)} placeholder="Ex: 2025/26" />
        </div>
        <div className="space-y-2">
          <Label>Moeda da Campanha</Label>
          <Select value={form.currency} onValueChange={v => onFieldChange('currency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">BRL</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Público Alvo</Label>
          <Select value={form.target} onValueChange={v => onFieldChange('target', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TARGETS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Commodities</Label>
          <div className="flex gap-4 flex-wrap">
            {COMMODITIES.map(c => (
              <label key={c.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={(form.commodities || []).includes(c.value)}
                  onCheckedChange={() => toggleCommodity(c.value)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.active} onCheckedChange={v => onFieldChange('active', v)} />
          <Label>Campanha Ativa</Label>
        </div>
      </div>

      {/* Client Whitelist */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Whitelist de Clientes</Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPasteMode(!pasteMode)}>
              <ClipboardPaste className="w-3 h-3 mr-1" /> Colar
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3 h-3 mr-1" /> Importar
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden" onChange={handleFileUpload} />
          </div>
        </div>

        {pasteMode && (
          <div className="space-y-2 p-3 border border-border rounded-md bg-muted/30">
            <Label className="text-xs text-muted-foreground">Cole dados no formato: CPF/CNPJ;Nome (um por linha)</Label>
            <Textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4} placeholder={"12345678900;João Silva\n98765432100;Maria Santos"} />
            <Button size="sm" onClick={handlePaste}>Importar Texto</Button>
          </div>
        )}

        <div className="flex gap-2">
          <Input placeholder="CPF/CNPJ" value={newDoc} onChange={e => setNewDoc(e.target.value)} className="max-w-[200px]" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addClient())} />
          <Input placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addClient())} />
          <Button variant="outline" size="icon" onClick={addClient}><Plus className="w-4 h-4" /></Button>
        </div>

        {clients.length > 0 ? (
          <div className="border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-48">CPF/CNPJ</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-sm">{c.document}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeClient(i)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">
            Nenhum cliente na whitelist. Adicione individualmente, cole texto ou importe CSV/XLS.
          </p>
        )}
      </div>
    </div>
  );
}
