import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save } from 'lucide-react';
import { useCommodityPricing, useUpsertCommodityPricing, useDeleteCommodityPricing, useFreightReducers, useUpsertFreightReducer, useDeleteFreightReducer } from '@/hooks/useCommodityPricing';
import { toast } from 'sonner';

const COMMODITIES = [
  { value: 'soja', label: 'Soja' },
  { value: 'milho', label: 'Milho' },
  { value: 'cafe', label: 'Café' },
  { value: 'algodao', label: 'Algodão' },
];

type Props = { campaignId?: string; campaignCommodities?: string[] };

type BasisPort = { port: string; basis: number };

export default function CommoditiesTab({ campaignId, campaignCommodities = [] }: Props) {
  const { data: pricingList, isLoading: loadingPricing } = useCommodityPricing(campaignId);
  const { data: freightList, isLoading: loadingFreight } = useFreightReducers(campaignId);
  const upsertPricing = useUpsertCommodityPricing();
  const deletePricing = useDeleteCommodityPricing();
  const upsertFreight = useUpsertFreightReducer();
  const deleteFreight = useDeleteFreightReducer();

  const [selectedCommodity, setSelectedCommodity] = useState(campaignCommodities[0] || 'soja');
  const [pricingForm, setPricingForm] = useState<any>(null);
  const [basisPorts, setBasisPorts] = useState<BasisPort[]>([]);
  const [newPort, setNewPort] = useState('');
  const [newBasis, setNewBasis] = useState(0);

  // Freight state
  const [newFreight, setNewFreight] = useState({ origin: '', destination: '', distance_km: 0, cost_per_km: 0.10, adjustment: 0 });

  // Load pricing for selected commodity
  useEffect(() => {
    if (pricingList) {
      const existing = pricingList.find((p: any) => p.commodity === selectedCommodity);
      if (existing) {
        setPricingForm({
          id: existing.id,
          exchange: existing.exchange,
          contract: existing.contract,
          exchange_price: existing.exchange_price,
          exchange_rate_bolsa: existing.exchange_rate_bolsa,
          exchange_rate_option: existing.exchange_rate_option,
          option_cost: existing.option_cost,
          security_delta_market: existing.security_delta_market,
          security_delta_freight: existing.security_delta_freight,
          stop_loss: existing.stop_loss,
          volatility: existing.volatility,
        });
        const bp = existing.basis_by_port as any;
        if (bp && typeof bp === 'object') {
          setBasisPorts(Object.entries(bp).map(([port, basis]) => ({ port, basis: Number(basis) })));
        } else {
          setBasisPorts([]);
        }
      } else {
        setPricingForm(null);
        setBasisPorts([]);
      }
    }
  }, [pricingList, selectedCommodity]);

  const onPricingField = (k: string, v: any) => setPricingForm((p: any) => ({ ...p, [k]: v }));

  const savePricing = async () => {
    if (!campaignId) return;
    const basisObj: any = {};
    basisPorts.forEach(bp => { basisObj[bp.port] = bp.basis; });
    try {
      await upsertPricing.mutateAsync({
        ...pricingForm,
        campaign_id: campaignId,
        commodity: selectedCommodity,
        basis_by_port: basisObj,
      });
      toast.success('Precificação salva');
    } catch (e: any) { toast.error(e.message); }
  };

  const addBasisPort = () => {
    if (!newPort.trim()) return;
    setBasisPorts(prev => [...prev, { port: newPort.trim(), basis: newBasis }]);
    setNewPort('');
    setNewBasis(0);
  };

  const addFreightReducer = async () => {
    if (!newFreight.origin || !newFreight.destination || !campaignId) return;
    const total = newFreight.distance_km * newFreight.cost_per_km + (newFreight.adjustment || 0);
    try {
      await upsertFreight.mutateAsync({ ...newFreight, campaign_id: campaignId, total_reducer: total });
      setNewFreight({ origin: '', destination: '', distance_km: 0, cost_per_km: 0.10, adjustment: 0 });
      toast.success('Frete adicionado');
    } catch (e: any) { toast.error(e.message); }
  };

  if (!campaignId) return <p className="text-center py-8 text-muted-foreground">Salve a campanha primeiro para configurar commodities.</p>;

  const defaultForm = {
    exchange: 'CBOT', contract: 'K', exchange_price: 0, exchange_rate_bolsa: 5.40,
    exchange_rate_option: 5.40, option_cost: 0, security_delta_market: 2,
    security_delta_freight: 15, stop_loss: 0, volatility: 25,
  };
  const f = pricingForm || defaultForm;

  return (
    <div className="space-y-6">
      {/* Commodity Selector */}
      <div className="flex items-center gap-4">
        <Label className="text-base font-semibold">Commodity:</Label>
        <div className="flex gap-2">
          {(campaignCommodities.length > 0 ? campaignCommodities : COMMODITIES.map(c => c.value)).map(c => (
            <Button key={c} variant={selectedCommodity === c ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCommodity(c)}>
              {COMMODITIES.find(x => x.value === c)?.label || c}
            </Button>
          ))}
        </div>
      </div>

      {/* Pricing Form */}
      <div className="border border-border rounded-md p-4 space-y-4">
        <Label className="font-semibold">Precificação - {COMMODITIES.find(x => x.value === selectedCommodity)?.label}</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Bolsa</Label>
            <Input value={f.exchange} onChange={e => onPricingField('exchange', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contrato</Label>
            <Input value={f.contract} onChange={e => onPricingField('contract', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preço Bolsa (USD)</Label>
            <Input type="number" step="0.01" value={f.exchange_price} onChange={e => onPricingField('exchange_price', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Câmbio Bolsa</Label>
            <Input type="number" step="0.01" value={f.exchange_rate_bolsa} onChange={e => onPricingField('exchange_rate_bolsa', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Câmbio Opção</Label>
            <Input type="number" step="0.01" value={f.exchange_rate_option} onChange={e => onPricingField('exchange_rate_option', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Custo Opção</Label>
            <Input type="number" step="0.01" value={f.option_cost} onChange={e => onPricingField('option_cost', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Delta Mercado (%)</Label>
            <Input type="number" step="0.1" value={f.security_delta_market} onChange={e => onPricingField('security_delta_market', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Delta Frete (R$/sc)</Label>
            <Input type="number" step="0.1" value={f.security_delta_freight} onChange={e => onPricingField('security_delta_freight', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stop Loss (%)</Label>
            <Input type="number" step="0.1" value={f.stop_loss} onChange={e => onPricingField('stop_loss', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Volatilidade (%)</Label>
            <Input type="number" step="0.1" value={f.volatility} onChange={e => onPricingField('volatility', Number(e.target.value))} />
          </div>
        </div>

        {/* Basis by Port */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Basis por Porto / Mercado Formador</Label>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Porto/Local</Label>
              <Input value={newPort} onChange={e => setNewPort(e.target.value)} placeholder="Ex: Paranaguá" />
            </div>
            <div className="w-32 space-y-1">
              <Label className="text-xs">Basis (R$/sc)</Label>
              <Input type="number" step="0.1" value={newBasis} onChange={e => setNewBasis(Number(e.target.value))} />
            </div>
            <Button variant="outline" size="sm" onClick={addBasisPort}><Plus className="w-3 h-3" /></Button>
          </div>
          {basisPorts.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {basisPorts.map((bp, i) => (
                <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => setBasisPorts(prev => prev.filter((_, j) => j !== i))}>
                  {bp.port}: R${bp.basis}/sc ×
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button onClick={savePricing} disabled={upsertPricing.isPending}>
          <Save className="w-4 h-4 mr-1" /> Salvar Precificação
        </Button>
      </div>

      {/* Freight Reducers */}
      <div className="border border-border rounded-md p-4 space-y-4">
        <Label className="font-semibold">Redutores de Frete</Label>

        <div className="flex gap-2 items-end flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Origem</Label>
            <Input value={newFreight.origin} onChange={e => setNewFreight(p => ({ ...p, origin: e.target.value }))} placeholder="Ex: Sorriso-MT" className="w-36" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Destino</Label>
            <Input value={newFreight.destination} onChange={e => setNewFreight(p => ({ ...p, destination: e.target.value }))} placeholder="Ex: Paranaguá-PR" className="w-36" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Distância (km)</Label>
            <Input type="number" value={newFreight.distance_km} onChange={e => setNewFreight(p => ({ ...p, distance_km: Number(e.target.value) }))} className="w-28" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">R$/km</Label>
            <Input type="number" step="0.01" value={newFreight.cost_per_km} onChange={e => setNewFreight(p => ({ ...p, cost_per_km: Number(e.target.value) }))} className="w-24" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ajuste</Label>
            <Input type="number" step="0.1" value={newFreight.adjustment} onChange={e => setNewFreight(p => ({ ...p, adjustment: Number(e.target.value) }))} className="w-24" />
          </div>
          <Button onClick={addFreightReducer} disabled={upsertFreight.isPending}><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </div>

        {loadingFreight ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          (freightList || []).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origem</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Distância</TableHead>
                  <TableHead>R$/km</TableHead>
                  <TableHead>Ajuste</TableHead>
                  <TableHead>Total R$/sc</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(freightList || []).map((f: any) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.origin}</TableCell>
                    <TableCell>{f.destination}</TableCell>
                    <TableCell>{f.distance_km} km</TableCell>
                    <TableCell>R$ {Number(f.cost_per_km).toFixed(2)}</TableCell>
                    <TableCell>R$ {Number(f.adjustment || 0).toFixed(2)}</TableCell>
                    <TableCell className="font-medium">R$ {Number(f.total_reducer).toFixed(2)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteFreight.mutate(f.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">
              Nenhum redutor de frete configurado.
            </p>
          )
        )}
      </div>
    </div>
  );
}
