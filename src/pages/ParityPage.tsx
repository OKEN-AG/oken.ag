import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
import { useCommodityOptions } from '@/hooks/useCommoditiesMasterData';
import { useOperations, useUpdateOperation, useCreateOperationLog } from '@/hooks/useOperations';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimePricing } from '@/hooks/useRealtimePricing';
import { AlertCircle } from 'lucide-react';
import { calculateCommodityNetPrice, calculateParity, blackScholes } from '@/engines/parity';
import type { CommodityPricing, FreightReducer } from '@/types/barter';
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
  const [selectedCommodity, setSelectedCommodity] = useState<string>('soja');

  const { commodityPricing: commodityPricingAll, freightReducers, rawCommodityPricing, deliveryLocations, rawCampaign, isLoading } = useCampaignData(selectedCampaignId || undefined);
  
  // Select commodity pricing matching selected commodity
  const commodityPricing: CommodityPricing | null = useMemo(() => {
    if (!rawCommodityPricing || rawCommodityPricing.length === 0) return null;
    const match = rawCommodityPricing.find((cp: any) => cp.commodity === selectedCommodity);
    if (match) {
      return {
        commodity: match.commodity as any,
        exchange: match.exchange,
        contract: match.contract,
        exchangePrice: match.exchange_price,
        optionCost: match.option_cost || 0,
        exchangeRateBolsa: match.exchange_rate_bolsa,
        exchangeRateOption: match.exchange_rate_option || match.exchange_rate_bolsa,
        basisByPort: (match.basis_by_port || {}) as Record<string, number>,
        securityDeltaMarket: match.security_delta_market || 2,
        securityDeltaFreight: match.security_delta_freight || 15,
        stopLoss: match.stop_loss || 0,
        bushelsPerTon: match.bushels_per_ton || 36.744,
        pesoSacaKg: match.peso_saca_kg || 60,
        // H3: B&S params from config (risk_free_rate from DB)
        volatility: match.volatility || 25,
        riskFreeRate: (match as any).risk_free_rate || 0.1175,
      } as CommodityPricing;
    }
    return commodityPricingAll;
  }, [rawCommodityPricing, selectedCommodity, commodityPricingAll]);

  // I6: Fetch valorization config for selected commodity
  const { data: valorizationConfig } = useQuery({
    queryKey: ['commodity-valorization', selectedCampaignId, selectedCommodity],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_commodity_valorizations')
        .select('*')
        .eq('campaign_id', selectedCampaignId)
        .eq('commodity', selectedCommodity)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { options: commodityOptions } = useCommodityOptions((rawCampaign?.commodities || []) as string[], ['soja', 'milho', 'cafe', 'algodao']);

  const updateOperation = useUpdateOperation();
  const createLog = useCreateOperationLog();
  const { fetchLivePrice, fetchExchangeRate, calculateDistance, loading: realtimeLoading } = useRealtimePricing();

  const hasCommodityData = !!commodityPricing;
  const pricing: CommodityPricing = commodityPricing || {
    commodity: 'soja', exchange: 'CBOT', contract: 'K', exchangePrice: 0,
    optionCost: 0, exchangeRateBolsa: 0, exchangeRateOption: 0,
    basisByPort: {}, securityDeltaMarket: 0, securityDeltaFreight: 0,
    stopLoss: 0, bushelsPerTon: 36.744, pesoSacaKg: 60,
  };
  const freights: FreightReducer[] = freightReducers;

  const [amount, setAmount] = useState(stateAmount ?? 500000);
  const [grossAmount, setGrossAmount] = useState(stateGross ?? 600000);
  const ports = Object.keys(pricing.basisByPort);
  const [port, setPort] = useState(ports[0] || '');
  const [freightOrigin, setFreightOrigin] = useState(freights[0]?.origin || '');
  const [hasContract, setHasContract] = useState(false);
  const [userPrice, setUserPrice] = useState(0);
  const [showInsurance, setShowInsurance] = useState(false);
  // H3: Volatility from commodity config
  const [volatility, setVolatility] = useState(pricing.volatility || 25);

  // Update volatility when pricing changes
  useEffect(() => {
    if (pricing.volatility) setVolatility(pricing.volatility);
  }, [pricing.volatility]);

  useEffect(() => {
    if (selectedOp) {
      if (selectedOp.net_revenue) setAmount(selectedOp.net_revenue);
      if (selectedOp.gross_revenue) setGrossAmount(selectedOp.gross_revenue);
      if (selectedOp.commodity) setSelectedCommodity(selectedOp.commodity);
    }
  }, [selectedOp]);

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveExchangeRate, setLiveExchangeRate] = useState<number | null>(null);
  const [livePriceTimestamp, setLivePriceTimestamp] = useState<string | null>(null);
  const [autoDistanceKm, setAutoDistanceKm] = useState<number | null>(null);
  const [selectedDeliveryLocation, setSelectedDeliveryLocation] = useState<string>('');

  const effectivePricing: CommodityPricing = useMemo(() => {
    return {
      ...pricing,
      exchangePrice: livePrice ?? pricing.exchangePrice,
      exchangeRateBolsa: liveExchangeRate ?? pricing.exchangeRateBolsa,
    };
  }, [pricing, livePrice, liveExchangeRate]);

  const freightReducer = freights.find(f => f.origin === freightOrigin);

  const effectiveFreightReducer: FreightReducer | undefined = useMemo(() => {
    if (autoDistanceKm !== null) {
      if (freightReducer) {
        const autoTotal = autoDistanceKm * freightReducer.costPerKm + (freightReducer.adjustment || 0);
        return { ...freightReducer, distanceKm: autoDistanceKm, totalReducer: autoTotal };
      }
      const campaignFreightCostPerKm = (rawCampaign as any)?.default_freight_cost_per_km || 0.11;
      return {
        origin: 'Auto',
        destination: port,
        distanceKm: autoDistanceKm,
        costPerKm: campaignFreightCostPerKm,
        adjustment: 0,
        totalReducer: autoDistanceKm * campaignFreightCostPerKm,
      };
    }
    return freightReducer;
  }, [freightReducer, autoDistanceKm, port]);

  const commodityNetPrice = useMemo(() => calculateCommodityNetPrice(effectivePricing, port, effectiveFreightReducer), [port, effectiveFreightReducer, effectivePricing]);

  // I6: Apply valorization bonus to effective price
  const valorizationBonus = useMemo(() => {
    if (!valorizationConfig) return 0;
    if (valorizationConfig.use_percent && valorizationConfig.percent_value) {
      return commodityNetPrice * valorizationConfig.percent_value / 100;
    }
    return valorizationConfig.nominal_value || 0;
  }, [valorizationConfig, commodityNetPrice]);

  const effectiveCommodityPrice = commodityNetPrice + valorizationBonus;

  const parity = useMemo(() => calculateParity(amount, effectiveCommodityPrice, hasContract ? userPrice : undefined, grossAmount), [amount, effectiveCommodityPrice, hasContract, userPrice, grossAmount]);

  // H3: Fix insurance premium - use params from config
  const insurancePremium = useMemo(() => {
    if (!showInsurance) return null;
    const spotPrice = effectivePricing.exchangePrice * effectivePricing.exchangeRateBolsa;
    const strikePercent = effectivePricing.strikePercent || 105; // H3: from config
    const riskFreeRate = effectivePricing.riskFreeRate || 0.1175; // H3: from config  
    const maturityYears = (effectivePricing.optionMaturityDays || 180) / 365; // H3: from config
    const premium = blackScholes(spotPrice, spotPrice * (strikePercent / 100), maturityYears, riskFreeRate, volatility / 100, true);
    const premiumPerSaca = effectiveCommodityPrice > 0 ? premium / effectiveCommodityPrice : 0;
    const additionalSacas = Math.ceil(premiumPerSaca * parity.quantitySacas);
    return { premiumPerSaca: premium, additionalSacas, totalSacas: parity.quantitySacas + additionalSacas };
  }, [showInsurance, volatility, parity, effectiveCommodityPrice, effectivePricing]);

  const rawCommodity = rawCommodityPricing?.find((cp: any) => cp.commodity === selectedCommodity) || rawCommodityPricing?.[0];

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

  // H4: Port coordinates from DB `ports` table
  const { data: portsFromDB } = useQuery({
    queryKey: ['ports', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ports')
        .select('*')
        .or(`is_global.eq.true,campaign_id.eq.${selectedCampaignId}`);
      if (error) throw error;
      return data || [];
    },
  });

  const portCoordinates = useMemo<Record<string, { lat: number; lng: number }>>(() => {
    const coords: Record<string, { lat: number; lng: number }> = {};
    // From ports table
    for (const p of (portsFromDB || [])) {
      // Match port names in basis_by_port
      for (const portName of ports) {
        if (portName.toLowerCase().includes(p.port_name.toLowerCase()) ||
            p.port_name.toLowerCase().includes(portName.split(' ')[0].toLowerCase())) {
          coords[portName] = { lat: Number(p.latitude), lng: Number(p.longitude) };
        }
      }
    }
    // Also try delivery locations as fallback
    for (const loc of deliveryLocations) {
      if (loc.latitude && loc.longitude && loc.warehouse_name) {
        for (const portName of ports) {
          if (!coords[portName] && (
            portName.toLowerCase().includes((loc.city || '').toLowerCase()) ||
            loc.warehouse_name.toLowerCase().includes(portName.split(' ')[0].toLowerCase())
          )) {
            coords[portName] = { lat: loc.latitude, lng: loc.longitude };
          }
        }
      }
    }
    return coords;
  }, [portsFromDB, deliveryLocations, ports]);

  // G2: Validate delivery locations lat/lng within Brazil bounds
  const isValidBrazilCoord = (lat: number, lng: number) =>
    lat >= -35 && lat <= 6 && lng >= -74 && lng <= -34;

  const locationsWithoutCoords = useMemo(() => {
    return deliveryLocations.filter(l =>
      !l.latitude || !l.longitude || l.latitude === 0 || l.longitude === 0 ||
      !isValidBrazilCoord(l.latitude, l.longitude)
    );
  }, [deliveryLocations]);

  const handleCalculateDistance = useCallback(async () => {
    if (!selectedDeliveryLocation) {
      toast.error('Selecione um local de entrega');
      return;
    }
    const loc = deliveryLocations.find(l => l.id === selectedDeliveryLocation);
    if (!loc || !loc.latitude || !loc.longitude || loc.latitude === 0 || loc.longitude === 0) {
      toast.error('Local de entrega sem coordenadas cadastradas. Atualize lat/lng na configuração da campanha.');
      return;
    }
    const portCoord = portCoordinates[port];
    if (!portCoord) {
      toast.error(`Porto "${port}" sem coordenadas configuradas`);
      return;
    }
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
        details: {
          sacas: parity.quantitySacas, preco: parity.commodityPricePerUnit,
          port, livePrice, liveExchangeRate,
          valorizationBonus,
          volatility,
          bsParams: { strikePercent: effectivePricing.strikePercent, riskFreeRate: effectivePricing.riskFreeRate },
        },
      });
      toast.success('Paridade salva na operação!');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

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
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Warnings */}
      {!hasCommodityData && !isLoading && (
        <div className="glass-card p-4 border border-warning/50 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <div>
            <div className="text-sm font-semibold text-warning">Precificação de commodity não configurada</div>
            <div className="text-xs text-muted-foreground">Configure os dados de precificação na aba Commodities da campanha.</div>
          </div>
        </div>
      )}

      {/* G2: Warning for locations without coordinates */}
      {locationsWithoutCoords.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {locationsWithoutCoords.length} local(is) de entrega sem coordenadas (lat/lng): {locationsWithoutCoords.map(l => l.warehouse_name).join(', ')}
        </div>
      )}

      {/* I6: Valorization indicator */}
      {valorizationConfig && valorizationBonus > 0 && (
        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 flex items-center gap-4 border border-success/30">
          <TrendingUp className="w-5 h-5 text-success" />
          <div className="text-sm">
            <span className="text-muted-foreground">Valorização {selectedCommodity}:</span>{' '}
            <span className="font-mono font-bold text-success">
              +{formatCurrency(valorizationBonus)}/saca
              {valorizationConfig.use_percent ? ` (${valorizationConfig.percent_value}%)` : ''}
            </span>
          </div>
        </motion.div>
      )}

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
            commodityNetPrice={effectiveCommodityPrice}
            showInsurance={showInsurance}
            commodityName={commodityOptions.find(c => c.value === selectedCommodity)?.label || (selectedCommodity.charAt(0).toUpperCase() + selectedCommodity.slice(1))}
            valorizationBonus={valorizationBonus}
            formatCurrency={formatCurrency}
            formatNum={formatNum}
          />
        </div>
      )}
    </div>
  );
}
