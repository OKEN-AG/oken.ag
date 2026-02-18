import { useState, useMemo, useEffect } from 'react';
import { DollarSign, Wheat, Truck, Shield, MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { CommodityPricing, FreightReducer } from '@/types/barter';

interface DeliveryLocation {
  id: string;
  warehouse_name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity_tons?: number | null;
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
  // Hierarchical state: UF -> City -> Warehouse
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  // Extract unique states from delivery locations
  const availableStates = useMemo(() => {
    const states = new Set(deliveryLocations.filter(l => l.state).map(l => l.state!));
    return [...states].sort();
  }, [deliveryLocations]);

  // Filter cities by selected state
  const availableCities = useMemo(() => {
    if (!selectedState) return [];
    const cities = new Set(
      deliveryLocations
        .filter(l => l.state === selectedState && l.city)
        .map(l => l.city!)
    );
    return [...cities].sort();
  }, [deliveryLocations, selectedState]);

  // Filter warehouses by selected city
  const availableWarehouses = useMemo(() => {
    if (!selectedCity) return [];
    return deliveryLocations
      .filter(l => l.state === selectedState && l.city === selectedCity)
      .sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name));
  }, [deliveryLocations, selectedState, selectedCity]);

  // Reset cascade when parent changes
  const handleStateChange = (uf: string) => {
    setSelectedState(uf);
    setSelectedCity('');
    setSelectedDeliveryLocation('');
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSelectedDeliveryLocation('');
  };

  // Auto-calculate distance when warehouse is selected
  useEffect(() => {
    if (selectedDeliveryLocation) {
      onCalculateDistance();
    }
  }, [selectedDeliveryLocation]);

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

        {/* Hierarchical: UF -> City -> Warehouse */}
        {deliveryLocations.length > 0 ? (
          <>
            <div>
              <label className="stat-label">Estado (UF)</label>
              <Select value={selectedState} onValueChange={handleStateChange}>
                <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione UF..." /></SelectTrigger>
                <SelectContent>
                  {availableStates.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {selectedState && (
              <div>
                <label className="stat-label">Cidade</label>
                <Select value={selectedCity} onValueChange={handleCityChange}>
                  <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione cidade..." /></SelectTrigger>
                  <SelectContent>
                    {availableCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedCity && (
              <div>
                <label className="stat-label">Armazém</label>
                <Select value={selectedDeliveryLocation} onValueChange={setSelectedDeliveryLocation}>
                  <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione armazém..." /></SelectTrigger>
                  <SelectContent>
                    {availableWarehouses.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.warehouse_name}{loc.capacity_tons ? ` (${loc.capacity_tons}t)` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {realtimeLoading && selectedDeliveryLocation && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Calculando distância...
              </div>
            )}

            {autoDistanceKm !== null && (
              <div className="text-xs bg-primary/10 rounded p-2 text-center">
                <span className="text-muted-foreground">Distância calculada:</span>{' '}
                <span className="font-mono font-bold text-primary">{autoDistanceKm.toFixed(0)} km</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="stat-label">Origem (Frete Manual)</label>
              <Select value={freightOrigin} onValueChange={setFreightOrigin}>
                <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {freights.map(f => <SelectItem key={f.origin} value={f.origin}>{f.origin}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {freightReducer && (
          <div className="text-xs text-muted-foreground">
            Redutor logístico: <span className="font-mono text-warning">{formatCurrency(freightReducer.totalReducer)}/ton</span>
            <span className="ml-2">({freightReducer.distanceKm.toFixed(0)} km)</span>
          </div>
        )}
      </div>

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
