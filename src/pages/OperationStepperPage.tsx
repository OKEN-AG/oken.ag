import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
import { useOperation, useOperationItems, useOperationDocuments, useCreateOperation, useCreateOperationItems, useCreateOperationLog, useUpdateOperation } from '@/hooks/useOperations';
import { calculateAgronomicSelection } from '@/engines/agronomic';
import { applyComboCascadeWithLedger, getSuggestedDoseForRef, getMaxPossibleDiscount, getActivatedDiscount, getComplementaryDiscount } from '@/engines/combo-cascade';
import { decomposePricing, calculateGrossToNet, generatePriceAuditTrail, normalizePrice } from '@/engines/pricing';
import { checkEligibility } from '@/engines/eligibility';
import { buildSnapshot } from '@/engines/snapshot';
import { calculateCommodityNetPrice, calculateParity, calculateIVP, blackScholes } from '@/engines/parity';
import { buildWagonStages, canAdvance, getBlockingReason, calculateGuaranteeCoverage } from '@/engines/orchestrator';
import type { AgronomicSelection, ChannelSegment, Product, JourneyModule, DocumentType, CommodityPricing, FreightReducer, ContractPriceType, GuaranteeCoverage } from '@/types/barter';
import { getAllMunicipios } from '@/data/municipios';
import type { PriceAuditStep } from '@/engines/pricing';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import TrainTrack from '@/components/TrainTrack';
import {
  ChevronLeft, ChevronRight, Check, AlertCircle, MapPin, ShoppingCart,
  TrendingUp, Wheat, FileText, Save, Loader2, Plus, Minus, X, FileSearch,
  Train, ArrowRight, PenLine, ShieldCheck, Lock, CheckCircle, AlertTriangle, Clock,
  Zap, Lightbulb
} from 'lucide-react';

// ─── Step definitions ───
const STEPS = [
  { id: 'context', label: 'Contexto', icon: MapPin },
  { id: 'order', label: 'Pedido', icon: ShoppingCart },
  { id: 'simulation', label: 'Simulação', icon: TrendingUp },
  { id: 'payment', label: 'Pagamento', icon: Wheat, module: 'pagamento' as JourneyModule },
  { id: 'barter', label: 'Barter', icon: Wheat, module: 'barter' as JourneyModule },
  { id: 'formalization', label: 'Formalização', icon: FileText, module: 'formalizacao' as JourneyModule },
  { id: 'summary', label: 'Resumo', icon: Check },
];

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  validado: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: 'Validado' },
  assinado: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', label: 'Assinado' },
  emitido: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Emitido' },
  pendente: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Pendente' },
};

const allDocTypes: { type: DocumentType; label: string; category?: 'poe' | 'pol' | 'pod' }[] = [
  { type: 'termo_adesao', label: 'Termo de Adesão' },
  { type: 'pedido', label: 'Pedido de Compra' },
  { type: 'termo_barter', label: 'Termo de Barter' },
  { type: 'ccv', label: 'CCV', category: 'pol' },
  { type: 'cessao_credito', label: 'Cessão de Crédito', category: 'pol' },
  { type: 'cpr', label: 'CPR', category: 'poe' },
  { type: 'duplicata', label: 'Duplicata' },
  { type: 'certificado_aceite', label: 'Certificado de Aceite', category: 'pod' },
];

// ─── Combo recommendation logic ───
function getComboRecommendations(
  combos: any[],
  selections: AgronomicSelection[],
  products: Product[],
  area: number
): { productName: string; ref: string; action: string; productId?: string; suggestedDose?: number; suggestedQty?: number }[] {
  const recs: { productName: string; ref: string; action: string; productId?: string; suggestedDose?: number; suggestedQty?: number }[] = [];
  const selectedRefs = new Set(selections.map(s => (s.ref || '').toUpperCase().trim()));

  for (const combo of combos) {
    const missing = combo.products.filter((cp: any) => !selectedRefs.has((cp.ref || '').toUpperCase().trim()));
    if (missing.length > 0 && missing.length <= 2) {
      for (const mp of missing) {
        const prod = products.find(p => (p.ref || '').toUpperCase() === (mp.ref || '').toUpperCase());
        if (prod) {
          const suggestedDose = (mp.minDosePerHa + mp.maxDosePerHa) / 2;
          const suggestedQty = Math.ceil(area * suggestedDose);
          recs.push({
            productName: prod.name, ref: mp.ref, productId: prod.id,
            suggestedDose, suggestedQty,
            action: `Incluir ${prod.name} (${suggestedDose.toFixed(2)}/${prod.unitType}/ha ≈ ${suggestedQty} ${prod.unitType}) → combo "${combo.name}" (+${combo.discountPercent}%)`
          });
        }
      }
    }
    for (const cp of combo.products) {
      const sel = selections.find(s => (s.ref || '').toUpperCase().trim() === (cp.ref || '').toUpperCase().trim());
      if (sel && sel.dosePerHectare < cp.minDosePerHa) {
        const suggestedQty = Math.ceil(area * cp.minDosePerHa);
        recs.push({
          productName: sel.product.name, ref: cp.ref, productId: sel.productId,
          suggestedDose: cp.minDosePerHa, suggestedQty,
          action: `Subir dose de ${sel.product.name} para ${cp.minDosePerHa}/ha (≈ ${suggestedQty} ${sel.product.unitType}) → combo "${combo.name}"`
        });
      }
    }
  }
  const seen = new Set<string>();
  return recs.filter(r => { if (seen.has(r.ref)) return false; seen.add(r.ref); return true; }).slice(0, 5);
}

// ─── Due date precedence: municipio > mesorregiao > estado > default ───
function getDueDatesWithPrecedence(
  dueDates: any[],
  clientCity?: string,
  clientMesoregion?: string,
  clientState?: string
): any[] {
  if (!dueDates?.length) return [];
  // Try city first
  const byCity = dueDates.filter(d => d.region_type === 'municipio' && d.region_value?.toLowerCase() === clientCity?.toLowerCase());
  if (byCity.length > 0) return byCity;
  // Try mesoregion
  const byMeso = dueDates.filter(d => d.region_type === 'mesorregiao' && d.region_value?.toLowerCase() === clientMesoregion?.toLowerCase());
  if (byMeso.length > 0) return byMeso;
  // Try state
  const byState = dueDates.filter(d => d.region_type === 'estado' && d.region_value?.toUpperCase() === clientState?.toUpperCase());
  if (byState.length > 0) return byState;
  // Default: all
  return dueDates;
}

