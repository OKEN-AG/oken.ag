import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useOrderWizardState } from '@/pages/hooks/useOrderWizardState';
import { useOrderPersistence } from '@/pages/hooks/useOrderPersistence';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
import { useAppContext } from '@/contexts/AppContext';
import { useCommodityOptions } from '@/hooks/useCommoditiesMasterData';
import { normalizeCommodityCode } from '@/lib/commodity';
import { useOperation, useOperationItems, useOperationDocuments, useCreateOperation, useCreateOperationItems, useCreateOperationLog, useReplaceOperationItems, useUpdateOperation } from '@/hooks/useOperations';
import { getSuggestedDoseForRef, applyComboCascade, getMaxPossibleDiscount, getActivatedDiscount, getComplementaryDiscount } from '@/engines/combo-cascade';
import { useSimulationEngine } from '@/hooks/useSimulationEngine';
import { formatCpfCnpj, parsePtBrNumber, onlyDigits } from '@/lib/ptbr';
import { buildWagonStages, canAdvance, getBlockingReason } from '@/engines/orchestrator';
import type { ChannelSegment, Product, JourneyModule, DocumentType, ContractPriceType, AgronomicSelection } from '@/types/barter';
import { getAllMunicipios } from '@/data/municipios';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/NumericInput';
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
  Zap, Lightbulb, Eye
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ContextStep } from '@/pages/steps/ContextStep';
import { OrderStep } from '@/pages/steps/OrderStep';
import { SimulationStep } from '@/pages/steps/SimulationStep';
import { PaymentStep } from '@/pages/steps/PaymentStep';
import { BarterStep } from '@/pages/steps/BarterStep';
import { FormalizationStep } from '@/pages/steps/FormalizationStep';
import { SummaryStep } from '@/pages/steps/SummaryStep';


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

// Re-exported from constants (used by FormalizationStep directly)
import { statusConfig, allDocTypes } from '@/pages/steps/constants';

