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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCommodityOptions } from '@/hooks/useCommoditiesMasterData';
import { normalizeCommodityCode } from '@/lib/commodity';
import { formatCpfCnpj } from '@/lib/ptbr';

export type ClientRow = { document: string; name: string };

const TARGETS = [
  { value: 'venda_direta_consumidor', label: 'Venda Direta ao Consumidor (B2C)' },
  { value: 'venda_canal_distribuicao', label: 'Venda ao Canal de Distribuição / WholeSale (B2B)' },
  { value: 'venda_indireta_consumidor', label: 'Venda Indireta ao Consumidor (B2B2C)' },
];


const CAMPAIGN_TYPES = [
  { value: 'vendas', label: 'Vendas' },
  { value: 'cobranca_preventiva', label: 'Cobrança - Preventiva' },
  { value: 'cobranca_renegociacao', label: 'Cobrança - Renegociação' },
];

type Props = {
  form: {
    name: string;
    season: string;
    currency: string;
    target: string;
    active: boolean;
    commodities: string[];
    code_custom: string;
    code_auto: string;
    company_name: string;
    division: string;
    description: string;
    start_date: string;
    end_date: string;
    billing_deadline: string;
    campaign_type: string;
  };
  onFieldChange: (key: string, value: any) => void;
  clients: ClientRow[];
  onClientsChange: (clients: ClientRow[]) => void;
  /** Called before activating — return extra validation errors */
  onValidateActivation?: () => string[];
  /** Called when activation fails validation */
  onActivationError?: (errors: string[]) => void;
};

function DatePickerField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const date = value ? new Date(value + 'T00:00:00') : undefined;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
            {date ? format(date, 'dd/MM/yyyy') : 'Selecionar data'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={d => onChange(d ? format(d, 'yyyy-MM-dd') : '')} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function GeneralTab({ form, onFieldChange, clients, onClientsChange, onValidateActivation, onActivationError }: Props) {
  const [newDoc, setNewDoc] = useState('');
  const [newName, setNewName] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { options: commodityOptions } = useCommodityOptions();

  const addClient = () => {
    if (!newDoc.trim() && !newName.trim()) return;
    onClientsChange([...clients, { document: formatCpfCnpj(newDoc.trim()), name: newName.trim() }]);
    setNewDoc('');
    setNewName('');
  };

  const removeClient = (idx: number) => onClientsChange(clients.filter((_, i) => i !== idx));

  const handlePaste = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split('\n');
    const newClients = lines
      .map(line => { const parts = line.split(/[;\t,]/).map(p => p.trim()); return { document: formatCpfCnpj(parts[0] || ''), name: parts[1] || '' }; })
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
        const newClients = lines.map(line => { const parts = line.split(/[;\t,]/).map(p => p.trim()); return { document: formatCpfCnpj(parts[0] || ''), name: parts[1] || '' }; }).filter(c => c.document || c.name);
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
        const newClients = rows.slice(1).map(row => ({ document: formatCpfCnpj(String(row[0] || '').trim()), name: String(row[1] || '').trim() })).filter(c => c.document || c.name);
        onClientsChange([...clients, ...newClients]);
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = '';
  };

  const toggleCommodity = (value: string) => {
    const normalizedValue = normalizeCommodityCode(value);
    const current = (form.commodities || []).map(normalizeCommodityCode);
    onFieldChange(
      'commodities',
      current.includes(normalizedValue)
        ? current.filter(c => c !== normalizedValue)
        : [...current, normalizedValue],
    );
  };

  return (
    <div className="space-y-6">
      {/* Identification */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Código (automático)</Label>
          <Input value={form.code_auto || ''} disabled placeholder="Gerado ao salvar" className="bg-muted/50" />
        </div>
        <div className="space-y-2">
          <Label>Código (livre)</Label>
          <Input value={form.code_custom || ''} onChange={e => onFieldChange('code_custom', e.target.value)} placeholder="Ex: CAMP-SOJA-2026" />
        </div>
        <div className="space-y-2">
          <Label>Nome da Campanha</Label>
          <Input value={form.name} onChange={e => onFieldChange('name', e.target.value)} placeholder="Ex: Safra 2025/26 Barter Soja" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Empresa Responsável</Label>
          <Input value={form.company_name || ''} onChange={e => onFieldChange('company_name', e.target.value)} placeholder="Ex: AgroCorp S.A." />
        </div>
        <div className="space-y-2">
          <Label>Divisão / BU / Foco</Label>
          <Input value={form.division || ''} onChange={e => onFieldChange('division', e.target.value)} placeholder="Ex: Proteção de Cultivos" />
        </div>
        <div className="space-y-2">
          <Label>Safra</Label>
          <Input value={form.season} onChange={e => onFieldChange('season', e.target.value)} placeholder="Ex: 2025/26" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Descritivo da Campanha</Label>
        <Textarea value={form.description || ''} onChange={e => onFieldChange('description', e.target.value)} rows={3} placeholder="Descreva o objetivo e escopo da campanha..." />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <Label>Enquadramento</Label>
          <Select value={form.campaign_type || 'vendas'} onValueChange={v => onFieldChange('campaign_type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CAMPAIGN_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DatePickerField label="Vigência - Início (Emissão)" value={form.start_date || ''} onChange={v => onFieldChange('start_date', v)} />
        <DatePickerField label="Vigência - Fim (Emissão)" value={form.end_date || ''} onChange={v => onFieldChange('end_date', v)} />
        <DatePickerField label="Limite de Faturamento" value={form.billing_deadline || ''} onChange={v => onFieldChange('billing_deadline', v)} />
      </div>

      {/* Commodities & Active */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Commodities</Label>
          <div className="flex gap-4 flex-wrap">
            {commodityOptions.map(c => (
              <label key={c.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={(form.commodities || []).map(normalizeCommodityCode).includes(normalizeCommodityCode(c.value))} onCheckedChange={() => toggleCommodity(c.value)} />
                {c.label}
              </label>
            ))}
            {commodityOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma commodity ativa cadastrada no MasterData.</p>
            )}
          </div>
        </div>
        <div className="space-y-2 pt-6">
          <div className="flex items-center gap-3">
            <Switch checked={form.active} onCheckedChange={v => {
              if (v && !form.active) {
                // Validate before activating
                const errors: string[] = [];
                if (!form.start_date || !form.end_date) errors.push('Vigência (início e fim) deve ser definida');
                if (form.start_date && form.end_date && form.start_date > form.end_date) errors.push('Data de início deve ser anterior à data de fim');
                if (!form.commodities || form.commodities.length === 0) errors.push('Pelo menos 1 commodity deve ser selecionada');
                if (onValidateActivation) {
                  const extErrors = onValidateActivation();
                  errors.push(...extErrors);
                }
                if (errors.length > 0) {
                  if (onActivationError) onActivationError(errors);
                  return;
                }
              }
              onFieldChange('active', v);
            }} />
            <Label>Campanha Ativa</Label>
          </div>
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
          <Input placeholder="CPF/CNPJ" value={newDoc} onChange={e => setNewDoc(formatCpfCnpj(e.target.value))} className="max-w-[200px]" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addClient())} />
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
            Nenhum cliente na whitelist.
          </p>
        )}
      </div>
    </div>
  );
}
