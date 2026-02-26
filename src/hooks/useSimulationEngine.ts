import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── TYPES (mirror backend response) ───
export interface SimulationSelection {
  productId: string;
  dosePerHectare: number;
  areaHectares: number;
  overrideQuantity?: number;
}

export interface AgronomicResult {
  productId: string; ref: string; productName: string; areaHectares: number;
  dosePerHectare: number; rawQuantity: number; roundedQuantity: number;
  boxes: number; pallets: number; packageSize: number; unitType: string;
}

export interface ComboActivationResult {
  comboId: string; comboName: string; discountPercent: number;
  matchedProducts: string[]; applied: boolean; isComplementary: boolean;
  activatedHectares?: number; proportionalHectares?: number;
}

export interface PricingResultItem {
  productId: string; basePrice: number; normalizedPrice: number;
  interestComponent: number; marginComponent: number;
  segmentAdjustmentComponent: number; paymentMethodComponent: number;
  commercialPrice: number; quantity: number; subtotal: number;
}

export interface PricingDebugRow {
  productId: string; code: string; ref: string; productName: string; unitType: string;
  quantity: number; boxes: number; pallets: number;
  sourceField: 'price_cash' | 'price_term' | 'price_per_unit';
  sourceValue: number; listCurrency: 'BRL' | 'USD';
  exchangeRateProducts: number; priceAfterFx: number;
  dueMonths: number; campaignMonthlyRatePercent: number; paymentMethodAnnualRatePercent: number;
  paymentMethodMonthlyRatePercent: number; interestMultiplier: number;
  interestPerUnit: number; priceWithInterest: number;
  channelSegment: string; marginPercent: number; marginPerUnit: number; priceWithMargin: number;
  segmentName: string; segmentAdjustmentPercent: number; segmentAdjPerUnit: number; priceWithSegAdj: number;
  paymentMethodMarkupPercent: number; paymentMarkupPerUnit: number;
  normalizedPrice: number; subtotal: number;
  feesOkenPercent: number;
  g2nComboDiscountAllocated: number; g2nBarterDiscountAllocated: number;
  g2nDirectIncentiveAllocated: number; g2nNetRevenueAllocated: number;
  parityCommodity: string | null; parityPricePerSaca: number | null;
  fxSourceUsed: 'products' | 'barter'; pricingPlaza: string | null;
}

export interface GrossToNetResult {
  grossRevenue: number; comboDiscount: number; barterDiscount: number;
  directIncentiveDiscount: number; creditLiberacao: number; creditLiquidacao: number;
  netRevenue: number; financialRevenue: number; distributorMargin: number;
  segmentAdjustment: number; paymentMethodMarkup: number; barterCost: number;
  netNetRevenue: number;
}

export interface EligibilityResult {
  eligible: boolean; blocked: boolean;
  flags: Record<string, boolean>; warnings: string[];
}

export interface ParityResult {
  totalAmountBRL: number; commodityPricePerUnit: number; quantitySacas: number;
  referencePrice: number; valorization: number;
  userOverridePrice: number | null; hasExistingContract: boolean;
}

export interface InsuranceResult {
  premiumPerSaca: number; additionalSacas: number; totalSacas: number;
  volatility: number; strikePercent: number; maturityDays: number;
}

export interface PaymentMethodOption {
  id: string; methodName: string; markupPercent: number;
}

export interface SegmentOption {
  value: string; label: string; adjustmentPercent: number;
}

export interface BuyerOption {
  id: string; buyerName: string; fee: number;
}

export interface ComboDefinitionSummary {
  id: string; name: string; discountPercent: number; productRefs: string[];
}

export interface CampaignConfig {
  currency: string; target: string; activeModules: string[];
  aforoPercent: number; priceListFormat: string; commodities: string[];
  contractPriceTypes: string[];
}

export interface SimulationResult {
  selections: AgronomicResult[];
  comboActivations: ComboActivationResult[];
  consumptionLedger: Record<string, Record<string, number>>;
  pricingResults: PricingResultItem[];
  pricingDebugRows: PricingDebugRow[];
  grossToNet: GrossToNetResult;
  eligibility: EligibilityResult;
  parity: ParityResult | null;
  insurance: InsuranceResult | null;
  commodityNetPrice: number | null;
  ivp: number | null;
  maxDiscount: number;
  activatedDiscount: number;
  complementaryDiscount: number;
  discountProgress: number;
  moneyCurrency: 'BRL' | 'USD';
  campaignConfig: CampaignConfig;
  paymentMethods: PaymentMethodOption[];
  segmentOptions: SegmentOption[];
  buyers: BuyerOption[];
  ports: string[];
  freightOrigins: { origin: string; destination: string }[];
  comboDefinitions: ComboDefinitionSummary[];
  timestamp: string;
}

export interface OperationStatusResult {
  operationStatus: string;
  wagonStages: { id: string; name: string; status: string; requiredDocuments: string[]; completedDocuments: string[] }[];
  nextStatus: string | null;
  guaranteeCoverage: { base: number; effective: number; required: number; sufficient: boolean };
}

export interface SimulateInput {
  campaignId: string;
  selections: SimulationSelection[];
  segmentName: string;
  channelSegment: 'direto' | 'distribuidor' | 'cooperativa';
  dueMonths?: number;
  dueDate?: string;
  paymentMethodId?: string;
  commodityCode?: string;
  port?: string;
  freightOrigin?: string;
  deliveryLocationId?: string;
  hasContract?: boolean;
  userOverridePrice?: number;
  showInsurance?: boolean;
  barterDiscountPercent?: number;
  buyerId?: string;
  contractPriceType?: string;
  performanceIndex?: number;
  clientContext?: {
    state?: string;
    city?: string;
    clientType?: string;
    clientDocument?: string;
    clientSegment?: string;
    segment?: string;
    orderAmount?: number;
  };
}

// ─── HOOK ───
export function useSimulationEngine() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invoke = useCallback(async <T>(endpoint: string, body: Record<string, unknown>): Promise<T> => {
    const { data, error: fnError } = await supabase.functions.invoke('simulation-engine', {
      body: { endpoint, ...body },
    });
    if (fnError) throw new Error(fnError.message || 'Edge function error');
    if (data?.error) throw new Error(data.error);
    return data as T;
  }, []);

  const simulate = useCallback(async (input: SimulateInput): Promise<SimulationResult> => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<SimulationResult>('simulate', input as any);
      setResult(res);
      return res;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  /** Debounced simulate — waits `delayMs` after the last call before firing. */
  const simulateDebounced = useCallback((input: SimulateInput, delayMs = 600) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      simulate(input).catch(() => {}); // error is captured in state
    }, delayMs);
  }, [simulate]);

  const checkEligibility = useCallback(async (campaignId: string, clientContext: Record<string, unknown>): Promise<EligibilityResult> => {
    return invoke<EligibilityResult>('check-eligibility', { campaignId, clientContext });
  }, [invoke]);

  const getOperationStatus = useCallback(async (operationId: string): Promise<OperationStatusResult> => {
    return invoke<OperationStatusResult>('get-operation-status', { operationId });
  }, [invoke]);

  return {
    loading,
    error,
    result,
    simulate,
    simulateDebounced,
    checkEligibility,
    getOperationStatus,
  };
}