// ─── Combo recommendation logic ───
function getComboRecommendations(
  combos: any[],
  selections: AgronomicSelection[],
  products: Product[],
  area: number
): { productName: string; ref: string; action: string; productId?: string; suggestedDose?: number; suggestedQty?: number }[] {
  const recommendations: { productName: string; ref: string; action: string; productId?: string; suggestedDose?: number; suggestedQty?: number }[] = [];
  const selectedRefs = new Set(selections.map(s => (s.ref || '').toUpperCase().trim()));
  const productsByRef = new Map(products.map(p => [String(p.ref || '').toUpperCase().trim(), p]));
  const selectionsByRef = new Map(selections.map(sel => [String(sel.ref || '').toUpperCase().trim(), sel]));

  // Sort combos: highest discount first, then by fewest missing products (closest to activate), then by most products (widest coverage)
  const prioritizedCombos = [...combos]
    .map(combo => {
      const missingCount = combo.products.filter((cp: any) => !selectedRefs.has((cp.ref || '').toUpperCase().trim())).length;
      return { ...combo, missingCount };
    })
    .sort((a, b) => {
      if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
      if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
      return b.products.length - a.products.length;
    })
    .slice(0, 30);

  for (const combo of prioritizedCombos) {
    if (recommendations.length >= 5) break;

    const missing = combo.products.filter((cp: any) => !selectedRefs.has((cp.ref || '').toUpperCase().trim()));
    if (missing.length > 0 && missing.length <= 2) {
      for (const mp of missing) {
        if (recommendations.length >= 5) break;
        const ref = (mp.ref || '').toUpperCase().trim();
        const prod = productsByRef.get(ref);
        if (!prod) continue;

        const suggestedDose = (mp.minDosePerHa + mp.maxDosePerHa) / 2;
        const suggestedQty = Math.ceil(area * suggestedDose);
        recommendations.push({
          productName: prod.name,
          ref: mp.ref,
          productId: prod.id,
          suggestedDose,
          suggestedQty,
          action: `Incluir ${prod.name} (${suggestedDose.toFixed(2)}/${prod.unitType}${(prod.pricingBasis || 'por_hectare') === 'por_hectare' ? '/ha' : ''} ≈ ${suggestedQty} ${prod.unitType}) → combo "${combo.name}" (+${combo.discountPercent}%)`
        });
      }
    }

    for (const cp of combo.products) {
      if (recommendations.length >= 5) break;
      const ref = (cp.ref || '').toUpperCase().trim();
      const sel = selectionsByRef.get(ref);
      if (sel && sel.dosePerHectare < cp.minDosePerHa) {
        const suggestedQty = Math.ceil(area * cp.minDosePerHa);
        recommendations.push({
          productName: sel.product.name,
          ref: cp.ref,
          productId: sel.productId,
          suggestedDose: cp.minDosePerHa,
          suggestedQty,
          action: `Ajustar ${sel.product.name} para ${cp.minDosePerHa}${(sel.product.pricingBasis || 'por_hectare') === 'por_hectare' ? '/ha' : ''} (≈ ${suggestedQty} ${sel.product.unitType}) → combo "${combo.name}"`
        });
      }
    }
  }

  const seen = new Set<string>();
  return recommendations.filter(rec => {
    const key = (rec.ref || '').toUpperCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

// ─── Due date precedence: municipio/cidade > mesorregiao > estado > regiao > default ───
function getDueDatesWithPrecedence(
  dueDates: any[],
  clientCity?: string,
  clientMesoregion?: string,
  clientState?: string,
  clientRegion?: string
): any[] {
  if (!dueDates?.length) return [];

  const normalize = (value?: string) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  const sameType = (value: any, types: string[]) => types.includes(String(value || '').trim().toLowerCase());

  const normalizedCity = normalize(clientCity);
  const normalizedMeso = normalize(clientMesoregion);
  const normalizedState = String(clientState || '').trim().toUpperCase();
  const normalizedRegion = normalize(clientRegion);

  const byCity = dueDates.filter(d =>
    sameType(d.region_type, ['municipio', 'cidade']) &&
    normalize(d.region_value) === normalizedCity
  );
  if (byCity.length > 0) return byCity;

  const byMeso = dueDates.filter(d =>
    sameType(d.region_type, ['mesorregiao']) &&
    normalize(d.region_value) === normalizedMeso
  );
  if (byMeso.length > 0) return byMeso;

  const byState = dueDates.filter(d =>
    sameType(d.region_type, ['estado', 'uf']) &&
    String(d.region_value || '').trim().toUpperCase() === normalizedState
  );
  if (byState.length > 0) return byState;

  const byRegion = dueDates.filter(d =>
    sameType(d.region_type, ['regiao', 'region']) &&
    normalize(d.region_value) === normalizedRegion
  );
  if (byRegion.length > 0) return byRegion;

  const defaults = dueDates.filter(d => {
    const t = String(d.region_type || '').trim().toLowerCase();
    const v = normalize(d.region_value);
    return ['default', 'geral', 'all', 'todos'].includes(t) || (t === '' && v === '') || ['default', 'geral', 'all', 'todos'].includes(v);
  });
  if (defaults.length > 0) return defaults;

  return [];
}

export default function OperationStepperPage() {
  const { id: operationId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { tenantId, campaignId: contextCampaignId } = useAppContext();

  const isNewOperation = !operationId || operationId === 'novo';
  const initialCampaignId = contextCampaignId || searchParams.get('campaignId') || '';

  // ─── Data fetching ───
  const { data: activeCampaigns, isLoading: loadingCampaigns } = useActiveCampaigns();
  const { data: existingOp } = useOperation(isNewOperation ? undefined : operationId);
  const { data: existingItems } = useOperationItems(isNewOperation ? undefined : operationId);
  const { data: existingDocs, refetch: refetchDocs } = useOperationDocuments(isNewOperation ? undefined : operationId);

  const wizard = useOrderWizardState(initialCampaignId);
  const {
    currentStep, setCurrentStep, selectedCampaignId, setSelectedCampaignId, clientName, setClientName,
    clientDocument, setClientDocument, clientCity, setClientCity, clientCityCode, setClientCityCode,
    clientState, setClientState, clientType, setClientType, clientEmail, setClientEmail,
    clientPhone, setClientPhone, clientIE, setClientIE, deliveryAddress, setDeliveryAddress,
    selectedDistributorId, setSelectedDistributorId, channelSegmentName, setChannelSegmentName,
    channelMarginPercent, setChannelMarginPercent, channelAdjustmentPercent, setChannelAdjustmentPercent,
    segment, setSegment, channelEnum, setChannelEnum, area, setArea, comboQty, setComboQty,
    quantityMode, setQuantityMode, freeQuantities, setFreeQuantities, showCampaignPreview,
    setShowCampaignPreview, packagingSplits, setPackagingSplits, selectedProducts, setSelectedProducts,
    dueMonths, setDueMonths, selectedPaymentMethod, setSelectedPaymentMethod, selectedCommodity,
    setSelectedCommodity, port, setPort, freightOrigin, setFreightOrigin, hasContract, setHasContract,
    userPrice, setUserPrice, showInsurance, setShowInsurance, volatility, setVolatility,
    selectedBuyerId, setSelectedBuyerId, counterpartyOther, setCounterpartyOther,
    contractPriceType, setContractPriceType, performanceIndex, setPerformanceIndex,
  } = wizard;
  const { campaign, rawCampaign, products, combos, commodityPricing, rawCommodityPricing, freightReducers, deliveryLocations, buyers, valorizations, dueDates, isLoading: loadingData } = useCampaignData(selectedCampaignId || undefined);
  const effectiveArea = area * comboQty;

  // ─── Mutations ───
  const createOperation = useCreateOperation({ tenantId, campaignId: selectedCampaignId || null });
  const createItems = useCreateOperationItems();
  const replaceItems = useReplaceOperationItems();
  const createLog = useCreateOperationLog();
  const updateOperation = useUpdateOperation();

  // ─── Simulation Engine (server-authoritative — all calculations on backend) ───
  const { loading: simLoading, error: simError, result: simResult, simulateDebounced, clearResult: clearSimResult } = useSimulationEngine();

  useOrderPersistence({
    existingOp,
    existingItems,
    products,
    activeCampaigns,
    selectedCampaignId,
    setSelectedCampaignId,
    isNewOperation,
    setClientName,
    setClientDocument,
    setClientCity,
    setClientState,
    setClientCityCode,
    setChannelEnum,
    setSelectedDistributorId,
    setChannelSegmentName,
    setSegment,
    setArea,
    setSelectedCommodity,
    setDueMonths,
    setSelectedProducts,
    setFreeQuantities,
    setPackagingSplits,
    setComboQty,
  });

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

  const { data: clientWhitelistFull } = useQuery({
    queryKey: ['campaign-clients-wl-full', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data } = await supabase.from('campaign_clients').select('name,document').eq('campaign_id', selectedCampaignId);
      return (data || []) as { name: string; document: string }[];
    },
  });
  const clientWhitelist = useMemo(() => (clientWhitelistFull || []).map(c => c.document), [clientWhitelistFull]);
  const hasWhitelist = (clientWhitelistFull || []).length > 0;

  const { data: channelTypesConfig } = useQuery({
    queryKey: ['campaign-channel-types-preview', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data } = await (supabase as any).from('campaign_channel_types').select('*').eq('campaign_id', selectedCampaignId);
      return (data || []) as any[];
    },
  });

  const { data: campaignDistributors } = useQuery({
    queryKey: ['campaign-distributors', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data } = await (supabase as any).from('campaign_distributors').select('*').eq('campaign_id', selectedCampaignId).eq('active', true);
      return (data || []) as any[];
    },
  });

  const { data: channelSegmentsConfig } = useQuery({
    queryKey: ['campaign-channel-segments', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data } = await (supabase as any).from('campaign_channel_segments').select('*').eq('campaign_id', selectedCampaignId);
      return (data || []) as any[];
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

  const campaignCurrency = useMemo(() => ((rawCampaign as any)?.currency || campaign?.currency || 'BRL').toUpperCase(), [rawCampaign, campaign]);

  const resolvePaymentMethod = useCallback((methodName?: string | null) => {
    const normalized = String(methodName || '').toLowerCase();
    if (normalized.includes('barter')) return 'barter' as const;
    if (normalized.includes('usd') || campaignCurrency === 'USD') return 'usd' as const;
    return 'brl' as const;
  }, [campaignCurrency]);

  useEffect(() => {
    if (!existingOp || !(existingOp as any).payment_method || !paymentMethods?.length) return;
    const matchPm = paymentMethods.find(pm => resolvePaymentMethod(pm.method_name) === (existingOp as any).payment_method);
    if (matchPm?.id) setSelectedPaymentMethod(matchPm.id);
  }, [existingOp, paymentMethods, resolvePaymentMethod]);

  // ─── Active modules → visible steps ───
  const activeModules: JourneyModule[] = rawCampaign?.active_modules as JourneyModule[] || [];
  const isBarter = selectedPM?.method_name?.toLowerCase().includes('barter') || false;
  const visibleSteps = STEPS.filter(s => {
    if (s.module === 'barter' as JourneyModule) return isBarter;
    if (!s.module) return true;
    if (activeModules.length === 0) return true;
    return activeModules.includes(s.module);
  });
  const { options: commodityOptions } = useCommodityOptions((rawCampaign?.commodities || []) as string[]);

  useEffect(() => {
    if (!selectedPaymentMethod && paymentMethods?.length) {
      setSelectedPaymentMethod(paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPaymentMethod]);

  useEffect(() => {
    if (!commodityOptions.length) return;
    if (!commodityOptions.some(option => normalizeCommodityCode(option.value) === normalizeCommodityCode(selectedCommodity))) {
      setSelectedCommodity(commodityOptions[0].value);
    }
  }, [commodityOptions, selectedCommodity]);

  const paymentMethodMarkup = selectedPM?.markup_percent || 0;

  useEffect(() => {
    if (!campaignDistributors?.length) return;
    if (!selectedDistributorId) setSelectedDistributorId(campaignDistributors[0].id);
  }, [campaignDistributors, selectedDistributorId]);

  useEffect(() => {
    if (!selectedDistributorId || !campaignDistributors?.length) return;
    const dist = campaignDistributors.find((d: any) => d.id === selectedDistributorId);
    const chName = dist?.channel_segment_name || '';
    setChannelSegmentName(chName);
    const cfg = (channelSegmentsConfig || []).find((c: any) => String(c.channel_segment_name).toLowerCase() === String(chName).toLowerCase());
    setChannelMarginPercent(Number(cfg?.margin_percent || 0));
    setChannelAdjustmentPercent(Number(cfg?.price_adjustment_percent || 0));
  }, [selectedDistributorId, campaignDistributors, channelSegmentsConfig]);

  // Due dates with precedence
  const filteredDueDates = useMemo(() => getDueDatesWithPrecedence(dueDates || [], clientCity, undefined, clientState, undefined), [dueDates, clientCity, clientState]);

  const dueDateOptions = useMemo(() => {
    // 1. Try campaign_due_dates with region precedence
    const dates = filteredDueDates.length ? filteredDueDates : (dueDates || []);
    if (dates.length) {
      const uniqueDates = [...new Set(dates.map((d: any) => d.due_date))].sort();
      return uniqueDates.map(d => {
        const date = new Date(d + 'T00:00:00');
        const diffDays = Math.max(Math.round((date.getTime() - Date.now()) / 86400000), 1);
        return { value: String(Math.max(Math.round(diffDays / 30), 1)), label: `${date.toLocaleDateString('pt-BR')} (${diffDays}d)`, date: d };
      });
    }
    // 2. Try available_due_dates array from campaign
    const availDates = rawCampaign?.available_due_dates as string[] | null;
    if (availDates?.length) {
      return availDates.sort().map(d => {
        const date = new Date(d + 'T00:00:00');
        const diffDays = Math.max(Math.round((date.getTime() - Date.now()) / 86400000), 1);
        return { value: String(Math.max(Math.round(diffDays / 30), 1)), label: `${date.toLocaleDateString('pt-BR')} (${diffDays}d)`, date: d };
      });
    }
    // 3. No fallback — campaign must configure due dates
    return [];
  }, [filteredDueDates, dueDates, rawCampaign]);
  const selectedDueDate = useMemo(() => {
    const selected = dueDateOptions.find(o => o.value === String(dueMonths));
    return selected?.date || null;
  }, [dueDateOptions, dueMonths]);
  const hasDueDateConfigIssue = !!selectedCampaignId && dueDateOptions.length === 0;

  useEffect(() => {
    if (!hasDueDateConfigIssue) return;
    toast.error('Campanha sem vencimentos configurados. Ajuste a campanha para continuar.');
  }, [hasDueDateConfigIssue]);

  // ─── CPF/CNPJ validation helpers ───
  const validateCpf = (cpf: string): boolean => {
    const digits = onlyDigits(cpf);
    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let rem = (sum * 10) % 11; if (rem === 10) rem = 0;
    if (rem !== parseInt(digits[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    rem = (sum * 10) % 11; if (rem === 10) rem = 0;
    return rem === parseInt(digits[10]);
  };
  const validateCnpj = (cnpj: string): boolean => {
    const digits = onlyDigits(cnpj);
    if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
    const weights1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    const weights2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weights1[i];
    let rem = sum % 11; const d1 = rem < 2 ? 0 : 11 - rem;
    if (d1 !== parseInt(digits[12])) return false;
    sum = 0;
    for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weights2[i];
    rem = sum % 11; const d2 = rem < 2 ? 0 : 11 - rem;
    return d2 === parseInt(digits[13]);
  };

  const documentDigits = useMemo(() => onlyDigits(clientDocument), [clientDocument]);
  const documentValid = useMemo(() => {
    if (!documentDigits) return true; // empty is ok
    if (documentDigits.length === 11) return validateCpf(clientDocument);
    if (documentDigits.length === 14) return validateCnpj(clientDocument);
    return documentDigits.length < 11; // still typing
  }, [documentDigits, clientDocument]);

  // Auto PF/PJ from CPF/CNPJ
  useEffect(() => {
    if (documentDigits.length === 11) setClientType('PF');
    else if (documentDigits.length >= 14) setClientType('PJ');
  }, [documentDigits]);

  // Auto first due date when city is selected
  useEffect(() => {
    if (!clientCity || !dueDateOptions.length) return;
    setDueMonths(Number(dueDateOptions[0].value));
  }, [clientCity, clientState]);

  const segmentOptions = useMemo(() => {
    if (simResult?.segmentOptions?.length) return simResult.segmentOptions.map(s => ({ value: s.value, label: s.label }));
    if (campaignSegments?.length) return campaignSegments.filter(s => s.active).map(s => ({ value: s.segment_name, label: s.segment_name }));
    if (campaign?.margins?.length) return campaign.margins.map(m => ({ value: m.segment, label: m.segment }));
    return [];
  }, [campaignSegments, campaign, simResult?.segmentOptions]);

  useEffect(() => {
    if (!segment && segmentOptions.length > 0) {
      setSegment(segmentOptions[0].value);
    }
  }, [segment, segmentOptions]);

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
  const normalizeKey = (v?: string) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const eligibleStateSet = useMemo(() => new Set((rawCampaign?.eligible_states || []).map((v: any) => String(v || '').trim().toUpperCase())), [rawCampaign]);
  const eligibleCitySet = useMemo(() => new Set((rawCampaign?.eligible_cities || []).map((v: any) => String(v))), [rawCampaign]);
  const eligibleCityNameSet = useMemo(() => new Set((rawCampaign?.eligible_cities || []).map((v: any) => normalizeKey(String(v)))), [rawCampaign]);
  const hasCityFilter = eligibleCitySet.size > 0;
  const hasStateFilter = eligibleStateSet.size > 0;

  const isMunicipioEligible = useCallback((m: { ibge: string; name: string; uf: string }) => {
    if (hasCityFilter) return eligibleCitySet.has(m.ibge) || eligibleCityNameSet.has(normalizeKey(m.name));
    if (hasStateFilter) return eligibleStateSet.has(String(m.uf || '').trim().toUpperCase());
    return true;
  }, [hasCityFilter, hasStateFilter, eligibleCitySet, eligibleCityNameSet, eligibleStateSet]);

  const eligibleStates = useMemo(() => {
    if (hasCityFilter) {
      const states = new Set<string>();
      allMunicipios.filter(m => isMunicipioEligible(m)).forEach(m => states.add(m.uf));
      return [...states].sort();
    }
    if (hasStateFilter) return [...eligibleStateSet].sort();
    const states = new Set<string>();
    allMunicipios.forEach(m => states.add(m.uf));
    return [...states].sort();
  }, [allMunicipios, hasCityFilter, hasStateFilter, eligibleStateSet, isMunicipioEligible]);

  const eligibleCitiesForState = useMemo(() => {
    if (!clientState) return [] as typeof allMunicipios;
    return allMunicipios
      .filter(m => m.uf === clientState && isMunicipioEligible(m))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allMunicipios, clientState, isMunicipioEligible]);

  const selectedCityName = useMemo(() => {
    if (clientCityCode) {
      const byCode = allMunicipios.find(m => m.ibge === clientCityCode && m.uf === clientState);
      if (byCode) return byCode.name;
    }
    return clientCity;
  }, [allMunicipios, clientCityCode, clientCity, clientState]);

  const usesIbgeCityEligibility = useMemo(() => {
    if (!hasCityFilter) return false;
    return Array.from(eligibleCitySet).some(v => /^\d{6,8}$/.test(String(v)));
  }, [eligibleCitySet, hasCityFilter]);

  const selectedDeliveryLocationId = useMemo(() => {
    const match = deliveryLocations.find((loc: any) => loc.warehouse_name === freightOrigin);
    return match?.id || undefined;
  }, [deliveryLocations, freightOrigin]);

  const lastSimulationKeyRef = useRef<string>('');
  const simulationKey = useMemo(() => {
    const selectionKey = Array.from(selectedProducts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([productId, dosePerHectare]) => ({
        productId,
        dosePerHectare,
        overrideQuantity: quantityMode === 'livre' ? (freeQuantities.get(productId) || null) : null,
      }));

    return JSON.stringify({
      selectedCampaignId,
      area: effectiveArea,
      segment,
      channelEnum,
      dueMonths,
      selectedDueDate,
      selectedPaymentMethod,
      selectedCommodity,
      port,
      freightOrigin,
      selectedDeliveryLocationId,
      hasContract,
      userPrice,
      showInsurance,
      selectedBuyerId,
      contractPriceType,
      performanceIndex,
      clientState,
      selectedCityName,
      clientCityCode,
      usesIbgeCityEligibility,
      clientType,
      clientDocument,
      quantityMode,
      selectionKey,
    });
  }, [selectedCampaignId, selectedProducts, effectiveArea, segment, channelEnum, dueMonths, selectedDueDate, selectedPaymentMethod,
      selectedCommodity, port, freightOrigin, selectedDeliveryLocationId, hasContract, userPrice, showInsurance,
      selectedBuyerId, contractPriceType, performanceIndex, clientState, selectedCityName,
      clientCityCode, usesIbgeCityEligibility, clientType, clientDocument, quantityMode, freeQuantities, selectedDistributorId, channelSegmentName]);

  // ─── Trigger simulation on input changes (server-authoritative) ───
  useEffect(() => {
    if (!tenantId || !selectedCampaignId || selectedProducts.size === 0 || !dueMonths || hasDueDateConfigIssue || !segment || !selectedDistributorId) return;
    if (lastSimulationKeyRef.current === simulationKey) return;
    lastSimulationKeyRef.current = simulationKey;

    const inputSelections = Array.from(selectedProducts.entries()).map(([id, dose]) => ({
      productId: id, dosePerHectare: dose, areaHectares: effectiveArea,
      overrideQuantity: quantityMode === 'livre' ? (freeQuantities.get(id) || undefined) : undefined,
    }));
    simulateDebounced({
      tenantId,
      campaignId: selectedCampaignId, selections: inputSelections, distributorId: selectedDistributorId || undefined, channelSegmentName: channelSegmentName || undefined, commercialSegmentName: segment, segmentName: segment, channelSegment: channelEnum, dueMonths, dueDate: selectedDueDate || undefined,
      paymentMethodId: selectedPaymentMethod || undefined,
      commodityCode: selectedCommodity || undefined,
      port: port || undefined, freightOrigin: freightOrigin || undefined, deliveryLocationId: selectedDeliveryLocationId,
      hasContract, userOverridePrice: hasContract ? userPrice : undefined,
      showInsurance, barterDiscountPercent: 0,
      buyerId: selectedBuyerId && selectedBuyerId !== '__other__' ? selectedBuyerId : undefined,
      contractPriceType, performanceIndex: performanceIndex / 100,
      clientContext: {
        state: clientState || undefined,
        city: (usesIbgeCityEligibility ? clientCityCode : selectedCityName) || undefined,
        clientType, clientDocument: clientDocument || undefined, segment,
      },
    });
  }, [selectedCampaignId, selectedProducts, effectiveArea, segment, channelEnum, dueMonths, selectedDueDate, selectedPaymentMethod,
      selectedCommodity, port, freightOrigin, selectedDeliveryLocationId, hasContract, userPrice, showInsurance,
      selectedBuyerId, contractPriceType, performanceIndex, clientState, selectedCityName,
      clientCityCode, usesIbgeCityEligibility, clientType, clientDocument, quantityMode, freeQuantities,
      simulationKey, hasDueDateConfigIssue, selectedDeliveryLocationId, tenantId]);

  // ─── Eligibility from backend result ───
  const eligibility = simResult?.eligibility ?? null;

  // ─── Product grouping by REF ───
  const productGroups = useMemo(() => {
    const groups = new Map<string, { ref: string; variants: Product[]; defaultDose: number; minDose: number; maxDose: number; category: string; unitType: string; pricePerUnit: number }>();
    for (const p of products) {
      const ref = (p.ref || p.name).toUpperCase().trim();
      if (!groups.has(ref)) {
        groups.set(ref, { ref, variants: [], defaultDose: p.dosePerHectare, minDose: p.minDose, maxDose: p.maxDose, category: p.category, unitType: p.unitType, pricePerUnit: p.pricePerUnit });
      }
      groups.get(ref)!.variants.push(p);
    }
    for (const g of groups.values()) {
      g.variants.sort((a, b) => {
        const aMax = Math.max(...(a.packageSizes?.length ? a.packageSizes : [1]));
        const bMax = Math.max(...(b.packageSizes?.length ? b.packageSizes : [1]));
        return bMax - aMax;
      });
    }
    return Array.from(groups.values());
  }, [products]);

  const getRefForProduct = (productId: string): string => {
    const p = products.find(pr => pr.id === productId);
    return (p?.ref || p?.name || '').toUpperCase().trim();
  };

  const getPackageLabel = (p: Product) => {
    const sizes = p.packageSizes?.length ? p.packageSizes : [];
    const maxSize = sizes.length ? Math.max(...sizes) : 0;
    return maxSize > 0 ? `${maxSize}${p.unitType} (${p.unitsPerBox}×${maxSize}${p.unitType})` : p.name;
  };

  // ─── Product selection ───
  const isPerAreaProduct = (product: Product) => (product.pricingBasis || 'por_hectare') === 'por_hectare';

  const toggleProduct = (productId: string, suggestedDose?: number) => {
    const ref = getRefForProduct(productId);
    const group = productGroups.find(g => g.ref === ref);
    if (group) {
      const selectedVariants = group.variants.filter(v => selectedProducts.has(v.id));
      if (selectedVariants.length > 0) {
        const next = new Map(selectedProducts);
        const nextFree = new Map(freeQuantities);
        for (const v of group.variants) { next.delete(v.id); nextFree.delete(v.id); }
        setSelectedProducts(next);
        setFreeQuantities(nextFree);
        const nextSplits = new Map(packagingSplits);
        nextSplits.delete(ref);
        setPackagingSplits(nextSplits);
        return;
      }
    }
    const next = new Map(selectedProducts);
    const prod = products.find(p => p.id === productId)!;
    const dose = suggestedDose ?? getSuggestedDoseForRef(combos, prod.ref || '') ?? prod.dosePerHectare;
    next.set(productId, dose);
    setSelectedProducts(next);
  };

  const clearOrder = () => {
    setSelectedProducts(new Map());
    setFreeQuantities(new Map());
    setPackagingSplits(new Map());
    clearSimResult();
  };

  const updateDose = (productId: string, dose: number) => {
    const next = new Map(selectedProducts);
    next.set(productId, dose);
    setSelectedProducts(next);
  };

  const updateDoseForRef = (ref: string, dose: number) => {
    const group = productGroups.find(g => g.ref === ref);
    if (!group) return;
    const next = new Map(selectedProducts);
    for (const v of group.variants) { if (next.has(v.id)) next.set(v.id, dose); }
    setSelectedProducts(next);
  };

  const updateFreeQuantity = (productId: string, qty: number) => {
    const next = new Map(freeQuantities);
    next.set(productId, qty);
    setFreeQuantities(next);
  };

  const addPackagingVariant = (ref: string, productId: string) => {
    if (selectedProducts.has(productId)) return;
    const group = productGroups.find(g => g.ref === ref);
    if (!group) return;
    const existingVariant = group.variants.find(v => selectedProducts.has(v.id));
    const dose = existingVariant ? (selectedProducts.get(existingVariant.id) || group.defaultDose) : group.defaultDose;
    const next = new Map(selectedProducts);
    next.set(productId, dose);
    setSelectedProducts(next);
    const nextFree = new Map(freeQuantities);
    nextFree.set(productId, 0);
    setFreeQuantities(nextFree);
  };

  const removePackagingVariant = (ref: string, productId: string) => {
    const group = productGroups.find(g => g.ref === ref);
    if (!group) return;
    const selectedVariants = group.variants.filter(v => selectedProducts.has(v.id));
    if (selectedVariants.length <= 1) return;
    const next = new Map(selectedProducts);
    next.delete(productId);
    setSelectedProducts(next);
    const nextFree = new Map(freeQuantities);
    nextFree.delete(productId);
    setFreeQuantities(nextFree);
  };

  // ─── Engine results derived from backend simulation ───
  const selections = useMemo(() => {
    if (!simResult?.selections) return [] as any[];
    return simResult.selections.map(s => ({
      ...s,
      productId: s.productId, ref: s.ref,
      product: products.find(p => p.id === s.productId) || { name: s.productName, unitType: s.unitType, pricingBasis: 'por_hectare' as const } as any,
      areaHectares: s.areaHectares, dosePerHectare: s.dosePerHectare,
      rawQuantity: s.rawQuantity, roundedQuantity: s.roundedQuantity,
      boxes: s.boxes, pallets: s.pallets,
    }));
  }, [simResult?.selections, products]);

  // Local combo cascade for instant feedback
  const localComboResult = useMemo(() => {
    if (combos.length === 0) return null;
    // When no products selected, show all combos as inactive
    if (selectedProducts.size === 0) {
      const maxD = getMaxPossibleDiscount(combos);
      const emptyActs = combos.map(c => ({ comboId: c.id, comboName: c.name, discountPercent: c.discountPercent, applied: false, consumed: {} }));
      return { activations: emptyActs, maxDiscount: maxD, activatedDiscount: 0, complementaryDiscount: 0, progress: 0 };
    }
    const localSels: AgronomicSelection[] = Array.from(selectedProducts.entries()).map(([id, dose]) => {
      const prod = products.find(p => p.id === id);
      if (!prod) return null;
      const qty = quantityMode === 'livre' ? (freeQuantities.get(id) || Math.ceil(effectiveArea * dose)) : Math.ceil(effectiveArea * dose);
      return {
        productId: id, ref: prod.ref || '', product: prod,
        dosePerHectare: dose, areaHectares: effectiveArea,
        rawQuantity: qty, roundedQuantity: qty, boxes: 0, pallets: 0,
      };
    }).filter(Boolean) as AgronomicSelection[];
    const acts = applyComboCascade(combos, localSels);
    const maxD = getMaxPossibleDiscount(combos);
    const actD = getActivatedDiscount(acts);
    const compD = getComplementaryDiscount(acts);
    return { activations: acts, maxDiscount: maxD, activatedDiscount: actD, complementaryDiscount: compD, progress: maxD > 0 ? (actD / maxD) * 100 : 0 };
  }, [combos, selectedProducts, products, effectiveArea, quantityMode, freeQuantities]);

  // Prefer local instant values, fallback to backend
  const comboActivations = localComboResult?.activations ?? simResult?.comboActivations ?? [];
  const maxDiscount = localComboResult?.maxDiscount ?? simResult?.maxDiscount ?? 0;
  const activatedDiscount = localComboResult?.activatedDiscount ?? simResult?.activatedDiscount ?? 0;
  const complementaryDiscount = localComboResult?.complementaryDiscount ?? simResult?.complementaryDiscount ?? 0;
  const discountProgress = localComboResult?.progress ?? simResult?.discountProgress ?? 0;

  // Combo recommendations — use local selectedProducts for instant feedback, fall back to backend selections
  const localSelections = useMemo(() => {
    if (selections.length > 0) return selections;
    return Array.from(selectedProducts.entries()).map(([id, dose]) => {
      const prod = products.find(p => p.id === id);
      return prod ? { productId: id, ref: prod.ref || '', product: prod, dosePerHectare: dose, areaHectares: effectiveArea, rawQuantity: effectiveArea * dose, roundedQuantity: effectiveArea * dose, boxes: 0, pallets: 0 } : null;
    }).filter(Boolean) as any[];
  }, [selections, selectedProducts, products, effectiveArea]);
  const comboRecommendations = useMemo(() => getComboRecommendations(combos, localSelections, products, effectiveArea), [combos, localSelections, products, effectiveArea]);

  const pricingResults = simResult?.pricingResults ?? [];
  const rawGrossToNet = simResult?.grossToNet;
  const grossToNet = {
    grossRevenue: rawGrossToNet?.grossRevenue ?? 0, comboDiscount: rawGrossToNet?.comboDiscount ?? 0, barterDiscount: rawGrossToNet?.barterDiscount ?? 0, directIncentiveDiscount: rawGrossToNet?.directIncentiveDiscount ?? 0,
    creditLiberacao: rawGrossToNet?.creditLiberacao ?? 0, creditLiquidacao: rawGrossToNet?.creditLiquidacao ?? 0, netRevenue: rawGrossToNet?.netRevenue ?? 0, financialRevenue: rawGrossToNet?.financialRevenue ?? 0,
    distributorMargin: rawGrossToNet?.distributorMargin ?? 0, segmentAdjustment: rawGrossToNet?.segmentAdjustment ?? 0, paymentMethodMarkup: rawGrossToNet?.paymentMethodMarkup ?? 0,
    barterCost: rawGrossToNet?.barterCost ?? 0, netNetRevenue: rawGrossToNet?.netNetRevenue ?? 0,
  };

  // ─── Parity (with valorization + buyer fee) ───
  const selectedBuyer = useMemo(() => buyers?.find((b: any) => b.id === selectedBuyerId), [buyers, selectedBuyerId]);
  const buyerFee = selectedBuyer?.fee || 0;

  const selectedValorization = useMemo(() => {
    return valorizations?.find((v: any) => v.commodity?.toLowerCase() === selectedCommodity?.toLowerCase());
  }, [valorizations, selectedCommodity]);

  // ─── Commodity display data (for UI labels only — calculations are backend) ───
  const selectedCommodityPricing = useMemo(() => {
    if (!rawCommodityPricing?.length) return commodityPricing;
    const match = rawCommodityPricing.find((cp: any) => normalizeCommodityCode(cp.commodity) === normalizeCommodityCode(selectedCommodity));
    if (!match) return commodityPricing;
    return {
      commodity: match.commodity, exchange: match.exchange, contract: match.contract,
      exchangePrice: match.exchange_price, optionCost: match.option_cost || 0,
      exchangeRateBolsa: match.exchange_rate_bolsa,
      basisByPort: (match.basis_by_port || {}) as Record<string, number>,
      securityDeltaMarket: match.security_delta_market, securityDeltaFreight: match.security_delta_freight,
      stopLoss: match.stop_loss, bushelsPerTon: match.bushels_per_ton, pesoSacaKg: match.peso_saca_kg,
      volatility: match.volatility, riskFreeRate: match.risk_free_rate,
    };
  }, [rawCommodityPricing, selectedCommodity, commodityPricing]);

  const pricing = selectedCommodityPricing || null;
  const ports = simResult?.ports ?? (pricing ? Object.keys(pricing.basisByPort || {}) : []);

  useEffect(() => { if (ports.length && !port) setPort(ports[0]); }, [ports, port]);
  useEffect(() => { if (freightReducers.length && !freightOrigin) setFreightOrigin(freightReducers[0]?.origin || ''); }, [freightReducers, freightOrigin]);
  useEffect(() => { if (pricing?.volatility) setVolatility(pricing.volatility); }, [pricing?.volatility]);

  // Freight (display only — backend uses DB values for calculations)
  const freightReducer = useMemo(() => freightReducers.find(f => f.origin === freightOrigin), [freightReducers, freightOrigin]);

  // ─── Calculation results from backend ───
  const commodityNetPrice = simResult?.commodityNetPrice ?? 0;
  const ivp = simResult?.ivp ?? 1;
  const rawParity = simResult?.parity;
  const parity = { totalAmountBRL: rawParity?.totalAmountBRL ?? 0, commodityPricePerUnit: rawParity?.commodityPricePerUnit ?? 0, quantitySacas: rawParity?.quantitySacas ?? 0, referencePrice: rawParity?.referencePrice ?? 0, valorization: rawParity?.valorization ?? 0, userOverridePrice: rawParity?.userOverridePrice ?? null, hasExistingContract: rawParity?.hasExistingContract ?? false };
  const insurancePremium = simResult?.insurance ?? null;

  // ─── Formalization ───
  const wagonStages = useMemo(() => {
    if (!existingOp || !existingDocs) return [];
    if (!activeModules.length) return []; // No modules configured — block
    const docList = (existingDocs || []).map(d => ({ doc_type: d.doc_type, status: d.status }));
    return buildWagonStages(activeModules, existingOp.status as any, docList);
  }, [existingOp, existingDocs, activeModules]);

  const nextStatus = useMemo(() => {
    if (!existingOp || !existingDocs || !activeModules.length) return null;
    const docList = (existingDocs || []).map(d => ({ doc_type: d.doc_type, status: d.status }));
    return canAdvance(activeModules, existingOp.status as any, docList);
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
    if (['formalizado', 'garantido', 'faturado', 'monitorando', 'liquidado'].includes(nextStatus)) {
      const { data: persistedPricingSnapshot, error: snapshotErr } = await supabase
        .from('order_pricing_snapshots')
        .select('id')
        .eq('operation_id', operationId)
        .eq('snapshot_type', 'pricing_snapshot')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snapshotErr) {
        toast.error(`Falha ao validar snapshot de pricing: ${snapshotErr.message}`);
        return;
      }
      if (!persistedPricingSnapshot) {
        toast.error('Transição bloqueada: é obrigatório snapshot de pricing persistido para seguir para formalização/liquidação.');
        return;
      }
    }
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

  // ─── Save operation (uses server-authoritative simulation result) ───
  const handleSave = async (advanceToBarter = false) => {
    if (!user || !selectedCampaignId || !simResult || simResult.selections.length === 0) return;
    if (eligibility?.blocked) { toast.error('Operação bloqueada por elegibilidade'); return; }

    const counterparty = selectedBuyerId === '__other__' ? counterpartyOther : (simResult.buyers?.find(b => b.id === selectedBuyerId)?.buyerName || '');

    try {
      let opId = operationId;

      const items = simResult.pricingResults.map(pr => {
        const sel = simResult.selections.find(s => s.productId === pr.productId)!;
        return {
          operation_id: opId!,
          product_id: pr.productId,
          dose_per_hectare: sel.dosePerHectare,
          raw_quantity: sel.rawQuantity,
          rounded_quantity: sel.roundedQuantity,
          boxes: sel.boxes,
          pallets: sel.pallets,
          base_price: pr.basePrice,
          normalized_price: pr.normalizedPrice,
          interest_component: pr.interestComponent,
          margin_component: pr.marginComponent,
          subtotal: pr.subtotal,
        };
      });

      if (isNewOperation) {
        const op = await createOperation.mutateAsync({
          client_name: clientName || 'Sem nome',
          client_document: clientDocument || undefined, channel: channelEnum, distributor_id: selectedDistributorId || undefined, city: clientCity || undefined, area_hectares: effectiveArea,
          state: clientState || undefined, due_months: dueMonths,
          gross_revenue: grossToNet.grossRevenue, combo_discount: grossToNet.comboDiscount,
          net_revenue: grossToNet.netRevenue, financial_revenue: grossToNet.financialRevenue,
          distributor_margin: grossToNet.distributorMargin, commodity: normalizeCommodityCode(selectedCommodity) as any,
          total_sacas: insurancePremium?.totalSacas ?? parity.quantitySacas,
          commodity_price: parity.commodityPricePerUnit,
          reference_price: parity.referencePrice,
          has_existing_contract: hasContract,
          insurance_premium_sacas: insurancePremium?.additionalSacas ?? 0,
          due_date: selectedDueDate,
          counterparty,
          payment_method: resolvePaymentMethod(selectedPM?.method_name),
          status: currentStepDef.id === 'summary' ? 'pedido' as const : 'simulacao' as const,
        });
        opId = op.id;

        for (const item of items) item.operation_id = opId!;
        await createItems.mutateAsync(items);
      } else {
        if (existingOp?.status === 'simulacao') {
          await replaceItems.mutateAsync({ operationId: opId!, items });
        }

        await updateOperation.mutateAsync({
          id: opId!,
          updates: {
            client_name: clientName,
            client_document: clientDocument || undefined,
            channel: channelEnum,
            distributor_id: selectedDistributorId || undefined,
            
            city: clientCity,
            state: clientState,
            due_months: dueMonths,
            due_date: selectedDueDate,
            area_hectares: area,
            gross_revenue: grossToNet.grossRevenue,
            combo_discount: grossToNet.comboDiscount,
            net_revenue: grossToNet.netRevenue,
            financial_revenue: grossToNet.financialRevenue,
            distributor_margin: grossToNet.distributorMargin,
            commodity: normalizeCommodityCode(selectedCommodity) as any,
            total_sacas: insurancePremium?.totalSacas ?? parity.quantitySacas,
            commodity_price: parity.commodityPricePerUnit,
            reference_price: parity.referencePrice,
            has_existing_contract: hasContract,
            insurance_premium_sacas: insurancePremium?.additionalSacas ?? 0,
            counterparty,
            payment_method: resolvePaymentMethod(selectedPM?.method_name),
            status: existingOp?.status === 'simulacao' && currentStepDef.id === 'summary' ? 'pedido' : existingOp?.status,
          },
        });
      }

      // Save snapshot — persistir entradas + políticas resolvidas + outputs para replay/auditoria
      const pricingSnapshotEnvelope: Record<string, unknown> = {
        snapshotType: 'pricing_snapshot',
        metadata: {
          tenantId: (user.user_metadata as any)?.tenant_id || null,
          campaignId: selectedCampaignId,
          operationId: opId,
          decisionType: currentStepDef.id === 'summary' ? 'final_approval_simulation' : 'simulation',
          policyVersions: {
            eligibility: (simResult.resolvedPolicies as any)?.eligibility?.version ?? null,
            pricing: (simResult.resolvedPolicies as any)?.pricing?.version ?? null,
            formalization: (simResult.resolvedPolicies as any)?.formalization?.version ?? null,
          },
          actor: {
            userId: user.id,
            email: user.email || null,
          },
          createdAt: new Date().toISOString(),
        },
        inputs: {
          campaignId: selectedCampaignId,
          segment,
          channelSegmentName,
          distributorId: selectedDistributorId,
          dueMonths,
          dueDate: selectedDueDate,
          paymentMethodId: selectedPaymentMethod,
          commodityCode: selectedCommodity,
          port,
          freightOrigin,
          deliveryLocationId: selectedDeliveryLocationId,
          hasContract,
          userOverridePrice: userPrice,
          showInsurance,
          barterDiscountPercent: 0,
          buyerId: selectedBuyerId,
          contractPriceType,
          performanceIndex,
          clientContext: {
            clientType,
            state: clientState,
            city: clientCity,
            clientDocument,
          },
          selections: (simResult.selections || []).map((s) => ({
            productId: s.productId,
            dosePerHectare: s.dosePerHectare,
            areaHectares: s.areaHectares,
            overrideQuantity: s.rawQuantity,
          })),
        },
        resolvedPolicies: simResult.resolvedPolicies || {},
        outputs: simResult,
        ruleTrail: ((simResult as any).pricingDebugRows || []).map((row: any) => ({
          productId: row.productId,
          productName: row.productName,
          numbers: {
            basePrice: row.priceAfterFx,
            interestPerUnit: row.interestPerUnit,
            marginPerUnit: row.marginPerUnit,
            segmentAdjustmentPerUnit: row.segmentAdjPerUnit,
            paymentMarkupPerUnit: row.paymentMarkupPerUnit,
            normalizedPrice: row.normalizedPrice,
            subtotal: row.subtotal,
          },
          rules: {
            sourceField: row.sourceField,
            fxSourceUsed: row.fxSourceUsed,
            channelSegment: row.channelSegment,
            segmentName: row.segmentName,
            marginPercent: row.marginPercent,
            segmentAdjustmentPercent: row.segmentAdjustmentPercent,
            paymentMethodMarkupPercent: row.paymentMethodMarkupPercent,
            interestMultiplier: row.interestMultiplier,
            dueMonths: row.dueMonths,
          },
        })),
      };

      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(pricingSnapshotEnvelope)));
      const snapshotHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
      pricingSnapshotEnvelope.metadata = {
        ...(pricingSnapshotEnvelope.metadata as Record<string, unknown>),
        snapshotHash,
      };

      await supabase.from('order_pricing_snapshots').insert({
        operation_id: opId!,
        snapshot: pricingSnapshotEnvelope,
        snapshot_type: 'pricing_snapshot',
        created_by: user.id,
      });

      await createLog.mutateAsync({
        operation_id: opId!, user_id: user.id,
        action: isNewOperation ? (currentStepDef.id === 'summary' ? 'pedido_criado' : 'simulacao_criada') : 'operacao_atualizada',
        details: { area, segment, dueMonths, dueDate: selectedDueDate, productsCount: simResult.selections.length, paymentMethod: resolvePaymentMethod(selectedPM?.method_name) },
      });

      toast.success(isNewOperation ? 'Operação criada!' : 'Operação atualizada!');
      if (isNewOperation) navigate(`/operacao/${opId}`, { replace: true });
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  // ─── Step validation ───
  const canProceed = (stepId: string): boolean => {
    switch (stepId) {
      case 'context': return !!selectedCampaignId && !!clientName && !!selectedDistributorId && !eligibility?.blocked && !hasDueDateConfigIssue;
      case 'order': return selectedProducts.size > 0;
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

  // Montantes do pedido usam a moeda de saída informada pelo motor (server-authoritative)
  const moneyCurrency = simResult?.moneyCurrency || 'BRL';
  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: moneyCurrency });
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
        {!isNewOperation && operationId && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/operacao/${operationId}/analise-precos`}>Análise de cálculo</Link>
          </Button>
        )}
      </div>

      {/* Stepper bar — sticky with nav buttons */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md pb-2 pt-1 border-b border-border mb-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={goPrev} disabled={currentStep === 0} className="border-border h-7 px-2 shrink-0">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex items-center gap-1 overflow-x-auto flex-1">
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
          <Button size="sm" onClick={goNext} disabled={currentStep >= visibleSteps.length - 1 || !canProceed(currentStepDef.id)} className="bg-primary text-primary-foreground h-7 px-2 shrink-0">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div key={currentStepDef.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }}>

          {/* ═══ CONTEXT STEP ═══ */}
          <ContextStep
            isActive={currentStepDef.id === 'context'}
            selectedCampaignId={selectedCampaignId}
            onCampaignChange={v => { setSelectedCampaignId(v); setSelectedProducts(new Map()); }}
            activeCampaigns={activeCampaigns || []}
            onShowCampaignPreview={() => setShowCampaignPreview(true)}
            area={area}
            onAreaChange={setArea}
            comboQty={comboQty}
            onComboQtyChange={setComboQty}
            clientName={clientName}
            onClientNameChange={setClientName}
            clientDocument={clientDocument}
            onClientDocumentChange={setClientDocument}
            documentValid={documentValid}
            clientType={clientType}
            onClientTypeChange={setClientType}
            clientEmail={clientEmail}
            onClientEmailChange={setClientEmail}
            clientPhone={clientPhone}
            onClientPhoneChange={setClientPhone}
            clientIE={clientIE}
            onClientIEChange={setClientIE}
            deliveryAddress={deliveryAddress}
            onDeliveryAddressChange={setDeliveryAddress}
            clientState={clientState}
            onClientStateChange={setClientState}
            clientCity={clientCity}
            clientCityCode={clientCityCode}
            onCitySelect={(city, code) => { setClientCity(city); setClientCityCode(code); }}
            eligibleStates={eligibleStates}
            eligibleCitiesForState={eligibleCitiesForState}
            selectedDistributorId={selectedDistributorId}
            onDistributorChange={setSelectedDistributorId}
            campaignDistributors={campaignDistributors || []}
            channelSegmentName={channelSegmentName}
            channelMarginPercent={channelMarginPercent}
            channelAdjustmentPercent={channelAdjustmentPercent}
            segment={segment}
            onSegmentChange={setSegment}
            segmentOptions={segmentOptions}
            selectedCommodity={selectedCommodity}
            onCommodityChange={setSelectedCommodity}
            commodityOptions={commodityOptions}
            dueMonths={dueMonths}
            onDueMonthsChange={setDueMonths}
            dueDateOptions={dueDateOptions}
            eligibility={eligibility}
            hasWhitelist={hasWhitelist}
            clientWhitelistFull={clientWhitelistFull || null}
            formatCpfCnpj={formatCpfCnpj}
          />

          {/* ═══ ORDER STEP ═══ */}
          <OrderStep
            isActive={currentStepDef.id === 'order'}
            area={area}
            onAreaChange={setArea}
            comboQty={comboQty}
            onComboQtyChange={setComboQty}
            effectiveArea={effectiveArea}
            quantityMode={quantityMode}
            onQuantityModeChange={setQuantityMode}
            onSwitchToFreeMode={() => {
              if (quantityMode !== 'livre') {
                const nextFree = new Map(freeQuantities);
                selectedProducts.forEach((dose, id) => {
                  if (!nextFree.get(id)) {
                    const sel = simResult?.selections?.find((s: any) => s.productId === id);
                    const vol = sel?.roundedQuantity ?? Math.ceil(effectiveArea * dose);
                    nextFree.set(id, vol);
                  }
                });
                setFreeQuantities(nextFree);
              }
              setQuantityMode('livre');
            }}
            productGroups={productGroups}
            selectedProducts={selectedProducts}
            freeQuantities={freeQuantities}
            products={products}
            combos={combos}
            comboActivations={comboActivations}
            maxDiscount={maxDiscount}
            activatedDiscount={activatedDiscount}
            complementaryDiscount={complementaryDiscount}
            discountProgress={discountProgress}
            comboRecommendations={comboRecommendations}
            selections={selections}
            simResult={simResult}
            formatCurrency={formatCurrency}
            toggleProduct={toggleProduct}
            clearOrder={clearOrder}
            updateDoseForRef={updateDoseForRef}
            updateFreeQuantity={updateFreeQuantity}
            addPackagingVariant={addPackagingVariant}
            removePackagingVariant={removePackagingVariant}
            getPackageLabel={getPackageLabel}
            isPerAreaProduct={isPerAreaProduct}
            setSelectedProducts={setSelectedProducts}
            setFreeQuantities={setFreeQuantities}
          />

          {/* ═══ SIMULATION STEP ═══ */}
          {/* Discount never shown per product — only total in footer */}
          <SimulationStep
            isActive={currentStepDef.id === 'simulation' && selections.length > 0}
            products={products}
            pricingResults={pricingResults}
            grossToNet={grossToNet}
            formatCurrency={formatCurrency}
          />

          {/* ═══ PAYMENT STEP ═══ */}
          <PaymentStep
            isActive={currentStepDef.id === 'payment'}
            paymentMethods={paymentMethods}
            selectedPaymentMethod={selectedPaymentMethod}
            selectedPM={selectedPM}
            onPaymentMethodChange={setSelectedPaymentMethod}
            grossToNet={grossToNet}
            simLoading={simLoading}
            formatCurrency={formatCurrency}
            dueMonths={dueMonths}
            monthlyRate={rawCampaign?.interest_rate ?? 1.5}
          />

          {/* ═══ BARTER STEP (with buyer select + valorization) ═══ */}
          <BarterStep
            isActive={currentStepDef.id === 'barter'}
            freightOrigin={freightOrigin}
            onFreightOriginChange={setFreightOrigin}
            freightReducers={freightReducers}
            deliveryLocations={deliveryLocations}
            port={port}
            onPortChange={setPort}
            selectedBuyerId={selectedBuyerId}
            onBuyerChange={setSelectedBuyerId}
            buyers={buyers}
            counterpartyOther={counterpartyOther}
            onCounterpartyOtherChange={setCounterpartyOther}
            contractPriceType={contractPriceType}
            onContractPriceTypeChange={setContractPriceType}
            hasContract={hasContract}
            onHasContractChange={setHasContract}
            userPrice={userPrice}
            onUserPriceChange={setUserPrice}
            commodityNetPrice={commodityNetPrice}
            parity={parity}
            freightReducer={freightReducer}
            ivp={ivp}
            buyerFee={buyerFee}
            selectedValorization={selectedValorization}
            showInsurance={showInsurance}
            onShowInsuranceChange={setShowInsurance}
            insurancePremium={insurancePremium}
            formatCurrency={formatCurrency}
            priceTrail={pricing ? {
              exchangePrice: pricing.exchangePrice,
              exchange: pricing.exchange,
              contract: pricing.contract,
              exchangeRateBolsa: pricing.exchangeRateBolsa,
              basisByPort: pricing.basisByPort,
              securityDeltaMarket: pricing.securityDeltaMarket,
              securityDeltaFreight: pricing.securityDeltaFreight,
              bushelsPerTon: pricing.bushelsPerTon,
              pesoSacaKg: pricing.pesoSacaKg,
            } : null}
          />

          {/* ═══ FORMALIZATION STEP ═══ */}
          <FormalizationStep
            isActive={currentStepDef.id === 'formalization'}
            isNewOperation={isNewOperation}
            wagonStages={wagonStages}
            nextStatus={nextStatus}
            onAdvanceStatus={handleAdvanceStatus}
            docMap={docMap}
            emitting={emitting}
            onDocAction={handleDocAction}
            onCessaoNotify={async (docId, method) => {
              const existing = existingDocs?.find(d => d.id === docId);
              if (!existing) return;
              const docData = (existing as any).data || {};
              const update = method === 'tripartite'
                ? { counterparty_notified: true, cession_accepted: true, notification_method: 'tripartite', notified_at: new Date().toISOString() }
                : { counterparty_notified: true, notification_method: 'notificacao', notified_at: new Date().toISOString() };
              await supabase.from('operation_documents').update({ data: { ...docData, ...update } } as any).eq('id', docId);
              toast.success(method === 'tripartite' ? 'Cessão tripartite registrada' : 'Comprador notificado (notificação simples)');
              refetchDocs();
            }}
            performanceIndex={performanceIndex}
            onPerformanceIndexChange={setPerformanceIndex}
            aforoPercent={rawCampaign?.aforo_percent}
            netRevenue={grossToNet.netRevenue}
            quantitySacas={parity.quantitySacas}
            formatCurrency={formatCurrency}
            documentData={{
              clientName, clientDocument, clientCity, clientState,
              counterparty: selectedBuyerId === '__other__' ? counterpartyOther : (buyers?.find((b: any) => b.id === selectedBuyerId)?.buyer_name || ''),
              commodity: selectedCommodity, quantitySacas: parity.quantitySacas, commodityPrice: parity.commodityPricePerUnit,
              deliveryLocation: freightOrigin, dueDate: selectedDueDate || undefined,
              grossRevenue: grossToNet.grossRevenue, comboDiscount: grossToNet.comboDiscount, netRevenue: grossToNet.netRevenue,
              paymentMethod: selectedPM?.method_name,
              items: pricingResults.map(pr => {
                const prod = products.find(p => p.id === pr.productId);
                const sel = selections.find(s => s.productId === pr.productId);
                return { product: prod?.name || '', dose: `${sel?.dosePerHectare ?? 0}`, quantity: `${pr.quantity?.toFixed(0) ?? 0}`, price: formatCurrency(pr.normalizedPrice), subtotal: formatCurrency(pr.subtotal) };
              }),
            }}
          />

          {/* ═══ SUMMARY STEP ═══ */}
          <SummaryStep
            isActive={currentStepDef.id === 'summary'}
            clientName={clientName}
            area={area}
            selections={selections}
            grossToNet={grossToNet}
            parity={parity}
            insurancePremium={insurancePremium}
            consumptionLedger={simResult?.consumptionLedger}
            comboActivations={comboActivations}
            formatCurrency={formatCurrency}
          />
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

      {/* Campaign Preview Dialog */}
      <Dialog open={showCampaignPreview} onOpenChange={setShowCampaignPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{campaign?.name || 'Campanha'}</DialogTitle>
          </DialogHeader>
          {campaign && (
            <div className="space-y-5 text-sm">
              {/* Geral */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Parâmetros Gerais</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground text-xs">Safra</span><div className="font-medium">{rawCampaign?.season}</div></div>
                  <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground text-xs">Moeda</span><div className="font-medium">{campaign.currency || 'BRL'}</div></div>
                  <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground text-xs">Direcionamento</span><div className="font-medium capitalize">{campaign.target?.replace(/_/g, ' ')}</div></div>
                  <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground text-xs">Formato Lista</span><div className="font-medium">{rawCampaign?.price_list_format?.replace(/_/g, ' ')}</div></div>
                  {rawCampaign?.start_date && <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground text-xs">Início</span><div className="font-medium">{new Date(rawCampaign.start_date).toLocaleDateString('pt-BR')}</div></div>}
                  {rawCampaign?.end_date && <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground text-xs">Fim</span><div className="font-medium">{new Date(rawCampaign.end_date).toLocaleDateString('pt-BR')}</div></div>}
                  {rawCampaign?.commodities?.length > 0 && <div className="bg-muted/50 rounded p-2 col-span-2"><span className="text-muted-foreground text-xs">Commodities</span><div className="font-medium capitalize">{rawCampaign.commodities.join(', ')}</div></div>}
                </div>
              </div>

              {/* Elegibilidade */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Elegibilidade</h3>
                <div className="space-y-2">
                  {/* Tipo de cliente */}
                  {(rawCampaign?.client_type as string[] || []).length > 0 && (
                    <div><span className="text-muted-foreground text-xs">Tipo de Cliente</span><div className="flex flex-wrap gap-1 mt-1">{(rawCampaign?.client_type as string[]).map(t => <span key={t} className="engine-badge bg-primary/10 text-primary uppercase">{t}</span>)}</div></div>
                  )}
                   {/* Montante mínimo */}
                   {rawCampaign?.min_order_amount && Number(rawCampaign.min_order_amount) > 0 && (
                     <div><span className="text-muted-foreground text-xs">Montante Mínimo</span><div className="font-medium text-foreground mt-1">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: (campaign.currency || 'BRL') === 'USD' ? 'USD' : 'BRL' }).format(Number(rawCampaign.min_order_amount))}</div></div>
                   )}
                   {/* Canais — todos, com indicação ativo/inativo */}
                   {(channelTypesConfig || []).length > 0 && (
                     <div><span className="text-muted-foreground text-xs">Tipos de Canal (GTM)</span><div className="flex flex-wrap gap-1 mt-1">{channelTypesConfig!.map((ct: any) => <span key={ct.id} className={`engine-badge ${ct.active ? 'bg-accent/20 text-accent-foreground' : 'bg-muted text-muted-foreground line-through opacity-60'}`}>{ct.channel_type_name}{ct.model ? ` (${ct.model})` : ''}{ct.active ? '' : ' — inativo'}</span>)}</div></div>
                   )}
                   {/* Segmentos de canal — todos */}
                   {(channelSegmentsConfig || []).length > 0 && (
                     <div><span className="text-muted-foreground text-xs">Segmentos de Canal</span><div className="flex flex-wrap gap-1 mt-1">{channelSegmentsConfig!.map((cs: any) => <span key={cs.id} className={`engine-badge ${cs.active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground line-through opacity-60'}`}>{cs.channel_segment_name}{cs.active ? '' : ' — inativo'}</span>)}</div></div>
                   )}
                   {/* Segmentos comerciais — todos */}
                   {(campaignSegments || []).length > 0 && (
                     <div><span className="text-muted-foreground text-xs">Segmentos Comerciais</span><div className="flex flex-wrap gap-1 mt-1">{campaignSegments!.map((s: any) => <span key={s.id} className={`engine-badge ${s.active ? 'bg-info/10 text-info' : 'bg-muted text-muted-foreground line-through opacity-60'}`}>{s.segment_name}{s.active ? '' : ' — inativo'}</span>)}</div></div>
                   )}
                  {campaign.eligibility.states.length > 0 && (
                    <div><span className="text-muted-foreground text-xs">Estados</span><div className="flex flex-wrap gap-1 mt-1">{campaign.eligibility.states.map(s => <span key={s} className="engine-badge bg-primary/10 text-primary">{s}</span>)}</div></div>
                  )}
                  {campaign.eligibility.mesoregions.length > 0 && (
                    <div><span className="text-muted-foreground text-xs">Mesorregiões</span><div className="flex flex-wrap gap-1 mt-1">{campaign.eligibility.mesoregions.map(m => <span key={m} className="engine-badge bg-info/10 text-info">{m}</span>)}</div></div>
                  )}
                  {campaign.eligibility.distributorSegments.length > 0 && (
                    <div><span className="text-muted-foreground text-xs">Segmentos de Distribuidor</span><div className="flex flex-wrap gap-1 mt-1">{campaign.eligibility.distributorSegments.map(s => <span key={s} className="engine-badge bg-warning/10 text-warning capitalize">{s}</span>)}</div></div>
                  )}
                  {/* Segmentos de cliente */}
                  {campaign.eligibility.clientSegments.length > 0 && (
                    <div><span className="text-muted-foreground text-xs">Segmentos de Cliente</span><div className="flex flex-wrap gap-1 mt-1">{campaign.eligibility.clientSegments.map(s => <span key={s} className="engine-badge bg-muted text-foreground">{s}</span>)}</div></div>
                  )}
                  {campaign.availableDueDates.length > 0 && (
                    <div><span className="text-muted-foreground text-xs">Vencimentos</span><div className="flex flex-wrap gap-1 mt-1">{campaign.availableDueDates.map(d => <span key={d} className="engine-badge bg-muted text-muted-foreground">{new Date(d).toLocaleDateString('pt-BR')}</span>)}</div></div>
                  )}
                  {/* Whitelist */}
                  {hasWhitelist && (
                    <div><span className="text-muted-foreground text-xs">Whitelist de Clientes</span><div className="font-medium text-foreground mt-1">{clientWhitelistFull!.length} cliente(s) autorizados</div></div>
                  )}
                  {campaign.eligibility.states.length === 0 && campaign.eligibility.mesoregions.length === 0 && (
                    <p className="text-muted-foreground text-xs">Sem restrição territorial configurada.</p>
                  )}
                </div>
              </div>

              {/* Módulos */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Módulos Ativos</h3>
                {campaign.activeModules.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {campaign.activeModules.map((m, i) => (
                      <span key={m} className="engine-badge bg-primary/10 text-primary">{i + 1}. {m}</span>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground text-xs">Todos os módulos ativos (padrão).</p>}
              </div>

              {/* Combos */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Combos ({combos.length})</h3>
                {combos.length === 0 ? <p className="text-muted-foreground text-xs">Nenhum combo configurado.</p> : (
                  <div className="space-y-2">
                    {combos.map(combo => (
                      <div key={combo.id} className="bg-muted/50 rounded p-3">
                        <div className="font-medium text-foreground mb-1">{combo.name} <span className="text-xs text-muted-foreground">({combo.products.length} produtos)</span></div>
                        <div className="flex flex-wrap gap-1.5">
                          {combo.products.map((p: any) => {
                            const prod = products.find(pr => pr.id === p.productId);
                            return (
                              <span key={p.productId} className="text-xs bg-background rounded px-2 py-0.5 border border-border">
                                {prod?.name || p.productId} <span className="text-muted-foreground">({p.minDosePerHa}–{p.maxDosePerHa} {prod?.unitType || 'L'}/ha)</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Produtos */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Produtos ({products.length})</h3>
                {products.length === 0 ? <p className="text-muted-foreground text-xs">Nenhum produto vinculado.</p> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {products.map(p => (
                      <div key={p.id} className="bg-muted/50 rounded p-2">
                        <div className="font-medium text-foreground text-xs">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">{p.activeIngredient}</div>
                        <div className="flex gap-3 mt-1 text-[11px]">
                          <span>Categoria: <span className="text-foreground">{p.category}</span></span>
                          <span>Dose: <span className="font-mono text-foreground">{p.dosePerHectare} {p.unitType}/ha</span></span>
                          <span>Faixa: <span className="font-mono text-foreground">{p.minDose}–{p.maxDose}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
