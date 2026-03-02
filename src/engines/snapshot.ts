import type { 
  Campaign, Product, ComboDefinition, CommodityPricing, FreightReducer,
  AgronomicSelection, ComboActivation, PricingResult, GrossToNet, ParityResult,
  ChannelSegment, GuaranteeCoverage, ContractPriceType, CessionChain
} from '@/types/barter';

export interface EligibilityResult {
  eligible: boolean;
  blocked: boolean;
  flags: Record<string, boolean>;
  warnings: string[];
}

/**
 * SNAPSHOT / VARIABLE RESOLVER ENGINE
 * 
 * Consolidates all variables used in a simulation/order and produces
 * an immutable snapshot for audit. The same order reopened in the future
 * shows the original calculation even if the campaign changed.
 */

export interface OrderPricingSnapshot {
  version: string; // schema version for forward compat
  createdAt: string;
  
  // Campaign params at time of snapshot
  campaign: {
    id: string;
    name: string;
    season: string;
    target: string;
    interestRate: number;
    exchangeRateProducts: number;
    exchangeRateBarter: number;
    maxDiscountInternal: number;
    maxDiscountReseller: number;
    priceListFormat: string;
    activeModules: string[];
  };

  // Order context
  order: {
    clientName: string;
    clientDocument?: string;
    channel: ChannelSegment;
    state?: string;
    city?: string;
    areaHectares: number;
    dueMonths: number;
    dueDate?: string;
    paymentMethod?: string;
    commodity?: string;
  };

  // Product selections with prices
  selections: Array<{
    productId: string;
    productName: string;
    ref: string;
    dosePerHectare: number;
    rawQuantity: number;
    roundedQuantity: number;
    boxes: number;
    pallets: number;
    basePrice: number;
    normalizedPrice: number;
    interestComponent: number;
    marginComponent: number;
    subtotal: number;
  }>;

  // Combo cascade results
  combos: {
    definitions: Array<{ id: string; name: string; discountPercent: number; products: string[] }>;
    activations: ComboActivation[];
    consumptionLedger?: Record<string, Record<string, number>>; // comboId -> { ref: qty }
  };

  // Eligibility
  eligibility: EligibilityResult;

  // Gross-to-Net breakdown
  grossToNet: GrossToNet;

  // Commodity/Parity (if barter)
  commodity?: {
    type: string;
    exchange: string;
    contract: string;
    exchangePrice: number;
    exchangeRateBolsa: number;
    basisPort?: string;
    basisValue?: number;
    freightOrigin?: string;
    freightReducerPerTon?: number;
    netPricePerSaca: number;
    valorizationBonus?: number;
  };

  parity?: ParityResult;

  // Insurance (if active)
  insurance?: {
    premiumPerSaca: number;
    additionalSacas: number;
    totalSacas: number;
    volatility: number;
  };

  // Guarantee framework (PoE/PoL/PoD)
  performanceIndex?: number;
  priceVariationIndex?: number;
  aforoPercent?: number;
  guaranteeCoverage?: GuaranteeCoverage;
  contractPriceType?: ContractPriceType;
  cessionChain?: CessionChain;
}

/**
 * Build a snapshot from all engine outputs
 */
export function buildSnapshot(params: {
  campaign: Campaign;
  rawCampaign: any;
  selections: AgronomicSelection[];
  pricingResults: PricingResult[];
  comboActivations: ComboActivation[];
  comboDefinitions: ComboDefinition[];
  eligibility: EligibilityResult;
  grossToNet: GrossToNet;
  orderContext: {
    clientName: string;
    clientDocument?: string;
    channel: ChannelSegment;
    state?: string;
    city?: string;
    areaHectares: number;
    dueMonths: number;
    dueDate?: string;
    paymentMethod?: string;
    commodity?: string;
  };
  commodityData?: {
    type: string;
    exchange: string;
    contract: string;
    exchangePrice: number;
    exchangeRateBolsa: number;
    basisPort?: string;
    basisValue?: number;
    freightOrigin?: string;
    freightReducerPerTon?: number;
    netPricePerSaca: number;
    valorizationBonus?: number;
  };
  parity?: ParityResult;
  insurance?: {
    premiumPerSaca: number;
    additionalSacas: number;
    totalSacas: number;
    volatility: number;
  };
  consumptionLedger?: Record<string, Record<string, number>>;
  performanceIndex?: number;
  priceVariationIndex?: number;
  aforoPercent?: number;
  guaranteeCoverage?: GuaranteeCoverage;
  contractPriceType?: ContractPriceType;
  cessionChain?: CessionChain;
}): OrderPricingSnapshot {
  const { campaign, rawCampaign, selections, pricingResults, comboActivations, comboDefinitions, eligibility, grossToNet, orderContext } = params;

  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    campaign: {
      id: campaign.id,
      name: campaign.name,
      season: campaign.season,
      target: campaign.target,
      interestRate: campaign.interestRate,
      exchangeRateProducts: campaign.exchangeRateProducts,
      exchangeRateBarter: campaign.exchangeRateBarter,
      maxDiscountInternal: campaign.maxDiscountInternal,
      maxDiscountReseller: campaign.maxDiscountReseller,
      priceListFormat: campaign.priceListFormat,
      activeModules: campaign.activeModules,
    },
    order: orderContext,
    selections: selections.map(sel => {
      const pr = pricingResults.find(p => p.productId === sel.productId);
      return {
        productId: sel.productId,
        productName: sel.product.name,
        ref: sel.ref,
        dosePerHectare: sel.dosePerHectare,
        rawQuantity: sel.rawQuantity,
        roundedQuantity: sel.roundedQuantity,
        boxes: sel.boxes,
        pallets: sel.pallets,
        basePrice: pr?.basePrice ?? 0,
        normalizedPrice: pr?.normalizedPrice ?? 0,
        interestComponent: pr?.interestComponent ?? 0,
        marginComponent: pr?.marginComponent ?? 0,
        subtotal: pr?.subtotal ?? 0,
      };
    }),
    combos: {
      definitions: comboDefinitions.map(c => ({
        id: c.id,
        name: c.name,
        discountPercent: c.discountPercent,
        products: c.products.map(p => p.ref),
      })),
      activations: comboActivations,
      consumptionLedger: params.consumptionLedger,
    },
    eligibility,
    grossToNet,
    commodity: params.commodityData,
    parity: params.parity,
    insurance: params.insurance,
    performanceIndex: params.performanceIndex,
    priceVariationIndex: params.priceVariationIndex,
    aforoPercent: params.aforoPercent,
    guaranteeCoverage: params.guaranteeCoverage,
    contractPriceType: params.contractPriceType,
    cessionChain: params.cessionChain,
  };
}
