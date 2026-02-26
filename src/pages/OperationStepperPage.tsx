import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
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
  const [clientCityCode, setClientCityCode] = useState('');
  const [clientState, setClientState] = useState('');
  const [clientType, setClientType] = useState<'PF' | 'PJ'>('PJ');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientIE, setClientIE] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedDistributorId, setSelectedDistributorId] = useState('');
  const [channelSegmentName, setChannelSegmentName] = useState('');
  const [channelMarginPercent, setChannelMarginPercent] = useState(0);
  const [channelAdjustmentPercent, setChannelAdjustmentPercent] = useState(0);
  const [segment, setSegment] = useState<string>(''); // segmento comercial
  const [channelEnum, setChannelEnum] = useState<ChannelSegment>('distribuidor'); // compat legado para telas antigas
  const [area, setArea] = useState(500);
  const [quantityMode, setQuantityMode] = useState<'dose' | 'livre'>('dose');
  const [freeQuantities, setFreeQuantities] = useState<Map<string, number>>(new Map());
  const [showCampaignPreview, setShowCampaignPreview] = useState(false);

  // ─── Order step state ───
  const [selectedProducts, setSelectedProducts] = useState<Map<string, number>>(new Map());

  // ─── Payment step state ───
  const [dueMonths, setDueMonths] = useState(12);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [selectedCommodity, setSelectedCommodity] = useState('');

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
  const replaceItems = useReplaceOperationItems();
  const createLog = useCreateOperationLog();
  const updateOperation = useUpdateOperation();

  // ─── Simulation Engine (server-authoritative — all calculations on backend) ───
  const { loading: simLoading, error: simError, result: simResult, simulateDebounced, clearResult: clearSimResult } = useSimulationEngine();

  // ─── Load existing operation data ───
  useEffect(() => {
    if (existingOp) {
      setSelectedCampaignId(existingOp.campaign_id);
      setClientName(existingOp.client_name || '');
      setClientDocument(existingOp.client_document || '');
      setClientCity(existingOp.city || '');
      setClientState(existingOp.state || '');
      if (existingOp.city && existingOp.state) {
        const cityMatch = getAllMunicipios().find(m => m.uf === existingOp.state && normalizeKey(m.name) === normalizeKey(existingOp.city || ''));
        setClientCityCode(cityMatch?.ibge || '');
      }
      setChannelEnum((existingOp.channel || 'distribuidor') as ChannelSegment);
      setSelectedDistributorId((existingOp as any).distributor_id || '');
      setChannelSegmentName((existingOp as any).channel_segment_name || '');
      setSegment((existingOp as any).commercial_segment_name || '');
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

  useEffect(() => {
    if (!isNewOperation) return;
    setClientState('');
    setClientCity('');
    setClientCityCode('');
    setSelectedProducts(new Map());
    setFreeQuantities(new Map());
  }, [selectedCampaignId, isNewOperation]);

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
      const { data } = await (supabase as any).from('campaign_channel_types').select('*').eq('campaign_id', selectedCampaignId).eq('active', true);
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
      const { data } = await (supabase as any).from('campaign_channel_segments').select('*').eq('campaign_id', selectedCampaignId).eq('active', true);
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
      area,
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
  }, [selectedCampaignId, selectedProducts, area, segment, channelEnum, dueMonths, selectedDueDate, selectedPaymentMethod,
      selectedCommodity, port, freightOrigin, selectedDeliveryLocationId, hasContract, userPrice, showInsurance,
      selectedBuyerId, contractPriceType, performanceIndex, clientState, selectedCityName,
      clientCityCode, usesIbgeCityEligibility, clientType, clientDocument, quantityMode, freeQuantities, selectedDistributorId, channelSegmentName]);

  // ─── Trigger simulation on input changes (server-authoritative) ───
  useEffect(() => {
    if (!selectedCampaignId || selectedProducts.size === 0 || !dueMonths || hasDueDateConfigIssue || !segment || !selectedDistributorId) return;
    if (lastSimulationKeyRef.current === simulationKey) return;
    lastSimulationKeyRef.current = simulationKey;

    const inputSelections = Array.from(selectedProducts.entries()).map(([id, dose]) => ({
      productId: id, dosePerHectare: dose, areaHectares: area,
      overrideQuantity: quantityMode === 'livre' ? (freeQuantities.get(id) || undefined) : undefined,
    }));
    simulateDebounced({
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
  }, [selectedCampaignId, selectedProducts, area, segment, channelEnum, dueMonths, selectedDueDate, selectedPaymentMethod,
      selectedCommodity, port, freightOrigin, selectedDeliveryLocationId, hasContract, userPrice, showInsurance,
      selectedBuyerId, contractPriceType, performanceIndex, clientState, selectedCityName,
      clientCityCode, usesIbgeCityEligibility, clientType, clientDocument, quantityMode, freeQuantities,
      simulationKey, hasDueDateConfigIssue, selectedDeliveryLocationId]);

  // ─── Eligibility from backend result ───
  const eligibility = simResult?.eligibility ?? null;

  // ─── Product selection ───

  const isPerAreaProduct = (product: Product) => (product.pricingBasis || 'por_hectare') === 'por_hectare';
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
    clearSimResult();
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
      const qty = quantityMode === 'livre' ? (freeQuantities.get(id) || Math.ceil(area * dose)) : Math.ceil(area * dose);
      return {
        productId: id, ref: prod.ref || '', product: prod,
        dosePerHectare: dose, areaHectares: area,
        rawQuantity: qty, roundedQuantity: qty, boxes: 0, pallets: 0,
      };
    }).filter(Boolean) as AgronomicSelection[];
    const acts = applyComboCascade(combos, localSels);
    const maxD = getMaxPossibleDiscount(combos);
    const actD = getActivatedDiscount(acts);
    const compD = getComplementaryDiscount(acts);
    return { activations: acts, maxDiscount: maxD, activatedDiscount: actD, complementaryDiscount: compD, progress: maxD > 0 ? (actD / maxD) * 100 : 0 };
  }, [combos, selectedProducts, products, area, quantityMode, freeQuantities]);

  // Prefer local instant values, fallback to backend
  const comboActivations = localComboResult?.activations ?? simResult?.comboActivations ?? [];
  const maxDiscount = localComboResult?.maxDiscount ?? simResult?.maxDiscount ?? 0;
  const activatedDiscount = localComboResult?.activatedDiscount ?? simResult?.activatedDiscount ?? 0;
  const complementaryDiscount = localComboResult?.complementaryDiscount ?? simResult?.complementaryDiscount ?? 0;
  const discountProgress = localComboResult?.progress ?? simResult?.discountProgress ?? 0;

  // Combo recommendations — use local selectedProducts for instant feedback, fall back to backend selections
  const localSelections = useMemo(() => {
    if (selections.length > 0) return selections;
    // Build lightweight selections from local state for instant combo hints
    return Array.from(selectedProducts.entries()).map(([id, dose]) => {
      const prod = products.find(p => p.id === id);
      return prod ? { productId: id, ref: prod.ref || '', product: prod, dosePerHectare: dose, areaHectares: area, rawQuantity: area * dose, roundedQuantity: area * dose, boxes: 0, pallets: 0 } : null;
    }).filter(Boolean) as any[];
  }, [selections, selectedProducts, products, area]);
  const comboRecommendations = useMemo(() => getComboRecommendations(combos, localSelections, products, area), [combos, localSelections, products, area]);

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
          campaign_id: selectedCampaignId, user_id: user.id, client_name: clientName || 'Sem nome',
          client_document: clientDocument || undefined, channel: channelEnum, distributor_id: selectedDistributorId || undefined, city: clientCity || undefined,
          state: clientState || undefined, due_months: dueMonths, area_hectares: area,
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

      // Save snapshot — entire simulation result IS the authoritative snapshot
      await supabase.from('order_pricing_snapshots').insert({
        operation_id: opId!,
        snapshot: simResult as any,
        snapshot_type: isNewOperation ? 'simulation' : 'order',
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
          {currentStepDef.id === 'context' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="glass-card p-4 lg:col-span-2">
                  <label className="stat-label">Campanha</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Select value={selectedCampaignId} onValueChange={v => { setSelectedCampaignId(v); setSelectedProducts(new Map()); }}>
                      <SelectTrigger className="bg-muted border-border text-foreground flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {activeCampaigns?.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.season})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedCampaignId && (
                      <Button variant="outline" size="icon" className="shrink-0 h-9 w-9 border-border" onClick={() => setShowCampaignPreview(true)} title="Ver parâmetros da campanha">
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Área (ha)</label>
                  <NumericInput value={area} onChange={v => setArea(v)} min={1} decimals={0} className="mt-1 bg-muted border-border text-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-4">
                  <label className="stat-label">Nome do Cliente</label>
                  {hasWhitelist ? (
                    <Select value={clientDocument} onValueChange={v => {
                      const entry = clientWhitelistFull?.find(c => c.document === v);
                      setClientDocument(formatCpfCnpj(v));
                      if (entry) setClientName(entry.name);
                    }}>
                      <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {(clientWhitelistFull || []).map(c => (
                          <SelectItem key={c.document} value={c.document}>{c.name} ({formatCpfCnpj(c.document)})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Produtor/Empresa" className="mt-1 bg-muted border-border text-foreground" />
                  )}
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">CPF/CNPJ</label>
                  {hasWhitelist ? (
                    <Input value={clientDocument} readOnly className="mt-1 bg-muted border-border text-foreground opacity-70 cursor-not-allowed" />
                  ) : (
                    <>
                      <Input value={clientDocument} onChange={e => setClientDocument(formatCpfCnpj(e.target.value))} placeholder="Documento" className={`mt-1 bg-muted border-border text-foreground ${!documentValid ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                      {!documentValid && <p className="text-[11px] text-destructive mt-1">{documentDigits.length === 11 ? 'CPF inválido' : 'CNPJ inválido'}</p>}
                    </>
                  )}
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
                  <Select value={clientState} onValueChange={v => { setClientState(v); setClientCity(''); setClientCityCode(''); }}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione o estado" /></SelectTrigger>
                    <SelectContent className="bg-popover z-50 max-h-[300px]">
                      {eligibleStates.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Cidade</label>
                  <Select value={clientCityCode} onValueChange={v => { setClientCityCode(v); const found = eligibleCitiesForState.find(m => m.ibge === v); setClientCity(found?.name || ''); }} disabled={!clientState}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder={clientState ? 'Selecione a cidade' : 'Selecione o estado primeiro'} /></SelectTrigger>
                    <SelectContent className="bg-popover z-50 max-h-[300px]">
                      {eligibleCitiesForState.map(m => <SelectItem key={m.ibge} value={m.ibge}>{m.name}</SelectItem>)}
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
                  <label className="stat-label">Distribuidor / Canal</label>
                  <Select value={selectedDistributorId} onValueChange={setSelectedDistributorId}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{(campaignDistributors || []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.short_name || d.full_name} ({d.cnpj})</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-2">Segmento canal: {channelSegmentName || '—'} · Margem: {channelMarginPercent}% · Ajuste: {channelAdjustmentPercent}%</p>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Segmento Comercial</label>
                  <Select value={segment} onValueChange={setSegment}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{segmentOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
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
                <div className="glass-card p-4">
                  <label className="stat-label">Vencimento</label>
                  <Select value={String(dueMonths)} onValueChange={v => setDueMonths(Number(v))} disabled={dueDateOptions.length === 0}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder={dueDateOptions.length === 0 ? 'Sem vencimentos configurados' : undefined} /></SelectTrigger>
                    <SelectContent>{dueDateOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {dueDateOptions.length === 0 && <p className="text-[11px] text-destructive mt-2">Campanha sem vencimentos configurados.</p>}
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
                      <button onClick={() => setQuantityMode('dose')} className={`px-3 py-1 text-xs font-medium transition-colors ${quantityMode === 'dose' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Área × Dose/Qtd</button>
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
                    {/* All available combos sorted by discount */}
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {[...comboActivations]
                        .sort((a, b) => b.discountPercent - a.discountPercent)
                        .map(ca => {
                          const comboDef = combos.find(c => c.id === ca.comboId);
                          const comboProducts = comboDef?.products || [];
                          const missingRefs = ca.applied ? [] : comboProducts
                            .filter((cp: any) => !selections.some(s => (s.ref || '').toUpperCase().trim() === (cp.ref || '').toUpperCase().trim()))
                            .map((cp: any) => {
                              const prod = products.find(p => (p.ref || '').toUpperCase().trim() === (cp.ref || '').toUpperCase().trim());
                              return prod?.name || cp.ref;
                            });
                          const handleComboClick = () => {
                            if (ca.applied) return;
                            // Batch all products into a single state update
                            const nextProducts = new Map(selectedProducts);
                            const nextFree = new Map(freeQuantities);
                            for (const cp of comboProducts) {
                              const ref = (cp.ref || '').toUpperCase().trim();
                              const prod = products.find(p => (p.ref || '').toUpperCase().trim() === ref);
                              if (!prod) continue;
                              const minDose = cp.minDosePerHa || prod.minDose || prod.dosePerHectare;
                              if (!nextProducts.has(prod.id)) {
                                nextProducts.set(prod.id, minDose);
                                if (quantityMode === 'livre') {
                                  nextFree.set(prod.id, Math.ceil(area * minDose));
                                }
                              } else {
                                const currentDose = nextProducts.get(prod.id) ?? 0;
                                if (currentDose < minDose) {
                                  nextProducts.set(prod.id, minDose);
                                  if (quantityMode === 'livre') {
                                    nextFree.set(prod.id, Math.ceil(area * minDose));
                                  }
                                }
                              }
                            }
                            setSelectedProducts(nextProducts);
                            setFreeQuantities(nextFree);
                          };
                          return (
                            <button
                              key={ca.comboId}
                              onClick={handleComboClick}
                              title={ca.applied ? 'Ativado' : `Clique para adicionar: ${missingRefs.join(', ')}`}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                                ca.applied
                                  ? 'bg-success/15 text-success border border-success/30 cursor-default'
                                  : 'bg-muted text-muted-foreground border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 cursor-pointer'
                              }`}
                            >
                              {ca.comboName} ({ca.discountPercent}%)
                              {ca.applied ? ' ✓' : ' +'}
                            </button>
                          );
                        })}
                    </div>
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
                  const simPricing = simResult?.pricingResults?.find((p: any) => p.productId === product.id);
                  const displayPrice = simPricing?.normalizedPrice ?? product.pricePerUnit;
                  return (
                    <div key={product.id} className={`glass-card p-4 cursor-pointer transition-all ${isSelected ? 'glow-border' : 'hover:border-muted-foreground/30'}`} onClick={() => !isSelected && toggleProduct(product.id)}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-foreground">{product.name}</span>
                        {isSelected ? <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); toggleProduct(product.id); }} className="text-destructive h-6 w-6 p-0"><Minus className="w-3 h-3" /></Button>
                          : <Button size="sm" variant="ghost" className="text-success h-6 w-6 p-0"><Plus className="w-3 h-3" /></Button>}
                      </div>
                      <div className="text-xs text-muted-foreground">{product.category} — {formatCurrency(displayPrice)}/{product.unitType}</div>
                      {isSelected && (
                        <div className="mt-2 pt-2 border-t border-border space-y-2">
                          {quantityMode === 'dose' ? (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground w-24">{isPerAreaProduct(product) ? 'Dose/ha:' : 'Quantidade:'}</label>
                              <NumericInput value={dose} onChange={v => updateDose(product.id, v)} decimals={2} className="h-7 bg-muted border-border text-xs text-foreground" />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground w-16">Qtd ({product.unitType}):</label>
                              <NumericInput value={freeQuantities.get(product.id) || 0} onChange={v => updateFreeQuantity(product.id, v)} decimals={0} placeholder="0" className="h-7 bg-muted border-border text-xs text-foreground" />
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
              <div className="glass-card p-4 relative">
                {simLoading && <div className="absolute inset-0 bg-background/50 backdrop-blur-sm rounded-lg flex items-center justify-center z-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
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
                {freightReducer && freightReducer.totalReducer > 0 && (
                  <div className="glass-card p-4">
                    <div className="text-xs text-muted-foreground">Redutor logístico: R$ {freightReducer.totalReducer.toFixed(2)}/sc ({freightReducer.distanceKm}km) — Porto: {port || '—'}</div>
                  </div>
                )}
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
                  {hasContract && <NumericInput value={userPrice} onChange={setUserPrice} decimals={2} prefix="R$" placeholder="0,00" className="bg-muted border-border text-foreground" />}
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
                          <NumericInput value={performanceIndex} onChange={setPerformanceIndex} min={0} max={100} decimals={0} className="h-8 w-20 bg-muted border-border text-xs text-foreground" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div>
                        <div className="stat-label">Aforo Exigido</div>
                        <div className="font-mono text-foreground">{rawCampaign?.aforo_percent ?? '—'}%</div>
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
              {simResult?.consumptionLedger && Object.keys(simResult.consumptionLedger).length > 0 && (
                <div className="glass-card p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Ledger de Consumo (Combos)</h3>
                  {Object.entries(simResult.consumptionLedger).map(([comboId, refs]) => {
                    const ca = comboActivations.find(a => a.comboId === comboId);
                    return (
                      <div key={comboId} className="mb-2">
                        <div className="text-xs font-medium text-foreground">{ca?.comboName || comboId}</div>
                        <div className="flex gap-2 mt-1">
                          {Object.entries(refs as Record<string, number>).map(([ref, qty]) => <span key={ref} className="engine-badge bg-muted text-muted-foreground text-xs">{ref}: {qty.toFixed(0)}</span>)}
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
                    <div><span className="text-muted-foreground text-xs">Montante Mínimo</span><div className="font-medium text-foreground mt-1">Configurado</div></div>
                  )}
                  {/* Canais ativos */}
                  {(channelTypesConfig || []).length > 0 && (
                    <div><span className="text-muted-foreground text-xs">Tipos de Canal (GTM)</span><div className="flex flex-wrap gap-1 mt-1">{channelTypesConfig!.map((ct: any) => <span key={ct.id} className="engine-badge bg-accent/20 text-accent-foreground">{ct.channel_type_name} ({ct.model})</span>)}</div></div>
                  )}
                  {/* Segmentos de canal ativos */}
                  {(channelSegmentsConfig || []).length > 0 && (
                    <div><span className="text-muted-foreground text-xs">Segmentos de Canal</span><div className="flex flex-wrap gap-1 mt-1">{channelSegmentsConfig!.map((cs: any) => <span key={cs.id} className="engine-badge bg-success/10 text-success">{cs.channel_segment_name}</span>)}</div></div>
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
