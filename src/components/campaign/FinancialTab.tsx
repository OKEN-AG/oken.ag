import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { parsePtBrNumber, formatPtBrNumber } from '@/lib/ptbr';

export type PaymentMethodRow = {
  method_name: string;
  markup_percent: number;
  active: boolean;
  annual_interest_rate: number;
};

export type DueDateRow = {
  region_type: string;
  region_value: string;
  due_date: string;
};

type Props = {
  form: {
    exchange_rate_products: number;
    exchange_rate_barter: number;
    interest_rate: number;
    max_discount_internal: number;
    max_discount_reseller: number;
  };
  onFieldChange: (key: string, value: any) => void;
  paymentMethods: PaymentMethodRow[];
  onPaymentMethodsChange: (methods: PaymentMethodRow[]) => void;
  dueDates: DueDateRow[];
  onDueDatesChange: (dates: DueDateRow[]) => void;
};

const DEFAULT_METHODS = ['Duplicata', 'Boleto', 'Transferência/PIX', 'Barter', 'Cartão de Crédito'];

export default function FinancialTab({ form, onFieldChange, paymentMethods, onPaymentMethodsChange, dueDates, onDueDatesChange }: Props) {
  const [newDueRegionType, setNewDueRegionType] = useState('estado');
  const [newDueRegionValue, setNewDueRegionValue] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  const addDefaultMethods = () => {
    const existing = paymentMethods.map(m => m.method_name);
    const newMethods = DEFAULT_METHODS.filter(m => !existing.includes(m)).map(m => ({
      method_name: m, markup_percent: 0, active: true, annual_interest_rate: 0,
    }));
    onPaymentMethodsChange([...paymentMethods, ...newMethods]);
  };

  const updateMethod = (idx: number, field: keyof PaymentMethodRow, value: any) => {
    const updated = [...paymentMethods];
    updated[idx] = { ...updated[idx], [field]: value };
    onPaymentMethodsChange(updated);
  };

  const removeMethod = (idx: number) => {
    onPaymentMethodsChange(paymentMethods.filter((_, i) => i !== idx));
  };

  const addDueDate = () => {
    if (!newDueRegionValue || !newDueDate) return;
    onDueDatesChange([...dueDates, { region_type: newDueRegionType, region_value: newDueRegionValue, due_date: newDueDate }]);
    setNewDueRegionValue('');
    setNewDueDate('');
  };

  return (
    <div className="space-y-6">
      {/* Financial params */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Câmbio Produtos (R$/USD)</Label>
          <p className="text-[10px] text-muted-foreground">Ex.: {formatPtBrNumber(form.exchange_rate_products, 4)}</p>
          <Input type="text" inputMode="decimal" value={form.exchange_rate_products} onChange={e => onFieldChange('exchange_rate_products', parsePtBrNumber(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Câmbio Barter (R$/USD)</Label>
          <Input type="text" inputMode="decimal" value={form.exchange_rate_barter} onChange={e => onFieldChange('exchange_rate_barter', parsePtBrNumber(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Juros (% a.m.)</Label>
          <Input type="text" inputMode="decimal" value={form.interest_rate} onChange={e => onFieldChange('interest_rate', parsePtBrNumber(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Desc. Máx. Interno (%)</Label>
          <Input type="text" inputMode="decimal" value={form.max_discount_internal} onChange={e => onFieldChange('max_discount_internal', parsePtBrNumber(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Desc. Máx. Revenda (%)</Label>
          <Input type="text" inputMode="decimal" value={form.max_discount_reseller} onChange={e => onFieldChange('max_discount_reseller', parsePtBrNumber(e.target.value))} />
        </div>
      </div>

      {/* Payment Methods */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Meios de Pagamento</Label>
          {paymentMethods.length === 0 && (
            <Button variant="outline" size="sm" onClick={addDefaultMethods}>Carregar Padrões</Button>
          )}
        </div>
        {paymentMethods.length > 0 ? (
          <div className="border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Meio de Pagamento</TableHead>
                  <TableHead className="w-20 text-center">Ativo</TableHead>
                  <TableHead className="w-36">Ágio/Deságio %</TableHead>
                  <TableHead className="w-36">Juros a.a. %</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentMethods.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{m.method_name}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={m.active} onCheckedChange={v => updateMethod(i, 'active', v)} />
                    </TableCell>
                    <TableCell>
                      <Input type="text" inputMode="decimal" value={m.markup_percent} onChange={e => updateMethod(i, 'markup_percent', parsePtBrNumber(e.target.value))} className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Input type="text" inputMode="decimal" value={m.annual_interest_rate} onChange={e => updateMethod(i, 'annual_interest_rate', parsePtBrNumber(e.target.value))} className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMethod(i)}>
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
            Nenhum meio de pagamento configurado. Clique em "Carregar Padrões" para iniciar.
          </p>
        )}
      </div>

      {/* Due Dates by Region */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Datas de Vencimento por Região</Label>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={newDueRegionType} onValueChange={setNewDueRegionType}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="regiao">Região</SelectItem>
                <SelectItem value="estado">Estado</SelectItem>
                <SelectItem value="mesorregiao">Mesorregião</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[150px]">
            <Label className="text-xs">Valor</Label>
            <Input value={newDueRegionValue} onChange={e => setNewDueRegionValue(e.target.value)} placeholder="Ex: SP, Sul, Norte Central" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vencimento</Label>
            <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="h-9" />
          </div>
          <Button variant="outline" size="sm" onClick={addDueDate}><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>
        </div>
        {dueDates.length > 0 && (
          <div className="border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Região</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dueDates.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="capitalize">{d.region_type}</TableCell>
                    <TableCell>{d.region_value}</TableCell>
                    <TableCell>{new Date(d.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDueDatesChange(dueDates.filter((_, j) => j !== i))}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Aforo / Overcollateralization */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Aforo / Sobrecolateralização</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Aforo (%)</Label>
            <Input type="text" inputMode="decimal" value={(form as any).aforo_percent ?? ''} onChange={e => onFieldChange('aforo_percent', parsePtBrNumber(e.target.value))} />
            <p className="text-[10px] text-muted-foreground">Percentual de sobrecolateralização exigido. Ex: 130% significa que o cliente precisa entregar garantias equivalentes a 130% do valor da operação.</p>
          </div>
        </div>
      </div>

      {/* Default freight cost per km */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Parâmetros de Frete</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Custo Padrão Frete (R$/km)</Label>
            <Input type="text" inputMode="decimal" value={(form as any).default_freight_cost_per_km ?? ''} onChange={e => onFieldChange('default_freight_cost_per_km', parsePtBrNumber(e.target.value))} />
            <p className="text-[10px] text-muted-foreground">Usado como fallback quando não há redutor logístico configurado.</p>
          </div>
        </div>
      </div>

      {/* Credit types placeholder */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Tipos de Crédito</Label>
        <p className="text-sm text-muted-foreground border border-dashed border-border rounded-md py-4 text-center">
          Lista de credores será disponibilizada com o módulo de credores.
        </p>
      </div>
    </div>
  );
}