export default function OperationStepperPage() {
  const { id: operationId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isNewOperation = !operationId || operationId === 'novo';
  const initialCampaignId = searchParams.get('campaignId') || '';

  // ─── Data fetching ───
  const { data: activeCampaigns, isLoading: loadingCampaigns } = useActiveCampaigns();
  const { data: existingOp } = useOperation(isNewOperation ? undefined : operationId);
  const { data: existingItems } = useOperationItems(isNewOperation ? undefined : operationId);
  const { data: existingDocs, refetch: refetchDocs } = useOperationDocuments(isNewOperation ? undefined : operationId);

  // ─── Step state ───
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaignId);
  const { campaign, rawCampaign, products, combos, commodityPricing, rawCommodityPricing, freightReducers, deliveryLocations, buyers, valorizations, dueDates, isLoading: loadingData } = useCampaignData(selectedCampaignId || undefined);

  // ─── Context step state ───
  const [clientName, setClientName] = useState('');
  const [clientDocument, setClientDocument] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientState, setClientState] = useState('');
  const [clientType, setClientType] = useState<'PF' | 'PJ'>('PJ');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientIE, setClientIE] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [segment, setSegment] = useState<string>('');
  const [channelEnum, setChannelEnum] = useState<ChannelSegment>('distribuidor');
  const [area, setArea] = useState(500);
  const [quantityMode, setQuantityMode] = useState<'dose' | 'livre'>('dose'); // dose/ha or free quantity
  const [freeQuantities, setFreeQuantities] = useState<Map<string, number>>(new Map());

  // ─── Order step state ───
  const [selectedProducts, setSelectedProducts] = useState<Map<string, number>>(new Map());

  // ─── Payment step state ───
  const [dueMonths, setDueMonths] = useState(12);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [selectedCommodity, setSelectedCommodity] = useState('soja');

  // ─── Barter step state ───
  const [port, setPort] = useState('');
  const [freightOrigin, setFreightOrigin] = useState('');
  const [hasContract, setHasContract] = useState(false);
  const [userPrice, setUserPrice] = useState(0);
  const [showInsurance, setShowInsurance] = useState(false);
  const [volatility, setVolatility] = useState(25);
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [counterpartyOther, setCounterpartyOther] = useState('');
  const [contractPriceType, setContractPriceType] = useState<ContractPriceType>('fixo');
  const [performanceIndex, setPerformanceIndex] = useState(100); // 0-100 scale for UI

  // ─── Mutations ───
  const createOperation = useCreateOperation();
  const createItems = useCreateOperationItems();
  const createLog = useCreateOperationLog();
  const updateOperation = useUpdateOperation();

  // ─── Load existing operation data ───
  useEffect(() => {
    if (existingOp) {
      setSelectedCampaignId(existingOp.campaign_id);
      setClientName(existingOp.client_name || '');
      setClientDocument(existingOp.client_document || '');
      setClientCity(existingOp.city || '');
      setClientState(existingOp.state || '');
      setSegment(existingOp.channel || '');
      setChannelEnum((existingOp.channel || 'distribuidor') as ChannelSegment);
      setArea(existingOp.area_hectares || 500);
      if (existingOp.commodity) setSelectedCommodity(existingOp.commodity);
      if (existingOp.due_months) setDueMonths(existingOp.due_months);
    }
  }, [existingOp]);

  useEffect(() => {
    if (existingItems && existingItems.length > 0 && products.length > 0) {
      const map = new Map<string, number>();
      for (const item of existingItems) {
        map.set(item.product_id, item.dose_per_hectare);
      }
      setSelectedProducts(map);
    }
  }, [existingItems, products]);

  // Auto-select first campaign
  useEffect(() => {
    if (!selectedCampaignId && activeCampaigns?.length) {
      setSelectedCampaignId(activeCampaigns[0].id);
    }
  }, [activeCampaigns, selectedCampaignId]);

  // ─── Campaign sub-data ───
  const { data: campaignSegments } = useQuery({
    queryKey: ['campaign-segments-sim', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data } = await supabase.from('campaign_segments').select('*').eq('campaign_id', selectedCampaignId);
      return data || [];
    },
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['campaign-payment-methods-sim', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data } = await supabase.from('campaign_payment_methods').select('*').eq('campaign_id', selectedCampaignId).eq('active', true);
      return data || [];
    },
  });

  const { data: clientWhitelist } = useQuery({
    queryKey: ['campaign-clients-wl', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data } = await supabase.from('campaign_clients').select('document').eq('campaign_id', selectedCampaignId);
      return (data || []).map(c => c.document);
    },
  });

  // ─── Derived data ───
  const segmentAdjustmentPercent = useMemo(() => {
    const match = campaignSegments?.find(s => s.active && s.segment_name.toLowerCase() === segment.toLowerCase());
    return match?.price_adjustment_percent || 0;
  }, [campaignSegments, segment]);

  const selectedPM = useMemo(() => {
    if (!paymentMethods?.length) return null;
    if (selectedPaymentMethod) return paymentMethods.find(pm => pm.id === selectedPaymentMethod) || null;
    return paymentMethods[0] || null;
  }, [paymentMethods, selectedPaymentMethod]);

  // ─── Active modules → visible steps ───
  const activeModules: JourneyModule[] = rawCampaign?.active_modules as JourneyModule[] || [];
  const isBarter = selectedPM?.method_name?.toLowerCase().includes('barter') || false;
  const visibleSteps = STEPS.filter(s => {
    if (s.module === 'barter' as JourneyModule) return isBarter;
    if (!s.module) return true;
    if (activeModules.length === 0) return true;
    return activeModules.includes(s.module);
  });
  const paymentMethodMarkup = selectedPM?.markup_percent || 0;

  // Due dates with precedence
  const filteredDueDates = useMemo(() => getDueDatesWithPrecedence(dueDates || [], clientCity, undefined, clientState), [dueDates, clientCity, clientState]);

  const dueDateOptions = useMemo(() => {
    // 1. Try campaign_due_dates with region precedence
    const dates = filteredDueDates.length ? filteredDueDates : (dueDates || []);
    if (dates.length) {
      const uniqueDates = [...new Set(dates.map((d: any) => d.due_date))].sort();
      return uniqueDates.map(d => {
        const date = new Date(d + 'T00:00:00');
        const diffDays = Math.max(Math.round((date.getTime() - Date.now()) / 86400000), 1);
        return { value: String(parseFloat((diffDays / 30).toFixed(4))), label: `${date.toLocaleDateString('pt-BR')} (${diffDays}d)`, date: d };
      });
    }
    // 2. Try available_due_dates array from campaign
    const availDates = rawCampaign?.available_due_dates as string[] | null;
    if (availDates?.length) {
      return availDates.sort().map(d => {
        const date = new Date(d + 'T00:00:00');
        const diffDays = Math.max(Math.round((date.getTime() - Date.now()) / 86400000), 1);
        return { value: String(parseFloat((diffDays / 30).toFixed(4))), label: `${date.toLocaleDateString('pt-BR')} (${diffDays}d)`, date: d };
      });
    }
    // 3. Fallback: standard month intervals
    return [6, 9, 12, 15, 18].map(m => ({ value: String(m), label: `${m} meses`, date: '' }));
  }, [filteredDueDates, dueDates, rawCampaign]);

  const segmentOptions = useMemo(() => {
    if (campaignSegments?.length) return campaignSegments.filter(s => s.active).map(s => ({ value: s.segment_name, label: s.segment_name }));
    if (campaign?.margins?.length) return campaign.margins.map(m => ({ value: m.segment, label: m.segment }));
    return [{ value: 'direto', label: 'Direto' }, { value: 'distribuidor', label: 'Distribuidor' }, { value: 'cooperativa', label: 'Cooperativa' }];
  }, [campaignSegments, campaign]);

  // Derive the DB channel_segment enum from campaign target
  const deriveChannelEnum = (target?: string): ChannelSegment => {
    if (!target) return 'distribuidor';
    if (target.includes('diret')) return 'direto';
    if (target.includes('distribuidor') || target.includes('canal')) return 'distribuidor';
    return 'distribuidor';
  };

  useEffect(() => {
    if (rawCampaign?.target && !operationId) {
      setChannelEnum(deriveChannelEnum(rawCampaign.target));
    }
  }, [rawCampaign?.target, operationId]);

  // ─── Eligible states & cities from campaign ───
  const allMunicipios = useMemo(() => getAllMunicipios(), []);
  const eligibleCitySet = useMemo(() => new Set(rawCampaign?.eligible_cities || []), [rawCampaign]);
  const hasEligibilityFilter = eligibleCitySet.size > 0;

  const eligibleStates = useMemo(() => {
    const source = hasEligibilityFilter
      ? allMunicipios.filter(m => eligibleCitySet.has(m.ibge))
      : allMunicipios;
    const states = new Set<string>();
    source.forEach(m => states.add(m.uf));
    return [...states].sort();
  }, [allMunicipios, eligibleCitySet, hasEligibilityFilter]);

  const eligibleCitiesForState = useMemo(() => {
    if (!clientState) return [] as typeof allMunicipios;
    return allMunicipios
      .filter(m => m.uf === clientState && (!hasEligibilityFilter || eligibleCitySet.has(m.ibge)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allMunicipios, eligibleCitySet, clientState, hasEligibilityFilter]);

  // ─── Eligibility (with PF/PJ) ───
  const eligibility = useMemo(() => {
    if (!campaign) return null;
    return checkEligibility(campaign, {
      state: clientState || undefined,
      city: clientCity || undefined,
      segment: segment as ChannelSegment || channelEnum,
      clientDocument: clientDocument || undefined,
      clientType,
      campaignClientTypes: (rawCampaign as any)?.client_type || [],
      whitelist: clientWhitelist || [],
      blockIneligible: !!(rawCampaign as any)?.block_ineligible,
    });
  }, [campaign, clientState, clientCity, segment, clientDocument, clientType, clientWhitelist, rawCampaign]);

  // ─── Product selection ───
  const toggleProduct = (productId: string, suggestedDose?: number) => {
    const next = new Map(selectedProducts);
    if (next.has(productId)) {
      next.delete(productId);
      const nextFree = new Map(freeQuantities);
      nextFree.delete(productId);
      setFreeQuantities(nextFree);
    } else {
      const prod = products.find(p => p.id === productId)!;
      const dose = suggestedDose ?? getSuggestedDoseForRef(combos, prod.ref || '') ?? prod.dosePerHectare;
      next.set(productId, dose);
    }
    setSelectedProducts(next);
  };

  const clearOrder = () => {
    setSelectedProducts(new Map());
    setFreeQuantities(new Map());
  };

  const updateDose = (productId: string, dose: number) => {
    const next = new Map(selectedProducts);
    next.set(productId, dose);
    setSelectedProducts(next);
  };

  const updateFreeQuantity = (productId: string, qty: number) => {
    const next = new Map(freeQuantities);
    next.set(productId, qty);
    setFreeQuantities(next);
  };

  // ─── Engine calculations ───
  const selections = useMemo<AgronomicSelection[]>(() => {
    return Array.from(selectedProducts.entries()).map(([id, dose]) => {
      const product = products.find(p => p.id === id);
      if (!product) return null;
      if (quantityMode === 'livre') {
        const freeQty = freeQuantities.get(id) || 0;
        if (freeQty <= 0) return null;
        // Build selection from free quantity directly
        return calculateAgronomicSelection(product, area, dose, freeQty);
      }
      return calculateAgronomicSelection(product, area, dose);
    }).filter(Boolean) as AgronomicSelection[];
  }, [selectedProducts, area, products, quantityMode, freeQuantities]);

  const comboCascade = useMemo(() => applyComboCascadeWithLedger(combos, selections), [combos, selections]);
  const comboActivations = comboCascade.activations;
  const maxDiscount = getMaxPossibleDiscount(combos);
  const activatedDiscount = getActivatedDiscount(comboActivations);
  const complementaryDiscount = getComplementaryDiscount(comboActivations);
  const discountProgress = maxDiscount > 0 ? (activatedDiscount / maxDiscount) * 100 : 0;

  // Combo recommendations
  const comboRecommendations = useMemo(() => getComboRecommendations(combos, selections, products, area), [combos, selections, products, area]);

  const pricingResults = useMemo(() => {
    if (!campaign) return [];
    return selections.map(sel => decomposePricing(sel.product, campaign, (segment || channelEnum) as ChannelSegment, dueMonths, sel.roundedQuantity, { paymentMethodMarkup, segmentAdjustmentPercent }));
  }, [selections, segment, dueMonths, campaign, paymentMethodMarkup, segmentAdjustmentPercent]);

  const grossToNet = useMemo(() => calculateGrossToNet(pricingResults, comboActivations, 0, {
    globalIncentiveType: rawCampaign?.global_incentive_type || '',
    globalIncentive1: rawCampaign?.global_incentive_1 || 0,
    globalIncentive2: rawCampaign?.global_incentive_2 || 0,
    globalIncentive3: rawCampaign?.global_incentive_3 || 0,
  }, selections), [pricingResults, comboActivations, rawCampaign, selections]);

  // ─── Parity (with valorization + buyer fee) ───
  const selectedBuyer = useMemo(() => buyers?.find((b: any) => b.id === selectedBuyerId), [buyers, selectedBuyerId]);
  const buyerFee = selectedBuyer?.fee || 0;

  const selectedValorization = useMemo(() => {
    return valorizations?.find((v: any) => v.commodity?.toLowerCase() === selectedCommodity?.toLowerCase());
  }, [valorizations, selectedCommodity]);

  const selectedCommodityPricing: CommodityPricing | null = useMemo(() => {
    if (!rawCommodityPricing?.length) return commodityPricing;
    const match = rawCommodityPricing.find((cp: any) => cp.commodity === selectedCommodity);
    if (!match) return commodityPricing;
    return {
      commodity: match.commodity as any, exchange: match.exchange, contract: match.contract,
      exchangePrice: match.exchange_price, optionCost: match.option_cost || 0,
      exchangeRateBolsa: match.exchange_rate_bolsa, exchangeRateOption: match.exchange_rate_option || match.exchange_rate_bolsa,
      basisByPort: (match.basis_by_port || {}) as Record<string, number>,
      securityDeltaMarket: match.security_delta_market || 2, securityDeltaFreight: match.security_delta_freight || 15,
      stopLoss: match.stop_loss || 0, bushelsPerTon: match.bushels_per_ton || 36.744, pesoSacaKg: match.peso_saca_kg || 60,
      volatility: match.volatility || 25, riskFreeRate: (match as any).risk_free_rate || 0.1175,
    } as CommodityPricing;
  }, [rawCommodityPricing, selectedCommodity, commodityPricing]);

  const pricing = selectedCommodityPricing || { commodity: 'soja', exchange: 'CBOT', contract: 'K', exchangePrice: 0, optionCost: 0, exchangeRateBolsa: 0, exchangeRateOption: 0, basisByPort: {}, securityDeltaMarket: 0, securityDeltaFreight: 0, stopLoss: 0, bushelsPerTon: 36.744, pesoSacaKg: 60 } as CommodityPricing;
  const ports = Object.keys(pricing.basisByPort);

  useEffect(() => { if (ports.length && !port) setPort(ports[0]); }, [ports, port]);
  useEffect(() => { if (freightReducers.length && !freightOrigin) setFreightOrigin(freightReducers[0]?.origin || ''); }, [freightReducers, freightOrigin]);
  useEffect(() => { if (pricing.volatility) setVolatility(pricing.volatility); }, [pricing.volatility]);

  // Freight with fallback
  const freightReducer = useMemo(() => {
    const direct = freightReducers.find(f => f.origin === freightOrigin);
    if (direct) return direct;
    // Fallback: use default_freight_cost_per_km from campaign
    const defaultCost = (rawCampaign as any)?.default_freight_cost_per_km;
    if (defaultCost && defaultCost > 0 && freightOrigin) {
      // Estimate: no specific route, use a nominal distance-based cost (0 distance = 0 cost)
      return { origin: freightOrigin, destination: port || '', distanceKm: 0, costPerKm: defaultCost, adjustment: 0, totalReducer: 0 } as FreightReducer;
    }
    return undefined;
  }, [freightReducers, freightOrigin, rawCampaign, port]);

  const commodityNetPrice = useMemo(() => calculateCommodityNetPrice(pricing, port, freightReducer, {
    valorizationNominal: selectedValorization?.nominal_value || 0,
    valorizationPercent: selectedValorization?.percent_value || 0,
    useValorizationPercent: selectedValorization?.use_percent || false,
    buyerFeePercent: buyerFee,
  }), [pricing, port, freightReducer, selectedValorization, buyerFee]);

  const ivp = useMemo(() => calculateIVP(contractPriceType, pricing.volatility), [contractPriceType, pricing.volatility]);

  const parity = useMemo(() => calculateParity(grossToNet.netRevenue, commodityNetPrice, hasContract ? userPrice : undefined, grossToNet.grossRevenue, ivp), [grossToNet, commodityNetPrice, hasContract, userPrice, ivp]);

  // Insurance with commodity config params
  const insurancePremium = useMemo(() => {
    if (!showInsurance) return null;
    const spotPrice = pricing.exchangePrice * pricing.exchangeRateBolsa;
    if (spotPrice <= 0) return null;
    const vol = (pricing.volatility || volatility) / 100;
    const rfr = pricing.riskFreeRate || 0.1175;
    const strikePercent = (pricing as any).strikePercent || 105;
    const strike = spotPrice * (strikePercent / 100);
    const maturityDays = (pricing as any).optionMaturityDays || 180;
    const timeYears = maturityDays / 365;
    const premium = blackScholes(spotPrice, strike, timeYears, rfr, vol, true);
    const premiumPerSaca = commodityNetPrice > 0 ? premium / commodityNetPrice : 0;
    const additionalSacas = Math.ceil(premiumPerSaca * parity.quantitySacas);
    return { premiumPerSaca: premium, additionalSacas, totalSacas: parity.quantitySacas + additionalSacas, volatility: vol * 100 };
  }, [showInsurance, volatility, parity, commodityNetPrice, pricing]);

  // ─── Formalization ───
  const wagonStages = useMemo(() => {
    if (!existingOp || !existingDocs) return [];
    const docList = (existingDocs || []).map(d => ({ doc_type: d.doc_type, status: d.status }));
    return buildWagonStages(activeModules.length ? activeModules : ['adesao', 'simulacao', 'formalizacao', 'documentos', 'garantias'], existingOp.status as any, docList);
  }, [existingOp, existingDocs, activeModules]);

  const nextStatus = useMemo(() => {
    if (!existingOp || !existingDocs) return null;
    const docList = (existingDocs || []).map(d => ({ doc_type: d.doc_type, status: d.status }));
    return canAdvance(activeModules.length ? activeModules : ['adesao', 'simulacao', 'formalizacao', 'documentos', 'garantias'], existingOp.status as any, docList);
  }, [existingOp, existingDocs, activeModules]);

  const [emitting, setEmitting] = useState<string | null>(null);
  const docMap = new Map((existingDocs || []).map(d => [d.doc_type, d]));

  const handleDocAction = async (docType: DocumentType, action: 'emit' | 'sign' | 'validate') => {
    if (!operationId || !user) return;
    setEmitting(docType);
    const docDef = allDocTypes.find(d => d.type === docType);
    try {
      const existing = existingDocs?.find(d => d.doc_type === docType);
      if (action === 'emit') {
        if (existing) {
          await supabase.from('operation_documents').update({ status: 'emitido', generated_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await supabase.from('operation_documents').insert({ operation_id: operationId, doc_type: docType, status: 'emitido', generated_at: new Date().toISOString(), guarantee_category: docDef?.category || null } as any);
        }
      } else if (action === 'sign' && existing) {
        await supabase.from('operation_documents').update({ status: 'assinado', signed_at: new Date().toISOString() }).eq('id', existing.id);
      } else if (action === 'validate' && existing) {
        // F2: Cessão só pode ser validada com aceite do comprador (counterparty_notified)
        if (docType === 'cessao_credito') {
          const docData = (existing as any).data || {};
          if (!docData.counterparty_notified) {
            toast.error('A cessão de crédito só pode ser validada após notificação/aceite do comprador. Registre a notificação primeiro.');
            setEmitting(null);
            return;
          }
        }
        await supabase.from('operation_documents').update({ status: 'validado', validated_at: new Date().toISOString() } as any).eq('id', existing.id);
      }
      await supabase.from('operation_logs').insert({ operation_id: operationId, user_id: user.id, action: `documento_${action}_${docType}`, details: { doc_type: docType } });
      toast.success(`Documento "${docType}" — ${action}`);
      refetchDocs();
    } catch (e: any) { toast.error(e.message); }
    finally { setEmitting(null); }
  };

  const handleAdvanceStatus = async () => {
    if (!operationId || !nextStatus || !user) return;
    const fromStatus = existingOp?.status || 'simulacao';
    await supabase.from('operations').update({ status: nextStatus }).eq('id', operationId);
    // C1: Write to operation_status_history for formal audit trail
    await supabase.from('operation_status_history').insert({
      operation_id: operationId, from_status: fromStatus, to_status: nextStatus, changed_by: user.id,
    });
    await supabase.from('operation_logs').insert({ operation_id: operationId, user_id: user.id, action: `status_avancado_${nextStatus}`, details: { from: fromStatus, to: nextStatus } });
    queryClient.invalidateQueries({ queryKey: ['operations'] });
    refetchDocs();
    toast.success(`Avançado para: ${nextStatus}`);
  };

  // ─── Save operation ───
  const handleSave = async (advanceToBarter = false) => {
    if (!user || !selectedCampaignId || selections.length === 0) return;
    if (eligibility?.blocked) { toast.error('Operação bloqueada por elegibilidade'); return; }

    const counterparty = selectedBuyerId === '__other__' ? counterpartyOther : (selectedBuyer?.buyer_name || '');

    try {
      let opId = operationId;

      if (isNewOperation) {
        const op = await createOperation.mutateAsync({
          campaign_id: selectedCampaignId, user_id: user.id, client_name: clientName || 'Sem nome',
          client_document: clientDocument || undefined, channel: channelEnum, city: clientCity || undefined,
          state: clientState || undefined, due_months: dueMonths, area_hectares: area,
          gross_revenue: grossToNet.grossRevenue, combo_discount: grossToNet.comboDiscount,
          net_revenue: grossToNet.netRevenue, financial_revenue: grossToNet.financialRevenue,
          distributor_margin: grossToNet.distributorMargin, commodity: selectedCommodity as any,
          counterparty,
          status: 'simulacao' as const,
        });
        opId = op.id;

        const items = pricingResults.map(pr => {
          const sel = selections.find(s => s.productId === pr.productId)!;
          return { operation_id: opId!, product_id: pr.productId, dose_per_hectare: sel.dosePerHectare, raw_quantity: sel.rawQuantity, rounded_quantity: sel.roundedQuantity, boxes: sel.boxes, pallets: sel.pallets, base_price: pr.basePrice, normalized_price: pr.normalizedPrice, interest_component: pr.interestComponent, margin_component: pr.marginComponent, subtotal: pr.subtotal };
        });
        await createItems.mutateAsync(items);
      } else {
        await updateOperation.mutateAsync({
          id: opId!, client_name: clientName, client_document: clientDocument || undefined,
          channel: channelEnum, city: clientCity, state: clientState, due_months: dueMonths,
          area_hectares: area, gross_revenue: grossToNet.grossRevenue, combo_discount: grossToNet.comboDiscount,
          net_revenue: grossToNet.netRevenue, financial_revenue: grossToNet.financialRevenue,
          distributor_margin: grossToNet.distributorMargin, commodity: selectedCommodity as any,
          total_sacas: insurancePremium?.totalSacas ?? parity.quantitySacas,
          commodity_price: parity.commodityPricePerUnit, reference_price: parity.referencePrice,
          has_existing_contract: hasContract, insurance_premium_sacas: insurancePremium?.additionalSacas ?? 0,
          counterparty,
          payment_method: 'barter' as const,
        });
      }

      // Save snapshot with valorization + guarantee data
      const snapshot = buildSnapshot({
        campaign: campaign!, rawCampaign, selections, pricingResults,
        comboActivations, comboDefinitions: combos, eligibility: eligibility!,
        grossToNet, consumptionLedger: comboCascade.consumptionLedger,
        orderContext: { clientName, clientDocument, channel: channelEnum, state: clientState, city: clientCity, areaHectares: area, dueMonths, commodity: selectedCommodity },
        commodityData: {
          type: selectedCommodity, exchange: pricing.exchange, contract: pricing.contract,
          exchangePrice: pricing.exchangePrice, exchangeRateBolsa: pricing.exchangeRateBolsa,
          basisPort: port, basisValue: pricing.basisByPort[port],
          freightOrigin, freightReducerPerTon: freightReducer?.totalReducer,
          netPricePerSaca: commodityNetPrice,
          valorizationBonus: selectedValorization?.use_percent
            ? (selectedValorization.percent_value || 0)
            : (selectedValorization?.nominal_value || 0),
        },
        parity, insurance: insurancePremium ? { premiumPerSaca: insurancePremium.premiumPerSaca, additionalSacas: insurancePremium.additionalSacas, totalSacas: insurancePremium.totalSacas, volatility: insurancePremium.volatility } : undefined,
        performanceIndex: performanceIndex / 100,
        priceVariationIndex: ivp,
        aforoPercent: (rawCampaign as any)?.aforo_percent || 130,
        contractPriceType: contractPriceType,
      });

      await supabase.from('order_pricing_snapshots').insert({ operation_id: opId!, snapshot: snapshot as any, snapshot_type: isNewOperation ? 'simulation' : 'order', created_by: user.id });
      await createLog.mutateAsync({ operation_id: opId!, user_id: user.id, action: isNewOperation ? 'simulacao_criada' : 'operacao_atualizada', details: { area, segment, dueMonths, productsCount: selections.length } });

      toast.success(isNewOperation ? 'Operação criada!' : 'Operação atualizada!');
      if (isNewOperation) navigate(`/operacao/${opId}`, { replace: true });
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  // ─── Step validation ───
  const canProceed = (stepId: string): boolean => {
    switch (stepId) {
      case 'context': return !!selectedCampaignId && !!clientName && !eligibility?.blocked;
      case 'order': return selections.length > 0;
      case 'simulation': return grossToNet.grossRevenue > 0;
      case 'payment': return true;
      case 'barter': return true;
      case 'formalization': return true;
      case 'summary': return true;
      default: return true;
    }
  };

  const goNext = () => { if (currentStep < visibleSteps.length - 1 && canProceed(visibleSteps[currentStep].id)) setCurrentStep(currentStep + 1); };
  const goPrev = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const currentStepDef = visibleSteps[currentStep];

  if (loadingCampaigns) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {isNewOperation ? 'Nova Operação' : `Operação ${existingOp?.client_name || ''}`}
          </h1>
          <p className="text-xs text-muted-foreground">
            {campaign?.name} — {campaign?.season}
            {existingOp && <span className="ml-2 engine-badge bg-primary/10 text-primary">{existingOp.status}</span>}
          </p>
        </div>
      </div>

      {/* Stepper bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {visibleSteps.map((step, i) => {
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          const StepIcon = step.icon;
          return (
            <button key={step.id} onClick={() => i <= currentStep && setCurrentStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                isActive ? 'bg-primary text-primary-foreground' :
                isDone ? 'bg-success/10 text-success cursor-pointer' :
                'bg-muted text-muted-foreground'
              }`}>
              {isDone ? <Check className="w-3 h-3" /> : <StepIcon className="w-3 h-3" />}
              {step.label}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div key={currentStepDef.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }}>

          {/* ═══ CONTEXT STEP ═══ */}
          {currentStepDef.id === 'context' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="glass-card p-4 lg:col-span-2">
                  <label className="stat-label">Campanha</label>
                  <Select value={selectedCampaignId} onValueChange={v => { setSelectedCampaignId(v); setSelectedProducts(new Map()); }}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {activeCampaigns?.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.season})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Área (ha)</label>
                  <Input type="number" value={area} onChange={e => setArea(Number(e.target.value))} className="mt-1 bg-muted border-border font-mono text-foreground" min={1} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-4">
                  <label className="stat-label">Nome do Cliente</label>
                  <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Produtor/Empresa" className="mt-1 bg-muted border-border text-foreground" />
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">CPF/CNPJ</label>
                  <Input value={clientDocument} onChange={e => setClientDocument(e.target.value)} placeholder="Documento" className="mt-1 bg-muted border-border text-foreground" />
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Tipo</label>
                  <Select value={clientType} onValueChange={v => setClientType(v as 'PF' | 'PJ')}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PF">Pessoa Física</SelectItem>
                      <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Inscrição Estadual</label>
                  <Input value={clientIE} onChange={e => setClientIE(e.target.value)} placeholder="IE" className="mt-1 bg-muted border-border text-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-4">
                  <label className="stat-label">Estado (UF)</label>
                  <Select value={clientState} onValueChange={v => { setClientState(v); setClientCity(''); }}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione o estado" /></SelectTrigger>
                    <SelectContent className="bg-popover z-50 max-h-[300px]">
                      {eligibleStates.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Cidade</label>
                  <Select value={clientCity} onValueChange={setClientCity} disabled={!clientState}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder={clientState ? 'Selecione a cidade' : 'Selecione o estado primeiro'} /></SelectTrigger>
                    <SelectContent className="bg-popover z-50 max-h-[300px]">
                      {eligibleCitiesForState.map(m => <SelectItem key={m.ibge} value={m.name}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">E-mail</label>
                  <Input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="email@..." className="mt-1 bg-muted border-border text-foreground" />
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Telefone</label>
                  <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(xx) xxxxx-xxxx" className="mt-1 bg-muted border-border text-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="glass-card p-4">
                  <label className="stat-label">Endereço de Entrega</label>
                  <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Rua, nº, bairro, CEP" className="mt-1 bg-muted border-border text-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4">
                  <label className="stat-label">Canal</label>
                  <Select value={segment} onValueChange={v => setSegment(v)}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>{segmentOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Commodity</label>
                  <Select value={selectedCommodity} onValueChange={setSelectedCommodity}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(rawCampaign?.commodities?.length ? rawCampaign.commodities : ['soja', 'milho']).map((c: string) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Vencimento</label>
                  <Select value={String(dueMonths)} onValueChange={v => setDueMonths(Number(v))}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>{dueDateOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {/* Eligibility flags */}
              {eligibility && !eligibility.eligible && (
                <div className="space-y-1">
                  {eligibility.warnings.map((w, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs ${eligibility.blocked ? 'text-destructive bg-destructive/10' : 'text-warning bg-warning/10'} border rounded-md px-3 py-2`}>
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {w}
                      {eligibility.blocked && <span className="ml-auto font-semibold">⛔ BLOQUEANTE</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ ORDER STEP ═══ */}
          {currentStepDef.id === 'order' && (
            <div className="space-y-4">
              {/* Sticky discount bar + mode toggle */}
              <div className="glass-card p-4 space-y-3 sticky top-0 z-10 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">Modo de Seleção:</span>
                    <div className="flex rounded-md border border-border overflow-hidden">
                      <button onClick={() => setQuantityMode('dose')} className={`px-3 py-1 text-xs font-medium transition-colors ${quantityMode === 'dose' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Área × Dose</button>
                      <button onClick={() => setQuantityMode('livre')} className={`px-3 py-1 text-xs font-medium transition-colors ${quantityMode === 'livre' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Qtd Livre</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedProducts.size > 0 && (
                      <Button size="sm" variant="ghost" onClick={clearOrder} className="text-destructive text-xs h-7 gap-1">
                        <X className="w-3 h-3" /> Limpar Pedido
                      </Button>
                    )}
                    {combos.length > 0 && (
                      <span className="font-mono text-sm text-success font-bold">{activatedDiscount.toFixed(1)}% / {maxDiscount}%{complementaryDiscount > 0 && <span className="ml-2 text-info">+ {complementaryDiscount.toFixed(1)}%</span>}</span>
                    )}
                  </div>
                </div>
                {combos.length > 0 && (
                  <>
                    <Progress value={discountProgress} className="h-2.5 bg-muted" />
                    {/* Activated combos shown discreetly */}
                    {comboActivations.some(ca => ca.applied) && (
                      <div className="flex flex-wrap gap-1.5">
                        {comboActivations.filter(ca => ca.applied).map(ca => (
                          <span key={ca.comboId} className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
                            {ca.comboName} ({ca.discountPercent}%) ✓
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Combo recommendations — clickable to add product */}
                    {comboRecommendations.length > 0 && (
                      <div className="space-y-1">
                        {comboRecommendations.map((rec, i) => (
                          <button key={i} onClick={() => {
                            if (rec.productId && !selectedProducts.has(rec.productId)) {
                              toggleProduct(rec.productId, rec.suggestedDose);
                              if (quantityMode === 'livre' && rec.suggestedQty) {
                                updateFreeQuantity(rec.productId, rec.suggestedQty);
                              }
                            }
                          }} className="flex items-center gap-2 text-xs text-info bg-info/10 border border-info/20 rounded-md px-3 py-1.5 w-full text-left hover:bg-info/20 transition-colors cursor-pointer">
                            <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                            <span className="flex-1">{rec.action}</span>
                            {rec.productId && !selectedProducts.has(rec.productId) && <Plus className="w-3.5 h-3.5 shrink-0 text-success" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Product grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {products.map(product => {
                  const isSelected = selectedProducts.has(product.id);
                  const dose = selectedProducts.get(product.id) ?? product.dosePerHectare;
                  const selection = selections.find(s => s.productId === product.id);
                  // Normalized price for display (always in BRL)
                  const displayPrice = campaign ? normalizePrice(product, campaign, (segment || channelEnum) as ChannelSegment, dueMonths, { paymentMethodMarkup, segmentAdjustmentPercent }) : product.pricePerUnit;
                  return (
                    <div key={product.id} className={`glass-card p-4 cursor-pointer transition-all ${isSelected ? 'glow-border' : 'hover:border-muted-foreground/30'}`} onClick={() => !isSelected && toggleProduct(product.id)}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-foreground">{product.name}</span>
                        {isSelected ? <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); toggleProduct(product.id); }} className="text-destructive h-6 w-6 p-0"><Minus className="w-3 h-3" /></Button>
                          : <Button size="sm" variant="ghost" className="text-success h-6 w-6 p-0"><Plus className="w-3 h-3" /></Button>}
                      </div>
                      <div className="text-xs text-muted-foreground">{product.category} — R$ {displayPrice.toFixed(2)}/{product.unitType}</div>
                      {isSelected && (
                        <div className="mt-2 pt-2 border-t border-border space-y-2">
                          {quantityMode === 'dose' ? (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground w-16">Dose/ha:</label>
                              <Input type="number" value={dose} step={0.05} min={product.minDose} max={product.maxDose} onChange={e => { e.stopPropagation(); updateDose(product.id, Number(e.target.value)); }} onClick={e => e.stopPropagation()} className="h-7 bg-muted border-border font-mono text-xs text-foreground" />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground w-16">Qtd ({product.unitType}):</label>
                              <Input type="number" value={freeQuantities.get(product.id) || ''} min={0} onChange={e => { e.stopPropagation(); updateFreeQuantity(product.id, Number(e.target.value)); }} onClick={e => e.stopPropagation()} className="h-7 bg-muted border-border font-mono text-xs text-foreground" placeholder="0" />
                            </div>
                          )}
                          {selection && (
                            <div className="grid grid-cols-3 gap-1 text-xs">
                              <div className="bg-muted/50 rounded p-1 text-center"><div className="text-muted-foreground">Vol</div><div className="font-mono text-foreground">{selection.roundedQuantity.toFixed(0)}</div></div>
                              <div className="bg-muted/50 rounded p-1 text-center"><div className="text-muted-foreground">Cx</div><div className="font-mono text-foreground">{selection.boxes}</div></div>
                              <div className="bg-muted/50 rounded p-1 text-center"><div className="text-muted-foreground">Plt</div><div className="font-mono text-foreground">{selection.pallets}</div></div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ SIMULATION STEP ═══ */}
          {/* Discount never shown per product — only total in footer */}
          {currentStepDef.id === 'simulation' && selections.length > 0 && (
            <div className="glass-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-primary" /> Breakdown da Simulação</h2>
              <div className="space-y-1">
                {pricingResults.map(pr => {
                  const prod = products.find(p => p.id === pr.productId)!;
                  return (
                    <div key={pr.productId} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                      <span className="text-foreground">{prod.name}</span>
                      <div className="flex items-center gap-4 font-mono text-xs">
                        <span className="text-muted-foreground">{pr.quantity.toFixed(0)} {prod.unitType}</span>
                        <span className="text-muted-foreground">{formatCurrency(pr.normalizedPrice)}/{prod.unitType}</span>
                        <span className="text-foreground font-medium w-28 text-right">{formatCurrency(pr.subtotal)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border">
                <div><div className="stat-label">Receita Bruta</div><div className="font-mono font-bold text-foreground">{formatCurrency(grossToNet.grossRevenue)}</div></div>
                <div><div className="stat-label">Desconto Total</div><div className="font-mono font-bold text-warning">-{formatCurrency(grossToNet.comboDiscount + (grossToNet.directIncentiveDiscount || 0))}</div></div>
                <div><div className="stat-label">Margem Canal</div><div className="font-mono text-muted-foreground">{formatCurrency(grossToNet.distributorMargin)}</div></div>
                <div><div className="stat-label">Total a Pagar</div><div className="font-mono font-bold text-xl text-success">{formatCurrency(grossToNet.netRevenue)}</div></div>
              </div>
            </div>
          )}

          {/* ═══ PAYMENT STEP ═══ */}
          {currentStepDef.id === 'payment' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-4">
                <label className="stat-label">Meio de Pagamento</label>
                <Select value={selectedPaymentMethod || selectedPM?.id || ''} onValueChange={setSelectedPaymentMethod}>
                  <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{paymentMethods?.map(pm => <SelectItem key={pm.id} value={pm.id}>{pm.method_name} {pm.markup_percent !== 0 ? `(${pm.markup_percent > 0 ? '+' : ''}${pm.markup_percent}%)` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="glass-card p-4">
                <div className="stat-label">Montante Final</div>
                <div className="font-mono text-2xl font-bold text-success mt-2">{formatCurrency(grossToNet.netRevenue)}</div>
                <div className="text-xs text-muted-foreground mt-1">Juros: {formatCurrency(grossToNet.financialRevenue)} | Margem: {formatCurrency(grossToNet.distributorMargin)}</div>
              </div>
            </div>
          )}

          {/* ═══ BARTER STEP (with buyer select + valorization) ═══ */}
          {currentStepDef.id === 'barter' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-4">
                  <label className="stat-label">Local de Entrega</label>
                  <Select value={freightOrigin} onValueChange={v => {
                    setFreightOrigin(v);
                    // Auto-select port from freight reducer destination
                    const fr = freightReducers.find(f => f.origin === v);
                    if (fr?.destination) setPort(fr.destination);
                  }}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione o local..." /></SelectTrigger>
                    <SelectContent>
                      {deliveryLocations.length > 0
                        ? deliveryLocations.map((loc: any) => <SelectItem key={loc.id} value={loc.warehouse_name}>{loc.warehouse_name} — {loc.city}/{loc.state}</SelectItem>)
                        : freightReducers.map(f => <SelectItem key={f.origin} value={f.origin}>{f.origin} → {f.destination} ({f.distanceKm}km)</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Porto Referência</label>
                  <Select value={port} onValueChange={setPort}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>{ports.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                  {freightReducer && freightReducer.totalReducer > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">Redutor logístico: R$ {freightReducer.totalReducer.toFixed(2)}/sc ({freightReducer.distanceKm}km)</div>
                  )}
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Comprador</label>
                  <Select value={selectedBuyerId} onValueChange={setSelectedBuyerId}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(buyers || []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.buyer_name} {b.fee ? `(fee: ${b.fee}%)` : ''}</SelectItem>)}
                      <SelectItem value="__other__">Outro (informar)</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedBuyerId === '__other__' && (
                    <Input value={counterpartyOther} onChange={e => setCounterpartyOther(e.target.value)} placeholder="Nome do comprador" className="mt-2 bg-muted border-border text-foreground text-xs" />
                  )}
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Tipo de Preço</label>
                  <Select value={contractPriceType} onValueChange={v => setContractPriceType(v as ContractPriceType)}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixo">Preço Fixo (PF)</SelectItem>
                      <SelectItem value="a_fixar">A Fixar (PAF)</SelectItem>
                      <SelectItem value="pre_existente">Pré-existente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Switch checked={hasContract} onCheckedChange={setHasContract} />
                    <Label className="text-xs">Contrato existente</Label>
                  </div>
                  {hasContract && <Input type="number" value={userPrice} onChange={e => setUserPrice(Number(e.target.value))} placeholder="Preço/sc" className="bg-muted border-border font-mono text-foreground" />}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="glass-card p-4"><div className="stat-label">Preço Net/sc</div><div className="font-mono text-lg font-bold text-foreground">{formatCurrency(commodityNetPrice)}</div></div>
                <div className="glass-card p-4"><div className="stat-label">Sacas</div><div className="font-mono text-lg font-bold text-success">{parity.quantitySacas.toLocaleString('pt-BR')}</div></div>
                <div className="glass-card p-4"><div className="stat-label">Preço Valorizado</div><div className="font-mono text-lg font-bold text-info">{formatCurrency(parity.referencePrice)}</div></div>
                <div className="glass-card p-4"><div className="stat-label">Valorização</div><div className={`font-mono text-lg font-bold ${parity.valorization >= 0 ? 'text-success' : 'text-destructive'}`}>{parity.valorization.toFixed(1)}%</div></div>
                <div className="glass-card p-4"><div className="stat-label">Diferença</div><div className={`font-mono text-lg font-bold ${parity.valorization >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(parity.referencePrice - parity.commodityPricePerUnit)}/sc</div></div>
              </div>
              {ivp < 1 && (
                <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded px-3 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                  Contrato "A Fixar" — fator de ajuste: {(ivp * 100).toFixed(0)}% (desconto de {((1 - ivp) * 100).toFixed(0)}% por risco de variação de preço)
                </div>
              )}
              {buyerFee > 0 && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1.5">Fee do comprador: {buyerFee}% — já aplicado no preço net/sc</div>
              )}
              {selectedValorization && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1.5">
                  Valorização: {selectedValorization.use_percent ? `${selectedValorization.percent_value}%` : `R$ ${selectedValorization.nominal_value}/sc`} — já aplicada
                </div>
              )}
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2"><Switch checked={showInsurance} onCheckedChange={setShowInsurance} /><Label className="text-xs">Seguro de Mercado (Opção)</Label></div>
                {showInsurance && insurancePremium && (
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div><div className="stat-label">Prêmio/sc</div><div className="font-mono text-foreground">{formatCurrency(insurancePremium.premiumPerSaca)}</div></div>
                    <div><div className="stat-label">Sacas adicionais</div><div className="font-mono text-warning">{insurancePremium.additionalSacas}</div></div>
                    <div><div className="stat-label">Total c/ seguro</div><div className="font-mono font-bold text-success">{insurancePremium.totalSacas.toLocaleString('pt-BR')} sc</div></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ FORMALIZATION STEP ═══ */}
          {currentStepDef.id === 'formalization' && (
            <div className="space-y-4">
              {!isNewOperation && wagonStages.length > 0 && (
                <div className="glass-card p-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><Train className="w-4 h-4 text-primary" /> Certificação</h3>
                  <TrainTrack stages={wagonStages} />
                  {nextStatus && (
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" onClick={handleAdvanceStatus} className="bg-success text-success-foreground"><ArrowRight className="w-4 h-4 mr-1" /> Avançar para {nextStatus}</Button>
                    </div>
                  )}
                </div>
              )}
              {isNewOperation && <div className="glass-card p-6 text-center text-muted-foreground">Salve a operação primeiro para acessar a formalização.</div>}
              {!isNewOperation && (
                <div className="space-y-4">
                  {/* PoE/PoL/PoD grouped checklist */}
                  {[
                    { cat: 'poe', title: 'Comprovação de Produção', icon: ShieldCheck, color: 'text-success' },
                    { cat: 'pol', title: 'Comprovação de Contrato', icon: Lock, color: 'text-primary' },
                    { cat: 'pod', title: 'Comprovação de Entrega', icon: Check, color: 'text-info' },
                    { cat: undefined, title: 'Outros Documentos', icon: FileText, color: 'text-muted-foreground' },
                  ].map(group => {
                    const docs = allDocTypes.filter(d => d.category === group.cat);
                    if (docs.length === 0) return null;
                    const GroupIcon = group.icon;
                    return (
                      <div key={group.cat || 'other'}>
                        <h4 className={`text-xs font-semibold ${group.color} flex items-center gap-1.5 mb-2`}>
                          <GroupIcon className="w-3.5 h-3.5" /> {group.title}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {docs.map(doc => {
                            const existing = docMap.get(doc.type);
                            const status = (existing?.status as keyof typeof statusConfig) || 'pendente';
                            const config = statusConfig[status];
                            const Icon = config.icon;
                            return (
                              <div key={doc.type} className="glass-card p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-semibold text-foreground">{doc.label}</span>
                                  <span className={`engine-badge ${config.bg} ${config.color} text-xs`}><Icon className="w-3 h-3 inline mr-1" />{config.label}</span>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  {status === 'pendente' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => handleDocAction(doc.type, 'emit')}>{emitting === doc.type ? '...' : 'Emitir'}</Button>}
                                  {status === 'emitido' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => handleDocAction(doc.type, 'sign')}><PenLine className="w-3 h-3 mr-1" />Assinar</Button>}
                                  {status === 'assinado' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => handleDocAction(doc.type, 'validate')}><ShieldCheck className="w-3 h-3 mr-1" />Validar</Button>}
                                  {/* F1: Cessão notification controls */}
                                  {doc.type === 'cessao_credito' && existing && (status === 'emitido' || status === 'assinado') && (
                                    (() => {
                                      const docData = (existing as any).data || {};
                                      const notified = docData.counterparty_notified;
                                      return notified ? (
                                        <span className="text-xs text-success flex items-center gap-1"><CheckCircle className="w-3 h-3" />Comprador notificado ({docData.notification_method || 'notificação'})</span>
                                      ) : (
                                        <div className="flex gap-1 w-full mt-1">
                                          <Button size="sm" variant="outline" className="flex-1 text-xs border-warning text-warning" onClick={async () => {
                                            await supabase.from('operation_documents').update({ data: { ...docData, counterparty_notified: true, notification_method: 'notificacao', notified_at: new Date().toISOString() } } as any).eq('id', existing.id);
                                            toast.success('Comprador notificado (notificação simples)');
                                            refetchDocs();
                                          }}>Notificar</Button>
                                          <Button size="sm" variant="outline" className="flex-1 text-xs border-primary text-primary" onClick={async () => {
                                            await supabase.from('operation_documents').update({ data: { ...docData, counterparty_notified: true, cession_accepted: true, notification_method: 'tripartite', notified_at: new Date().toISOString() } } as any).eq('id', existing.id);
                                            toast.success('Cessão tripartite registrada');
                                            refetchDocs();
                                          }}>Tripartite</Button>
                                        </div>
                                      );
                                    })()
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Guarantee Coverage Panel */}
                  <div className="glass-card p-4">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><ShieldCheck className="w-4 h-4 text-primary" /> Cobertura de Garantias</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div>
                        <div className="stat-label">Índice de Cumprimento</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Input type="number" value={performanceIndex} min={0} max={100} onChange={e => setPerformanceIndex(Math.min(100, Math.max(0, Number(e.target.value))))} className="h-8 w-20 bg-muted border-border font-mono text-xs text-foreground" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div>
                        <div className="stat-label">Aforo Exigido</div>
                        <div className="font-mono text-foreground">{rawCampaign?.aforo_percent || 130}%</div>
                      </div>
                      <div>
                        <div className="stat-label">Montante Operação</div>
                        <div className="font-mono text-foreground">{formatCurrency(grossToNet.netRevenue)}</div>
                      </div>
                      <div>
                        <div className="stat-label">Sacas Efetivas</div>
                        <div className="font-mono text-foreground">{Math.round(parity.quantitySacas * (performanceIndex / 100)).toLocaleString('pt-BR')} sc</div>
                      </div>
                    </div>
                    <Progress value={performanceIndex} className="h-2 bg-muted" />
                    {performanceIndex < 80 && (
                      <div className="mt-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded px-3 py-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 inline mr-1" /> Índice de Cumprimento abaixo de 80% — risco elevado de não entrega
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ SUMMARY STEP ═══ */}
          {currentStepDef.id === 'summary' && (
            <div className="space-y-4">
              <div className="glass-card p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">Resumo Final</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><div className="stat-label">Cliente</div><div className="text-foreground font-medium">{clientName || '—'}</div></div>
                  <div><div className="stat-label">Área</div><div className="font-mono text-foreground">{area} ha</div></div>
                  <div><div className="stat-label">Produtos</div><div className="font-mono text-foreground">{selections.length}</div></div>
                  <div><div className="stat-label">Receita Bruta</div><div className="font-mono font-bold text-foreground">{formatCurrency(grossToNet.grossRevenue)}</div></div>
                  <div><div className="stat-label">Desconto Total</div><div className="font-mono text-warning">-{formatCurrency(grossToNet.comboDiscount + (grossToNet.directIncentiveDiscount || 0))}</div></div>
                  <div><div className="stat-label">Total a Pagar</div><div className="font-mono font-bold text-success text-xl">{formatCurrency(grossToNet.netRevenue)}</div></div>
                  <div><div className="stat-label">Sacas</div><div className="font-mono font-bold text-foreground">{(insurancePremium?.totalSacas ?? parity.quantitySacas).toLocaleString('pt-BR')}</div></div>
                  <div><div className="stat-label">Valorização</div><div className={`font-mono font-bold ${parity.valorization >= 0 ? 'text-success' : 'text-destructive'}`}>{parity.valorization.toFixed(1)}%</div></div>
                </div>
              </div>
              {/* Consumption ledger */}
              {Object.keys(comboCascade.consumptionLedger).length > 0 && (
                <div className="glass-card p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Ledger de Consumo (Combos)</h3>
                  {Object.entries(comboCascade.consumptionLedger).map(([comboId, refs]) => {
                    const ca = comboActivations.find(a => a.comboId === comboId);
                    return (
                      <div key={comboId} className="mb-2">
                        <div className="text-xs font-medium text-foreground">{ca?.comboName || comboId}</div>
                        <div className="flex gap-2 mt-1">
                          {Object.entries(refs).map(([ref, qty]) => <span key={ref} className="engine-badge bg-muted text-muted-foreground text-xs">{ref}: {qty.toFixed(0)}</span>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button variant="outline" onClick={goPrev} disabled={currentStep === 0} className="border-border">
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <div className="flex gap-2">
          {(currentStepDef.id === 'simulation' || currentStepDef.id === 'barter' || currentStepDef.id === 'summary') && (
            <Button onClick={() => handleSave()} disabled={createOperation.isPending || updateOperation.isPending || selections.length === 0} variant="outline" className="border-primary text-primary">
              {(createOperation.isPending || updateOperation.isPending) ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Salvar
            </Button>
          )}
          {currentStep < visibleSteps.length - 1 && (
            <Button onClick={goNext} disabled={!canProceed(currentStepDef.id)} className="bg-primary text-primary-foreground">
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
