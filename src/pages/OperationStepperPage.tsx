import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
import { useOperation, useOperationItems, useOperationDocuments, useCreateOperation, useCreateOperationItems, useCreateOperationLog, useUpdateOperation } from '@/hooks/useOperations';
import { calculateAgronomicSelection } from '@/engines/agronomic';
import { applyComboCascadeWithLedger, getSuggestedDoseForRef, getMaxPossibleDiscount, getActivatedDiscount, getComplementaryDiscount } from '@/engines/combo-cascade';
import { decomposePricing, calculateGrossToNet, generatePriceAuditTrail } from '@/engines/pricing';
import { checkEligibility } from '@/engines/eligibility';
import { buildSnapshot } from '@/engines/snapshot';
import { calculateCommodityNetPrice, calculateParity, blackScholes } from '@/engines/parity';
import { buildWagonStages, canAdvance, getBlockingReason } from '@/engines/orchestrator';
import type { AgronomicSelection, ChannelSegment, Product, JourneyModule, DocumentType, CommodityPricing, FreightReducer } from '@/types/barter';
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
  Zap
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

const allDocTypes: { type: DocumentType; label: string }[] = [
  { type: 'termo_adesao', label: 'Termo de Adesão' },
  { type: 'pedido', label: 'Pedido de Compra' },
  { type: 'termo_barter', label: 'Termo de Barter' },
  { type: 'ccv', label: 'CCV' },
  { type: 'cessao_credito', label: 'Cessão de Crédito' },
  { type: 'cpr', label: 'CPR' },
  { type: 'duplicata', label: 'Duplicata' },
  { type: 'certificado_aceite', label: 'Certificado de Aceite' },
];

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
  const { campaign, rawCampaign, products, combos, commodityPricing, rawCommodityPricing, freightReducers, deliveryLocations, isLoading: loadingData } = useCampaignData(selectedCampaignId || undefined);

  // ─── Context step state ───
  const [clientName, setClientName] = useState('');
  const [clientDocument, setClientDocument] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientState, setClientState] = useState('');
  const [segment, setSegment] = useState<ChannelSegment>('distribuidor');
  const [area, setArea] = useState(500);

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
      setSegment((existingOp.channel || 'distribuidor') as ChannelSegment);
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
  const { data: campaignDueDates } = useQuery({
    queryKey: ['campaign-due-dates-sim', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data } = await supabase.from('campaign_due_dates').select('*').eq('campaign_id', selectedCampaignId);
      return data || [];
    },
  });

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

  // ─── Active modules → visible steps ───
  const activeModules: JourneyModule[] = rawCampaign?.active_modules as JourneyModule[] || [];
  const visibleSteps = STEPS.filter(s => !s.module || activeModules.length === 0 || activeModules.includes(s.module));

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

  const paymentMethodMarkup = selectedPM?.markup_percent || 0;

  const dueDateOptions = useMemo(() => {
    if (campaignDueDates?.length) {
      const uniqueDates = [...new Set(campaignDueDates.map(d => d.due_date))].sort();
      return uniqueDates.map(d => {
        const date = new Date(d + 'T00:00:00');
        const diffDays = Math.max(Math.round((date.getTime() - Date.now()) / 86400000), 1);
        return { value: String(parseFloat((diffDays / 30).toFixed(4))), label: `${date.toLocaleDateString('pt-BR')} (${diffDays}d)`, date: d };
      });
    }
    return [];
  }, [campaignDueDates]);

  const segmentOptions = useMemo(() => {
    if (campaignSegments?.length) return campaignSegments.filter(s => s.active).map(s => ({ value: s.segment_name, label: s.segment_name }));
    if (campaign?.margins?.length) return campaign.margins.map(m => ({ value: m.segment, label: m.segment }));
    return [];
  }, [campaignSegments, campaign]);

  // ─── Eligibility ───
  const eligibility = useMemo(() => {
    if (!campaign) return null;
    return checkEligibility(campaign, {
      state: clientState || undefined,
      city: clientCity || undefined,
      segment,
      clientDocument: clientDocument || undefined,
      whitelist: clientWhitelist || [],
      blockIneligible: !!(rawCampaign as any)?.block_ineligible,
    });
  }, [campaign, clientState, clientCity, segment, clientDocument, clientWhitelist, rawCampaign]);

  // ─── Product selection ───
  const toggleProduct = (productId: string) => {
    const next = new Map(selectedProducts);
    if (next.has(productId)) { next.delete(productId); } else {
      const prod = products.find(p => p.id === productId)!;
      const suggested = getSuggestedDoseForRef(combos, prod.ref || '');
      next.set(productId, suggested ?? prod.dosePerHectare);
    }
    setSelectedProducts(next);
  };

  const updateDose = (productId: string, dose: number) => {
    const next = new Map(selectedProducts);
    next.set(productId, dose);
    setSelectedProducts(next);
  };

  // ─── Engine calculations ───
  const selections = useMemo<AgronomicSelection[]>(() => {
    return Array.from(selectedProducts.entries()).map(([id, dose]) => {
      const product = products.find(p => p.id === id);
      if (!product) return null;
      return calculateAgronomicSelection(product, area, dose);
    }).filter(Boolean) as AgronomicSelection[];
  }, [selectedProducts, area, products]);

  const comboCascade = useMemo(() => applyComboCascadeWithLedger(combos, selections), [combos, selections]);
  const comboActivations = comboCascade.activations;
  const maxDiscount = getMaxPossibleDiscount(combos);
  const activatedDiscount = getActivatedDiscount(comboActivations);
  const complementaryDiscount = getComplementaryDiscount(comboActivations);
  const discountProgress = maxDiscount > 0 ? (activatedDiscount / maxDiscount) * 100 : 0;

  const pricingResults = useMemo(() => {
    if (!campaign) return [];
    return selections.map(sel => decomposePricing(sel.product, campaign, segment, dueMonths, sel.roundedQuantity, { paymentMethodMarkup, segmentAdjustmentPercent }));
  }, [selections, segment, dueMonths, campaign, paymentMethodMarkup, segmentAdjustmentPercent]);

  const grossToNet = useMemo(() => calculateGrossToNet(pricingResults, comboActivations, 0, {
    globalIncentiveType: rawCampaign?.global_incentive_type || '',
    globalIncentive1: rawCampaign?.global_incentive_1 || 0,
    globalIncentive2: rawCampaign?.global_incentive_2 || 0,
    globalIncentive3: rawCampaign?.global_incentive_3 || 0,
  }, selections), [pricingResults, comboActivations, rawCampaign, selections]);

  // ─── Parity ───
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

  const freightReducer = freightReducers.find(f => f.origin === freightOrigin);
  const commodityNetPrice = useMemo(() => calculateCommodityNetPrice(pricing, port, freightReducer), [pricing, port, freightReducer]);
  const parity = useMemo(() => calculateParity(grossToNet.netRevenue, commodityNetPrice, hasContract ? userPrice : undefined, grossToNet.grossRevenue), [grossToNet, commodityNetPrice, hasContract, userPrice]);

  const insurancePremium = useMemo(() => {
    if (!showInsurance) return null;
    const spotPrice = pricing.exchangePrice * pricing.exchangeRateBolsa;
    if (spotPrice <= 0) return null;
    const premium = blackScholes(spotPrice, spotPrice * 1.05, 0.5, 0.1175, volatility / 100, true);
    const premiumPerSaca = commodityNetPrice > 0 ? premium / commodityNetPrice : 0;
    const additionalSacas = Math.ceil(premiumPerSaca * parity.quantitySacas);
    return { premiumPerSaca: premium, additionalSacas, totalSacas: parity.quantitySacas + additionalSacas };
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
    try {
      const existing = existingDocs?.find(d => d.doc_type === docType);
      if (action === 'emit') {
        if (existing) {
          await supabase.from('operation_documents').update({ status: 'emitido', generated_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await supabase.from('operation_documents').insert({ operation_id: operationId, doc_type: docType, status: 'emitido', generated_at: new Date().toISOString() });
        }
      } else if (action === 'sign' && existing) {
        await supabase.from('operation_documents').update({ status: 'assinado', signed_at: new Date().toISOString() }).eq('id', existing.id);
      } else if (action === 'validate' && existing) {
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
    await supabase.from('operations').update({ status: nextStatus }).eq('id', operationId);
    await supabase.from('operation_logs').insert({ operation_id: operationId, user_id: user.id, action: `status_avancado_${nextStatus}`, details: { to: nextStatus } });
    queryClient.invalidateQueries({ queryKey: ['operations'] });
    refetchDocs();
    toast.success(`Avançado para: ${nextStatus}`);
  };

  // ─── Save operation ───
  const handleSave = async (advanceToBarter = false) => {
    if (!user || !selectedCampaignId || selections.length === 0) return;
    if (eligibility?.blocked) { toast.error('Operação bloqueada por elegibilidade'); return; }

    try {
      let opId = operationId;

      if (isNewOperation) {
        const op = await createOperation.mutateAsync({
          campaign_id: selectedCampaignId, user_id: user.id, client_name: clientName || 'Sem nome',
          client_document: clientDocument || undefined, channel: segment, city: clientCity || undefined,
          state: clientState || undefined, due_months: dueMonths, area_hectares: area,
          gross_revenue: grossToNet.grossRevenue, combo_discount: grossToNet.comboDiscount,
          net_revenue: grossToNet.netRevenue, financial_revenue: grossToNet.financialRevenue,
          distributor_margin: grossToNet.distributorMargin, commodity: selectedCommodity as any,
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
          channel: segment, city: clientCity, state: clientState, due_months: dueMonths,
          area_hectares: area, gross_revenue: grossToNet.grossRevenue, combo_discount: grossToNet.comboDiscount,
          net_revenue: grossToNet.netRevenue, financial_revenue: grossToNet.financialRevenue,
          distributor_margin: grossToNet.distributorMargin, commodity: selectedCommodity as any,
          total_sacas: insurancePremium?.totalSacas ?? parity.quantitySacas,
          commodity_price: parity.commodityPricePerUnit, reference_price: parity.referencePrice,
          has_existing_contract: hasContract, insurance_premium_sacas: insurancePremium?.additionalSacas ?? 0,
          payment_method: 'barter' as const,
        });
      }

      // Save snapshot
      const snapshot = buildSnapshot({
        campaign: campaign!, rawCampaign, selections, pricingResults,
        comboActivations, comboDefinitions: combos, eligibility: eligibility!,
        grossToNet, consumptionLedger: comboCascade.consumptionLedger,
        orderContext: { clientName, clientDocument, channel: segment, state: clientState, city: clientCity, areaHectares: area, dueMonths, commodity: selectedCommodity },
        parity, insurance: insurancePremium ? { premiumPerSaca: insurancePremium.premiumPerSaca, additionalSacas: insurancePremium.additionalSacas, totalSacas: insurancePremium.totalSacas, volatility } : undefined,
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
                  <label className="stat-label">Cidade</label>
                  <Input value={clientCity} onChange={e => setClientCity(e.target.value)} className="mt-1 bg-muted border-border text-foreground" />
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Estado (UF)</label>
                  <Input value={clientState} onChange={e => setClientState(e.target.value.toUpperCase())} maxLength={2} className="mt-1 bg-muted border-border text-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4">
                  <label className="stat-label">Canal</label>
                  <Select value={segment} onValueChange={v => setSegment(v as ChannelSegment)}>
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
              {combos.length > 0 && (
                <div className="glass-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-foreground flex items-center gap-2"><TrendingUp className="w-4 h-4 text-success" /> Combos</span>
                    <span className="font-mono text-sm text-success font-bold">{activatedDiscount.toFixed(1)}% / {maxDiscount}%{complementaryDiscount > 0 && <span className="ml-2 text-info">+ {complementaryDiscount.toFixed(1)}%</span>}</span>
                  </div>
                  <Progress value={discountProgress} className="h-2.5 bg-muted" />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {comboActivations.map(ca => <span key={ca.comboId} className={`engine-badge text-xs ${ca.applied ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{ca.comboName} ({ca.discountPercent}%) {ca.applied ? '✓' : ''}</span>)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {products.map(product => {
                  const isSelected = selectedProducts.has(product.id);
                  const dose = selectedProducts.get(product.id) ?? product.dosePerHectare;
                  const selection = selections.find(s => s.productId === product.id);
                  return (
                    <div key={product.id} className={`glass-card p-4 cursor-pointer transition-all ${isSelected ? 'glow-border' : 'hover:border-muted-foreground/30'}`} onClick={() => !isSelected && toggleProduct(product.id)}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-foreground">{product.name}</span>
                        {isSelected ? <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); toggleProduct(product.id); }} className="text-destructive h-6 w-6 p-0"><Minus className="w-3 h-3" /></Button>
                          : <Button size="sm" variant="ghost" className="text-success h-6 w-6 p-0"><Plus className="w-3 h-3" /></Button>}
                      </div>
                      <div className="text-xs text-muted-foreground">{product.category} — {product.currency === 'USD' ? 'US$' : 'R$'} {product.pricePerUnit.toFixed(2)}/{product.unitType}</div>
                      {isSelected && selection && (
                        <div className="mt-2 pt-2 border-t border-border space-y-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground w-16">Dose/ha:</label>
                            <Input type="number" value={dose} step={0.05} min={product.minDose} max={product.maxDose} onChange={e => { e.stopPropagation(); updateDose(product.id, Number(e.target.value)); }} onClick={e => e.stopPropagation()} className="h-7 bg-muted border-border font-mono text-xs text-foreground" />
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-xs">
                            <div className="bg-muted/50 rounded p-1 text-center"><div className="text-muted-foreground">Vol</div><div className="font-mono text-foreground">{selection.roundedQuantity.toFixed(0)}</div></div>
                            <div className="bg-muted/50 rounded p-1 text-center"><div className="text-muted-foreground">Cx</div><div className="font-mono text-foreground">{selection.boxes}</div></div>
                            <div className="bg-muted/50 rounded p-1 text-center"><div className="text-muted-foreground">Plt</div><div className="font-mono text-foreground">{selection.pallets}</div></div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ SIMULATION STEP ═══ */}
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
                <div><div className="stat-label">Desc. Combo</div><div className="font-mono font-bold text-warning">-{formatCurrency(grossToNet.comboDiscount)}</div></div>
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

          {/* ═══ BARTER STEP ═══ */}
          {currentStepDef.id === 'barter' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4">
                  <label className="stat-label">Porto</label>
                  <Select value={port} onValueChange={setPort}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>{ports.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="glass-card p-4">
                  <label className="stat-label">Origem Frete</label>
                  <Select value={freightOrigin} onValueChange={setFreightOrigin}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>{freightReducers.map(f => <SelectItem key={f.origin} value={f.origin}>{f.origin} → {f.destination} ({f.distanceKm}km)</SelectItem>)}</SelectContent>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4"><div className="stat-label">Preço Net/sc</div><div className="font-mono text-lg font-bold text-foreground">{formatCurrency(commodityNetPrice)}</div></div>
                <div className="glass-card p-4"><div className="stat-label">Sacas</div><div className="font-mono text-lg font-bold text-success">{parity.quantitySacas.toLocaleString('pt-BR')}</div></div>
                <div className="glass-card p-4"><div className="stat-label">Preço Valorizado</div><div className="font-mono text-lg font-bold text-info">{formatCurrency(parity.referencePrice)}</div></div>
                <div className="glass-card p-4"><div className="stat-label">Valorização</div><div className={`font-mono text-lg font-bold ${parity.valorization >= 0 ? 'text-success' : 'text-destructive'}`}>{parity.valorization.toFixed(1)}%</div></div>
              </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allDocTypes.map(doc => {
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
                        <div className="flex gap-2">
                          {status === 'pendente' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => handleDocAction(doc.type, 'emit')}>{emitting === doc.type ? '...' : 'Emitir'}</Button>}
                          {status === 'emitido' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => handleDocAction(doc.type, 'sign')}><PenLine className="w-3 h-3 mr-1" />Assinar</Button>}
                          {status === 'assinado' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => handleDocAction(doc.type, 'validate')}><ShieldCheck className="w-3 h-3 mr-1" />Validar</Button>}
                        </div>
                      </div>
                    );
                  })}
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
                  <div><div className="stat-label">Desconto</div><div className="font-mono text-warning">-{formatCurrency(grossToNet.comboDiscount)}</div></div>
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
