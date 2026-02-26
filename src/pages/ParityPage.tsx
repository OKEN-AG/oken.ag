import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useActiveCampaigns } from '@/hooks/useActiveCampaign';
import { useCommodityOptions } from '@/hooks/useCommoditiesMasterData';
import { normalizeCommodityCode, toCommodityLabel } from '@/lib/commodity';
import { useOperations, useUpdateOperation, useCreateOperationLog } from '@/hooks/useOperations';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimePricing } from '@/hooks/useRealtimePricing';
import { useParityEngine } from '@/hooks/useParityEngine';
import type { FreightReducer } from '@/types/barter';
import { Wheat, ArrowRight, TrendingUp, DollarSign, Truck, Shield, Save, Loader2, RefreshCw, MapPin, Zap, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

import ParityInputs from '@/components/parity/ParityInputs';
import ParityResults from '@/components/parity/ParityResults';

export default function ParityPage() {
  const location = useLocation();
  const { user } = useAuth();

  const stateAmount = (location.state as any)?.amount;
  const stateGross = (location.state as any)?.grossAmount;
  const stateCampaignId = (location.state as any)?.campaignId;
  const stateOperationId = (location.state as any)?.operationId;

  const { data: activeCampaigns } = useActiveCampaigns();
  const { data: operations } = useOperations();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(stateCampaignId || '');
  const [selectedOperationId, setSelectedOperationId] = useState<string>(stateOperationId || '');

  useEffect(() => {
    if (!selectedCampaignId && stateCampaignId) {
      setSelectedCampaignId(stateCampaignId);
    } else if (!selectedCampaignId && activeCampaigns && activeCampaigns.length > 0) {
      setSelectedCampaignId(activeCampaigns[0].id);
    }
  }, [activeCampaigns, stateCampaignId, selectedCampaignId]);

  useEffect(() => {
    if (!selectedOperationId && stateOperationId) {
      setSelectedOperationId(stateOperationId);
    }
  }, [stateOperationId, selectedOperationId]);

  const selectedOp = operations?.find(op => op.id === selectedOperationId);
  const [selectedCommodity, setSelectedCommodity] = useState<string>('');

  // Fetch campaign for commodities list
  const { data: rawCampaign, isLoading: campaignLoading } = useQuery({
    queryKey: ['campaign-for-parity', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data, error } = await supabase.from('campaigns').select('commodities, default_freight_cost_per_km').eq('id', selectedCampaignId).single();
      if (error) throw error;
      return data;
    },
  });

  const { options: commodityOptions } = useCommodityOptions((rawCampaign?.commodities || []) as string[]);

  useEffect(() => {
    if (!commodityOptions.length) return;
    if (!commodityOptions.some(option => normalizeCommodityCode(option.value) === normalizeCommodityCode(selectedCommodity))) {
      setSelectedCommodity(normalizeCommodityCode(commodityOptions[0].value));
    }
  }, [commodityOptions, selectedCommodity]);

  const updateOperation = useUpdateOperation();
  const createLog = useCreateOperationLog();
  const { fetchLivePrice, fetchExchangeRate, calculateDistance, loading: realtimeLoading } = useRealtimePricing();
  const parityEngine = useParityEngine();

  const [amount, setAmount] = useState(stateAmount ?? 500000);
  const [grossAmount, setGrossAmount] = useState(stateGross ?? 600000);
  const [port, setPort] = useState('');
  const [freightOrigin, setFreightOrigin] = useState('');
  const [hasContract, setHasContract] = useState(false);
  const [userPrice, setUserPrice] = useState(0);
  const [showInsurance, setShowInsurance] = useState(false);
  const [volatility, setVolatility] = useState(25);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveExchangeRate, setLiveExchangeRate] = useState<number | null>(null);
  const [livePriceTimestamp, setLivePriceTimestamp] = useState<string | null>(null);
  const [autoDistanceKm, setAutoDistanceKm] = useState<number | null>(null);
  const [selectedDeliveryLocation, setSelectedDeliveryLocation] = useState<string>('');

  useEffect(() => {
    if (selectedOp) {
      if (selectedOp.net_revenue) setAmount(selectedOp.net_revenue);
      if (selectedOp.gross_revenue) setGrossAmount(selectedOp.gross_revenue);
      if (selectedOp.commodity) setSelectedCommodity(normalizeCommodityCode(selectedOp.commodity));
    }
  }, [selectedOp]);

  // ─── Server-authoritative parity calculation ───
  const recalculate = useCallback(async () => {
    if (!selectedCampaignId || !selectedCommodity) return;
    try {
      const res = await parityEngine.calculate({
        campaignId: selectedCampaignId,
        commodityCode: selectedCommodity,
        port,
        freightOrigin,
        amount,
        grossAmount,
        hasContract,
        userOverridePrice: userPrice,
        showInsurance,
        livePrice,
        liveExchangeRate,
      });
      // Update volatility from backend
      if (res.commodityPricingRow?.volatility) {
        setVolatility(res.commodityPricingRow.volatility);
      }
      // Auto-select first port if not set
      if (!port && res.ports.length > 0) setPort(res.ports[0]);
      if (!freightOrigin && res.freightOrigins.length > 0) setFreightOrigin(res.freightOrigins[0].origin);
    } catch (e: any) {
      toast.error('Erro no cálculo: ' + e.message);
    }
  }, [selectedCampaignId, selectedCommodity, port, freightOrigin, amount, grossAmount, hasContract, userPrice, showInsurance, livePrice, liveExchangeRate, parityEngine]);

  // Trigger recalculation on parameter changes
  useEffect(() => {
    if (selectedCampaignId && selectedCommodity) {
      recalculate();
    }
  }, [selectedCampaignId, selectedCommodity, port, freightOrigin, amount, grossAmount, hasContract, userPrice, showInsurance, livePrice, liveExchangeRate]);

  // Derived values from backend result
  const res = parityEngine.result;
  const parity = res?.parity ?? { totalAmountBRL: amount, commodityPricePerUnit: 0, quantitySacas: 0, referencePrice: 0, valorization: 0, userOverridePrice: null, hasExistingContract: false };
  const insurancePremium = res?.insurance ?? null;
  const commodityNetPrice = res?.effectiveCommodityPrice ?? 0;
  const valorizationBonus = res?.valorizationBonus ?? 0;
  const ports = res?.ports ?? [];
  const freights: FreightReducer[] = (res?.freightOrigins ?? []).map(f => ({ origin: f.origin, destination: f.destination, distanceKm: 0, costPerKm: 0, adjustment: 0, totalReducer: 0 }));
  const deliveryLocations = res?.deliveryLocations ?? [];
  const pricing = res?.commodityPricingRow ?? { exchange: '', contract: '', exchangePrice: 0, exchangeRateBolsa: 0, optionCost: 0, securityDeltaMarket: 0, securityDeltaFreight: 0, stopLoss: 0, bushelsPerTon: 0, pesoSacaKg: 0, volatility: 0, riskFreeRate: 0, ticker: '', currencyUnit: '' };

  const hasCommodityData = !!res?.commodityPricingRow;
  const isLoading = campaignLoading || parityEngine.loading;

  // Build effective pricing object for UI components
  const effectivePricing = useMemo(() => ({
    commodity: selectedCommodity as any,
    exchange: pricing.exchange,
    contract: pricing.contract,
    exchangePrice: pricing.exchangePrice,
    optionCost: pricing.optionCost,
    exchangeRateBolsa: pricing.exchangeRateBolsa,
    exchangeRateOption: pricing.exchangeRateBolsa,
    basisByPort: Object.fromEntries(ports.map(p => [p, 0])) as Record<string, number>,
    securityDeltaMarket: pricing.securityDeltaMarket,
    securityDeltaFreight: pricing.securityDeltaFreight,
    stopLoss: pricing.stopLoss,
    bushelsPerTon: pricing.bushelsPerTon,
    pesoSacaKg: pricing.pesoSacaKg,
    volatility: pricing.volatility,
    riskFreeRate: pricing.riskFreeRate,
  }), [pricing, ports, selectedCommodity]);

  const freightReducer = freights.find(f => f.origin === freightOrigin);

  // Port coordinates from DB
  const { data: portsFromDB } = useQuery({
    queryKey: ['ports', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data, error } = await supabase.from('ports').select('*').or(`is_global.eq.true,campaign_id.eq.${selectedCampaignId}`);
      if (error) throw error;
      return data || [];
    },
  });

  const portCoordinates = useMemo<Record<string, { lat: number; lng: number }>>(() => {
    const coords: Record<string, { lat: number; lng: number }> = {};
    for (const p of (portsFromDB || [])) {
      for (const portName of ports) {
        if (portName.toLowerCase().includes(p.port_name.toLowerCase()) || p.port_name.toLowerCase().includes(portName.split(' ')[0].toLowerCase())) {
          coords[portName] = { lat: Number(p.latitude), lng: Number(p.longitude) };
        }
      }
    }
    for (const loc of deliveryLocations) {
      if (loc.latitude && loc.longitude && loc.warehouseName) {
        for (const portName of ports) {
          if (!coords[portName] && (portName.toLowerCase().includes((loc.city || '').toLowerCase()) || loc.warehouseName.toLowerCase().includes(portName.split(' ')[0].toLowerCase()))) {
            coords[portName] = { lat: loc.latitude, lng: loc.longitude };
          }
        }
      }
    }
    return coords;
  }, [portsFromDB, deliveryLocations, ports]);

  const isValidBrazilCoord = (lat: number, lng: number) => lat >= -35 && lat <= 6 && lng >= -74 && lng <= -34;

  const locationsWithoutCoords = useMemo(() => {
    return deliveryLocations.filter(l => !l.latitude || !l.longitude || l.latitude === 0 || l.longitude === 0 || !isValidBrazilCoord(l.latitude, l.longitude));
  }, [deliveryLocations]);

  const handleFetchLivePrice = useCallback(async () => {
    try {
      const ticker = pricing.ticker || 'ZS=F';
      const currencyUnit = pricing.currencyUnit || 'USc';
      const [priceResult, exchangeResult] = await Promise.all([
        fetchLivePrice(ticker, currencyUnit),
        fetchExchangeRate(),
      ]);
      setLivePrice(priceResult.price_usd);
      setLiveExchangeRate(exchangeResult.rate);
      setLivePriceTimestamp(priceResult.timestamp);
      toast.success(`Preço atualizado: US$ ${priceResult.price_usd.toFixed(4)}/bu | Câmbio: R$ ${exchangeResult.rate.toFixed(4)}`);
    } catch (e: any) {
      toast.error('Erro ao buscar preço: ' + e.message);
    }
  }, [pricing, fetchLivePrice, fetchExchangeRate]);

  const handleCalculateDistance = useCallback(async () => {
    if (!selectedDeliveryLocation) { toast.error('Selecione um local de entrega'); return; }
    const loc = deliveryLocations.find(l => l.id === selectedDeliveryLocation);
    if (!loc || !loc.latitude || !loc.longitude || loc.latitude === 0 || loc.longitude === 0) {
      toast.error('Local de entrega sem coordenadas cadastradas.'); return;
    }
    const portCoord = portCoordinates[port];
    if (!portCoord) { toast.error(`Porto "${port}" sem coordenadas configuradas`); return; }
    try {
      const result = await calculateDistance(loc.latitude, loc.longitude, portCoord.lat, portCoord.lng);
      setAutoDistanceKm(result.distancia_km);
      toast.success(`Distância calculada: ${result.distancia_km.toFixed(0)} km (${result.metodo})`);
    } catch (e: any) {
      toast.error('Erro ao calcular distância: ' + e.message);
    }
  }, [selectedDeliveryLocation, deliveryLocations, port, portCoordinates, calculateDistance]);

  const handleSaveParity = async () => {
    if (!selectedOperationId || !user) return;
    try {
      await updateOperation.mutateAsync({
        id: selectedOperationId,
        updates: {
          total_sacas: insurancePremium?.totalSacas ?? parity.quantitySacas,
          commodity_price: parity.commodityPricePerUnit,
          reference_price: parity.referencePrice,
          has_existing_contract: hasContract,
          insurance_premium_sacas: insurancePremium?.additionalSacas ?? 0,
          payment_method: 'barter' as const,
          status: 'pedido' as const,
        },
      });
      await createLog.mutateAsync({
        operation_id: selectedOperationId,
        user_id: user.id,
        action: 'paridade_calculada',
        details: { sacas: parity.quantitySacas, preco: parity.commodityPricePerUnit, port, livePrice, liveExchangeRate, valorizationBonus, volatility },
      });
      toast.success('Paridade salva na operação!');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const campaignOperations = operations?.filter(op => !selectedCampaignId || op.campaign_id === selectedCampaignId) || [];

  // Map delivery locations to format expected by ParityInputs
  const deliveryLocationsForInputs = deliveryLocations.map(dl => ({
    id: dl.id, warehouse_name: dl.warehouseName, city: dl.city, state: dl.state,
    latitude: dl.latitude, longitude: dl.longitude,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Paridade Barter</h1>
          <p className="text-sm text-muted-foreground">Conversão do montante em sacas de commodity</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleFetchLivePrice} disabled={realtimeLoading} className="border-primary/30">
            {realtimeLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2 text-primary" />}
            Preço ao Vivo
          </Button>
          {selectedOperationId && (
            <Button onClick={handleSaveParity} disabled={updateOperation.isPending} className="bg-primary text-primary-foreground">
              {updateOperation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Paridade
            </Button>
          )}
        </div>
      </div>

      {/* Campaign, Operation & Commodity selectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <label className="stat-label">Campanha</label>
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione campanha..." /></SelectTrigger>
            <SelectContent>
              {activeCampaigns?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name} ({c.season})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Operação (opcional)</label>
          <Select value={selectedOperationId} onValueChange={setSelectedOperationId}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione operação..." /></SelectTrigger>
            <SelectContent>
              {campaignOperations.map(op => (
                <SelectItem key={op.id} value={op.id}>
                  {op.client_name || 'Sem nome'} — {op.status} — {(op.net_revenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Commodity</label>
          <Select value={selectedCommodity} onValueChange={setSelectedCommodity}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {commodityOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Warnings */}
      {!hasCommodityData && !isLoading && selectedCampaignId && selectedCommodity && (
        <div className="glass-card p-4 border border-warning/50 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <div>
            <div className="text-sm font-semibold text-warning">Precificação de commodity não configurada</div>
            <div className="text-xs text-muted-foreground">Configure os dados de precificação na aba Commodities da campanha.</div>
          </div>
        </div>
      )}

      {parityEngine.error && (
        <div className="glass-card p-4 border border-destructive/50 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div className="text-sm text-destructive">{parityEngine.error}</div>
        </div>
      )}

      {locationsWithoutCoords.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {locationsWithoutCoords.length} local(is) de entrega sem coordenadas (lat/lng): {locationsWithoutCoords.map(l => l.warehouseName).join(', ')}
        </div>
      )}

      {valorizationBonus > 0 && (
        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 flex items-center gap-4 border border-success/30">
          <TrendingUp className="w-5 h-5 text-success" />
          <div className="text-sm">
            <span className="text-muted-foreground">Valorização {selectedCommodity}:</span>{' '}
            <span className="font-mono font-bold text-success">+{formatCurrency(valorizationBonus)}/saca</span>
          </div>
        </motion.div>
      )}

      {livePrice !== null && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 flex items-center gap-4 border border-primary/30">
          <Zap className="w-5 h-5 text-primary" />
          <div className="flex-1 flex gap-6 text-sm">
            <div><span className="text-muted-foreground">Preço Bolsa:</span> <span className="font-mono font-bold text-foreground">US$ {livePrice.toFixed(4)}/bu</span></div>
            <div><span className="text-muted-foreground">Câmbio:</span> <span className="font-mono font-bold text-foreground">R$ {liveExchangeRate?.toFixed(4)}</span></div>
            <div><span className="text-muted-foreground">Atualizado:</span> <span className="font-mono text-muted-foreground">{livePriceTimestamp ? new Date(livePriceTimestamp).toLocaleTimeString('pt-BR') : '-'}</span></div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleFetchLivePrice} disabled={realtimeLoading}>
            <RefreshCw className={`w-4 h-4 ${realtimeLoading ? 'animate-spin' : ''}`} />
          </Button>
        </motion.div>
      )}

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ParityInputs
            amount={amount}
            setAmount={setAmount}
            pricing={effectivePricing}
            livePrice={livePrice}
            ports={ports}
            port={port}
            setPort={setPort}
            freights={freights}
            freightOrigin={freightOrigin}
            setFreightOrigin={setFreightOrigin}
            freightReducer={freightReducer}
            hasContract={hasContract}
            setHasContract={setHasContract}
            userPrice={userPrice}
            setUserPrice={setUserPrice}
            showInsurance={showInsurance}
            setShowInsurance={setShowInsurance}
            volatility={volatility}
            setVolatility={setVolatility}
            deliveryLocations={deliveryLocationsForInputs}
            selectedDeliveryLocation={selectedDeliveryLocation}
            setSelectedDeliveryLocation={setSelectedDeliveryLocation}
            autoDistanceKm={autoDistanceKm}
            onCalculateDistance={handleCalculateDistance}
            realtimeLoading={realtimeLoading}
            formatCurrency={formatCurrency}
          />
          <ParityResults
            amount={amount}
            parity={parity}
            insurancePremium={insurancePremium}
            pricing={effectivePricing}
            port={port}
            freightReducer={freightReducer}
            commodityNetPrice={commodityNetPrice}
            showInsurance={showInsurance}
            commodityName={commodityOptions.find(c => normalizeCommodityCode(c.value) === normalizeCommodityCode(selectedCommodity))?.label || toCommodityLabel(selectedCommodity)}
            valorizationBonus={valorizationBonus}
            formatCurrency={formatCurrency}
            formatNum={formatNum}
          />
        </div>
      )}
    </div>
  );
}
