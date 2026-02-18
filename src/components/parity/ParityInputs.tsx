import { DollarSign, Wheat, Truck, Shield, MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { CommodityPricing, FreightReducer } from '@/types/barter';

interface DeliveryLocation {
  id: string;
  warehouse_name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface ParityInputsProps {
  amount: number;
  setAmount: (v: number) => void;
  pricing: CommodityPricing;
  livePrice: number | null;
  ports: string[];
  port: string;
  setPort: (v: string) => void;
  freights: FreightReducer[];
  freightOrigin: string;
  setFreightOrigin: (v: string) => void;
  freightReducer?: FreightReducer;
  hasContract: boolean;
  setHasContract: (v: boolean) => void;
  userPrice: number;
  setUserPrice: (v: number) => void;
  showInsurance: boolean;
  setShowInsurance: (v: boolean) => void;
  volatility: number;
  setVolatility: (v: number) => void;
  deliveryLocations: DeliveryLocation[];
  selectedDeliveryLocation: string;
  setSelectedDeliveryLocation: (v: string) => void;
  autoDistanceKm: number | null;
  onCalculateDistance: () => void;
  realtimeLoading: boolean;
  formatCurrency: (v: number) => string;
}

export default function ParityInputs({
  amount, setAmount, pricing, livePrice,
  ports, port, setPort,
  freights, freightOrigin, setFreightOrigin, freightReducer,
  hasContract, setHasContract, userPrice, setUserPrice,
  showInsurance, setShowInsurance, volatility, setVolatility,
  deliveryLocations, selectedDeliveryLocation, setSelectedDeliveryLocation,
  autoDistanceKm, onCalculateDistance, realtimeLoading, formatCurrency,
}: ParityInputsProps) {
  return (
    <div className="space-y-4">
      {/* Montante */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> Montante</h3>
        <div>
          <label className="stat-label">Valor Total do Pedido (R$)</label>
          <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="mt-1 bg-muted border-border font-mono text-foreground" />
        </div>
      </div>

      {/* Commodity */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Wheat className="w-4 h-4 text-primary" /> Commodity</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground">Bolsa</span><div className="font-mono font-medium text-foreground">{pricing.exchange}</div></div>
          <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground">Contrato</span><div className="font-mono font-medium text-foreground">{pricing.contract}</div></div>
          <div className="bg-muted/50 rounded p-2">
            <span className="text-muted-foreground">Preço Bolsa</span>
            <div className="font-mono font-medium text-foreground">
              US$ {pricing.exchangePrice.toFixed(4)}
              {livePrice !== null && <span className="ml-1 text-[10px] text-primary">LIVE</span>}
            </div>
          </div>
          <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground">Câmbio</span><div className="font-mono font-medium text-foreground">R$ {pricing.exchangeRateBolsa.toFixed(4)}</div></div>
        </div>
      </div>

      {/* Logística */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> Logística</h3>
        <div>
          <label className="stat-label">Porto de Referência</label>
          <Select value={port} onValueChange={setPort}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ports.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="stat-label">Origem (Frete Manual)</label>
          <Select value={freightOrigin} onValueChange={setFreightOrigin}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {freights.map(f => <SelectItem key={f.origin} value={f.origin}>{f.origin}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {freightReducer && (
          <div className="text-xs text-muted-foreground">
            Redutor logístico: <span className="font-mono text-warning">{formatCurrency(freightReducer.totalReducer)}/saca</span>
            <span className="ml-2">({freightReducer.distanceKm.toFixed(0)} km)</span>
          </div>
        )}
      </div>

      {/* Distância Automática */}
      {deliveryLocations.length > 0 && (
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Distância Automática</h3>
          <div>
            <label className="stat-label">Local de Entrega</label>
            <Select value={selectedDeliveryLocation} onValueChange={setSelectedDeliveryLocation}>
              <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione armazém..." /></SelectTrigger>
              <SelectContent>
                {deliveryLocations.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.warehouse_name} {loc.city ? `- ${loc.city}/${loc.state}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={onCalculateDistance} disabled={realtimeLoading || !selectedDeliveryLocation} className="w-full">
            {realtimeLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
            Calcular Distância
          </Button>
          {autoDistanceKm !== null && (
            <div className="text-xs bg-primary/10 rounded p-2 text-center">
              <span className="text-muted-foreground">Distância calculada:</span>{' '}
              <span className="font-mono font-bold text-primary">{autoDistanceKm.toFixed(0)} km</span>
            </div>
          )}
        </div>
      )}

      {/* Contrato existente */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-foreground">Possui contrato de compra e venda?</Label>
          <Switch checked={hasContract} onCheckedChange={setHasContract} />
        </div>
        {hasContract && (
          <div>
            <label className="stat-label">Preço do Contrato (R$/saca)</label>
            <Input type="number" value={userPrice} onChange={e => setUserPrice(Number(e.target.value))} className="mt-1 bg-muted border-border font-mono text-foreground" step={0.5} />
          </div>
        )}
      </div>

      {/* Seguro */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-foreground flex items-center gap-2"><Shield className="w-4 h-4 text-info" /> Seguro de Mercado</Label>
          <Switch checked={showInsurance} onCheckedChange={setShowInsurance} />
        </div>
        {showInsurance && (
          <div>
            <label className="stat-label">Volatilidade (%)</label>
            <Input type="number" value={volatility} onChange={e => setVolatility(Number(e.target.value))} className="mt-1 bg-muted border-border font-mono text-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
