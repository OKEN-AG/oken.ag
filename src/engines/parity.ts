import type { ParityResult, CommodityPricing, FreightReducer } from '@/types/barter';

/**
 * COMMODITY ENGINE + PARITY ENGINE
 * Calculates commodity net price and converts BRL amount to sacas
 */
export function calculateCommodityNetPrice(
  pricing: CommodityPricing,
  port: string,
  freightReducer?: FreightReducer,
  options?: {
    /** Valorization bonus: nominal (R$/saca) or percent */
    valorizationNominal?: number;
    valorizationPercent?: number;
    useValorizationPercent?: boolean;
    /** Buyer fee as percent — reduces net price */
    buyerFeePercent?: number;
  }
): number {
  const bushelsPerTon = pricing.bushelsPerTon || 36.744;
  const pesoSacaKg = pricing.pesoSacaKg || 60;
  const sacasPerTon = 1000 / pesoSacaKg; // ~16.667

  const basis = pricing.basisByPort[port] ?? 0;

  // USD/bushel → USD/ton
  const fobUsdPerTon = (pricing.exchangePrice + basis) * bushelsPerTon;

  // USD/ton → BRL/ton
  const fobBrlPerTon = fobUsdPerTon * pricing.exchangeRateBolsa;

  // Apply market security delta
  const afterMarketDelta = fobBrlPerTon * (1 - pricing.securityDeltaMarket / 100);

  // Apply valorization (after basis, before freight — per plan recommendation)
  let afterValorization = afterMarketDelta;
  if (options?.useValorizationPercent && options.valorizationPercent) {
    afterValorization *= (1 + options.valorizationPercent / 100);
  }

  // Subtract freight (R$/ton). FreightReducer.totalReducer is R$/ton
  const freightCostPerTon = freightReducer?.totalReducer ?? 0;
  const interiorPricePerTon = afterValorization - freightCostPerTon;

  // Apply freight security delta
  const netPricePerTon = interiorPricePerTon * (1 - pricing.securityDeltaFreight / 100);

  // BRL/ton → BRL/saca
  let netPricePerSaca = netPricePerTon / sacasPerTon;

  // Apply nominal valorization (R$/saca)
  if (!options?.useValorizationPercent && options?.valorizationNominal) {
    netPricePerSaca += options.valorizationNominal;
  }

  // Apply buyer fee (reduces net price)
  if (options?.buyerFeePercent && options.buyerFeePercent > 0) {
    netPricePerSaca *= (1 - options.buyerFeePercent / 100);
  }

  return Math.max(netPricePerSaca, 0.01);
}

/**
 * Calculate IVP (Price Variation Index) for PAF contracts.
 * For 'fixo' contracts, IVP = 1 (no haircut).
 * For 'a_fixar' contracts, apply a volatility-based haircut.
 */
export function calculateIVP(contractPriceType: string, volatility?: number): number {
  if (contractPriceType === 'fixo' || contractPriceType === 'pre_existente') return 1;
  // a_fixar: haircut proportional to volatility (e.g., vol 25% → IVP = 0.95)
  const vol = (volatility || 25) / 100;
  return Math.max(1 - vol * 0.2, 0.8); // Floor at 0.80
}

/**
 * Calculate parity: convert BRL amount to commodity units (sacas)
 * NEW: Supports IVP haircut for PAF contracts
 */
export function calculateParity(
  totalAmountBRL: number,
  commodityNetPrice: number,
  userOverridePrice?: number,
  grossAmountBRL?: number,
  ivp: number = 1
): ParityResult {
  const effectivePrice = (userOverridePrice ?? commodityNetPrice) * ivp;
  const quantitySacas = Math.ceil(totalAmountBRL / effectivePrice);

  const referencePrice = grossAmountBRL
    ? grossAmountBRL / quantitySacas
    : totalAmountBRL / quantitySacas;

  const valorization = effectivePrice > 0
    ? ((referencePrice - effectivePrice) / effectivePrice) * 100
    : 0;

  return {
    totalAmountBRL,
    commodityPricePerUnit: effectivePrice,
    quantitySacas,
    referencePrice,
    valorization,
    userOverridePrice,
    hasExistingContract: !!userOverridePrice,
  };
}

/**
 * BLACK-SCHOLES for Insurance Engine
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

export function blackScholes(
  spotPrice: number,
  strikePrice: number,
  timeYears: number,
  riskFreeRate: number,
  volatility: number,
  isCall: boolean = true
): number {
  if (timeYears <= 0 || spotPrice <= 0 || strikePrice <= 0) return 0;
  const d1 = (Math.log(spotPrice / strikePrice) + (riskFreeRate + 0.5 * volatility * volatility) * timeYears) /
    (volatility * Math.sqrt(timeYears));
  const d2 = d1 - volatility * Math.sqrt(timeYears);

  if (isCall) {
    return spotPrice * normalCDF(d1) - strikePrice * Math.exp(-riskFreeRate * timeYears) * normalCDF(d2);
  } else {
    return strikePrice * Math.exp(-riskFreeRate * timeYears) * normalCDF(-d2) - spotPrice * normalCDF(-d1);
  }
}
