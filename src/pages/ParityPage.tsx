import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
import { useOperations, useUpdateOperation, useCreateOperationLog } from '@/hooks/useOperations';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimePricing } from '@/hooks/useRealtimePricing';
import { mockCommodityPricing, mockFreightReducers } from '@/data/mock-data';
import { calculateCommodityNetPrice, calculateParity, blackScholes } from '@/engines/parity';
import type { CommodityPricing, FreightReducer } from '@/types/barter';
import { Wheat, ArrowRight, TrendingUp, DollarSign, Truck, Shield, Save, Loader2, RefreshCw, MapPin, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

import ParityInputs from '@/components/parity/ParityInputs';
import ParityResults from '@/components/parity/ParityResults';

export default function ParityPage() {
  const location = useLocation();
  const { user } = useAuth();

  // State from navigation
  const stateAmount = (location.state as any)?.amount;
  const stateGross = (location.state as any)?.grossAmount;
  const stateCampaignId = (location.state as any)?.campaignId;
  const stateOperationId = (location.state as any)?.operationId;

  // Bug #4 & #16: Add campaign and operation selectors for direct access
  const { data: activeCampaigns } = useActiveCampaigns();
  const { data: operations } = useOperations();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(stateCampaignId || '');
  const [selectedOperationId, setSelectedOperationId] = useState<string>(stateOperationId || '');

  // Auto-select campaign from state or first available
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

  // When operation is selected, load its amounts
  const selectedOp = operations?.find(op => op.id === selectedOperationId);

  const { commodityPricing, freightReducers, rawCommodityPricing, deliveryLocations, isLoading } = useCampaignData(selectedCampaignId || undefined);
  const updateOperation = useUpdateOperation();
  const createLog = useCreateOperationLog();
  const { fetchLivePrice, fetchExchangeRate, calculateDistance, loading: realtimeLoading } = useRealtimePricing();

  const pricing: CommodityPricing = commodityPricing || mockCommodityPricing;
  const freights: FreightReducer[] = freightReducers.length > 0 ? freightReducers : mockFreightReducers;

  const [amount, setAmount] = useState(stateAmount ?? 500000);
  const [grossAmount, setGrossAmount] = useState(stateGross ?? 600000);
  const ports = Object.keys(pricing.basisByPort);
  const [port, setPort] = useState(ports[0] || 'Paranaguá (PR)');
  const [freightOrigin, setFreightOrigin] = useState(freights[0]?.origin || '');
  const [hasContract, setHasContract] = useState(false);
  const [userPrice, setUserPrice] = useState(0);
  const [showInsurance, setShowInsurance] = useState(false);
  const [volatility, setVolatility] = useState(25);

  // Update amount when operation changes
  useEffect(() => {
    if (selectedOp) {
      if (selectedOp.net_revenue) setAmount(selectedOp.net_revenue);
      if (selectedOp.gross_revenue) setGrossAmount(selectedOp.gross_revenue);
    }
  }, [selectedOp]);

  // Live price state
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveExchangeRate, setLiveExchangeRate] = useState<number | null>(null);
  const [livePriceTimestamp, setLivePriceTimestamp] = useState<string | null>(null);
  const [autoDistanceKm, setAutoDistanceKm] = useState<number | null>(null);
  const [selectedDeliveryLocation, setSelectedDeliveryLocation] = useState<string>('');

  // Build effective pricing with live data overlay
  const effectivePricing: CommodityPricing = useMemo(() => {
    return {
      ...pricing,
      exchangePrice: livePrice ?? pricing.exchangePrice,
      exchangeRateBolsa: liveExchangeRate ?? pricing.exchangeRateBolsa,
    };
  }, [pricing, livePrice, liveExchangeRate]);

  const freightReducer = freights.find(f => f.origin === freightOrigin);

  // Bug #6: Synthetic freight reducer when autoDistanceKm exists but no manual reducer
  const effectiveFreightReducer: FreightReducer | undefined = useMemo(() => {
    if (autoDistanceKm !== null) {
      if (freightReducer) {
        const autoTotal = autoDistanceKm * freightReducer.costPerKm + (freightReducer.adjustment || 0);
        return { ...freightReducer, distanceKm: autoDistanceKm, totalReducer: autoTotal };
      }
      // Synthetic reducer with default cost
      const defaultCostPerKm = 0.11;
      return {
        origin: 'Auto',
        destination: port,
        distanceKm: autoDistanceKm,
        costPerKm: defaultCostPerKm,
        adjustment: 0,
        totalReducer: autoDistanceKm * defaultCostPerKm,
      };
    }
    return freightReducer;
  }, [freightReducer, autoDistanceKm, port]);

  const commodityNetPrice = useMemo(() => calculateCommodityNetPrice(effectivePricing, port, effectiveFreightReducer), [port, effectiveFreightReducer, effectivePricing]);
  const parity = useMemo(() => calculateParity(amount, commodityNetPrice, hasContract ? userPrice : undefined, grossAmount), [amount, commodityNetPrice, hasContract, userPrice, grossAmount]);

  // Bug #13: Fix insurance premium calculation
  const insurancePremium = useMemo(() => {
    if (!showInsurance) return null;
    const spotPrice = effectivePricing.exchangePrice * effectivePricing.exchangeRateBolsa;
    const premium = blackScholes(spotPrice, spotPrice * 1.05, 0.5, 0.06, volatility / 100, true);
    // Premium is in BRL per unit. Divide by saca price to get sacas-equivalent per saca
    const premiumPerSaca = commodityNetPrice > 0 ? premium / commodityNetPrice : 0;
    const additionalSacas = Math.ceil(premiumPerSaca * parity.quantitySacas);
    return { premiumPerSaca: premium, additionalSacas, totalSacas: parity.quantitySacas + additionalSacas };
  }, [showInsurance, volatility, parity, commodityNetPrice, effectivePricing]);

  const rawCommodity = rawCommodityPricing?.[0];

  const handleFetchLivePrice = useCallback(async () => {
    try {
      const ticker = rawCommodity?.ticker || 'ZS=F';
      const currencyUnit = rawCommodity?.currency_unit || 'USc';

      const [priceResult, exchangeResult] = await Promise.all([
        fetchLivePrice(ticker, currencyUnit),
        fetchExchangeRate(),
      ]);

      const priceUsdBu = priceResult.price_usd;
      setLivePrice(priceUsdBu);
      setLiveExchangeRate(exchangeResult.rate);
      setLivePriceTimestamp(priceResult.timestamp);

      toast.success(`Preço atualizado: US$ ${priceUsdBu.toFixed(4)}/bu | Câmbio: R$ ${exchangeResult.rate.toFixed(4)}`);
    } catch (e: any) {
      toast.error('Erro ao buscar preço: ' + e.message);
    }
  }, [rawCommodity, fetchLivePrice, fetchExchangeRate]);

  const portCoordinates: Record<string, { lat: number; lng: number }> = {
    'Paranaguá (PR)': { lat: -25.5163, lng: -48.5164 },
    'Santarem (PA)': { lat: -2.4388, lng: -54.7089 },
    'Itaqui (MA)': { lat: -2.5614, lng: -44.3683 },
    'Ilhéus (BA)': { lat: -14.7936, lng: -39.0463 },
    'Santos (SP)': { lat: -23.9535, lng: -46.3338 },
    'Rio Grande (RS)': { lat: -32.0349, lng: -52.0986 },
  };

  const handleCalculateDistance = useCallback(async () => {
    if (!selectedDeliveryLocation) {
      toast.error('Selecione um local de entrega');
      return;
    }
    const loc = deliveryLocations.find(l => l.id === selectedDeliveryLocation);
    if (!loc || !loc.latitude || !loc.longitude) {
      toast.error('Local de entrega sem coordenadas cadastradas');
      return;
    }
    const portCoord = portCoordinates[port];
    if (!portCoord) {
      toast.error('Porto sem coordenadas configuradas');
      return;
    }
    try {
      const result = await calculateDistance(loc.latitude, loc.longitude, portCoord.lat, portCoord.lng);
      setAutoDistanceKm(result.distancia_km);
      toast.success(`Distância calculada: ${result.distancia_km.toFixed(0)} km (${result.metodo})`);
    } catch (e: any) {
      toast.error('Erro ao calcular distância: ' + e.message);
    }
  }, [selectedDeliveryLocation, deliveryLocations, port, calculateDistance]);

  const handleSaveParity = async () => {
    if (!selectedOperationId || !user) return;
    try {
      await updateOperation.mutateAsync({
        id: selectedOperationId,
        total_sacas: insurancePremium?.totalSacas ?? parity.quantitySacas,
        commodity_price: parity.commodityPricePerUnit,
        reference_price: parity.referencePrice,
        has_existing_contract: hasContract,
        insurance_premium_sacas: insurancePremium?.additionalSacas ?? 0,
        payment_method: 'barter' as const,
        status: 'pedido' as const,
      });
      await createLog.mutateAsync({
        operation_id: selectedOperationId,
        user_id: user.id,
        action: 'paridade_calculada',
        details: { sacas: parity.quantitySacas, preco: parity.commodityPricePerUnit, port, livePrice, liveExchangeRate },
      });
      toast.success('Paridade salva na operação!');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  // Filter operations for this campaign
  const campaignOperations = operations?.filter(op => !selectedCampaignId || op.campaign_id === selectedCampaignId) || [];

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

      {/* Bug #4 & #16: Campaign & Operation selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>

      {/* Live data banner */}
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
            freightReducer={effectiveFreightReducer}
            hasContract={hasContract}
            setHasContract={setHasContract}
            userPrice={userPrice}
            setUserPrice={setUserPrice}
            showInsurance={showInsurance}
            setShowInsurance={setShowInsurance}
            volatility={volatility}
            setVolatility={setVolatility}
            deliveryLocations={deliveryLocations}
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
            freightReducer={effectiveFreightReducer}
            commodityNetPrice={commodityNetPrice}
            showInsurance={showInsurance}
            formatCurrency={formatCurrency}
            formatNum={formatNum}
          />
        </div>
      )}
    </div>
  );
}
