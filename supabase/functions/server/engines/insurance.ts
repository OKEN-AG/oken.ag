export type InsuranceMode = 'simplified' | 'advanced';

export interface InsuranceInput {
  mode: InsuranceMode;
  baseSacas: number;
  commodityPricePerSaca: number;
  simplified?: {
    additionalPremiumBRL?: number;
    additionalSacas?: number;
  };
  advanced?: {
    spotPrice?: number;
    strikePercent?: number;
    strikePrice?: number;
    volatilityPercent?: number;
    riskFreeRate?: number;
    maturityDays?: number;
  };
}

export interface InsuranceSnapshot {
  mode: InsuranceMode;
  baseSacas: number;
  commodityPricePerSaca: number;
  strikePrice?: number;
  strikePercent?: number;
  spotPrice?: number;
  volatilityPercent?: number;
  riskFreeRate?: number;
  maturityDays?: number;
  premiumPerSacaBRL: number;
  premiumTotalBRL: number;
  additionalSacas: number;
}

export interface InsuranceOutput {
  mode: InsuranceMode;
  premiumPerSacaBRL: number;
  premiumTotalBRL: number;
  additionalSacas: number;
  totalSacas: number;
  blockingReasons: string[];
  snapshot: InsuranceSnapshot;
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

export function blackScholesCall(spotPrice: number, strikePrice: number, timeYears: number, riskFreeRate: number, volatility: number): number {
  if (timeYears <= 0 || spotPrice <= 0 || strikePrice <= 0 || volatility <= 0) return 0;

  const denominator = volatility * Math.sqrt(timeYears);
  const d1 = (Math.log(spotPrice / strikePrice) + (riskFreeRate + 0.5 * volatility * volatility) * timeYears) / denominator;
  const d2 = d1 - denominator;

  return spotPrice * normalCDF(d1) - strikePrice * Math.exp(-riskFreeRate * timeYears) * normalCDF(d2);
}

export function calculateInsurance(input: InsuranceInput): InsuranceOutput {
  const baseSacas = Math.max(0, Math.ceil(input.baseSacas || 0));
  const commodityPricePerSaca = Math.max(0, input.commodityPricePerSaca || 0);
  const blockingReasons: string[] = [];

  let premiumPerSacaBRL = 0;
  let premiumTotalBRL = 0;
  let additionalSacas = 0;

  if (input.mode === 'simplified') {
    const additionalPremiumBRL = Number(input.simplified?.additionalPremiumBRL || 0);
    const providedAdditionalSacas = Number(input.simplified?.additionalSacas || 0);

    if (providedAdditionalSacas > 0) {
      additionalSacas = Math.ceil(providedAdditionalSacas);
      premiumTotalBRL = additionalSacas * commodityPricePerSaca;
    } else if (additionalPremiumBRL > 0 && commodityPricePerSaca > 0) {
      additionalSacas = Math.ceil(additionalPremiumBRL / commodityPricePerSaca);
      premiumTotalBRL = additionalSacas * commodityPricePerSaca;
    }

    premiumPerSacaBRL = baseSacas > 0 ? premiumTotalBRL / baseSacas : 0;
  } else {
    const spotPrice = Number(input.advanced?.spotPrice || 0);
    const strikePercent = Number(input.advanced?.strikePercent || 105);
    const strikePrice = Number(input.advanced?.strikePrice || (spotPrice > 0 ? spotPrice * (strikePercent / 100) : 0));
    const volatilityPercent = input.advanced?.volatilityPercent;
    const riskFreeRate = input.advanced?.riskFreeRate;
    const maturityDays = input.advanced?.maturityDays;

    if (volatilityPercent == null || Number.isNaN(Number(volatilityPercent))) {
      blockingReasons.push('MISSING_VOLATILITY');
    }
    if (riskFreeRate == null || Number.isNaN(Number(riskFreeRate))) {
      blockingReasons.push('MISSING_RISK_FREE_RATE');
    }
    if (maturityDays == null || Number.isNaN(Number(maturityDays))) {
      blockingReasons.push('MISSING_MATURITY_DAYS');
    }

    if (blockingReasons.length === 0) {
      const timeYears = Number(maturityDays) / 365;
      const volatility = Number(volatilityPercent) / 100;
      premiumPerSacaBRL = blackScholesCall(spotPrice, strikePrice, timeYears, Number(riskFreeRate), volatility);
      premiumTotalBRL = premiumPerSacaBRL * baseSacas;
      additionalSacas = commodityPricePerSaca > 0 ? Math.ceil(premiumTotalBRL / commodityPricePerSaca) : 0;
    }
  }

  const snapshot: InsuranceSnapshot = {
    mode: input.mode,
    baseSacas,
    commodityPricePerSaca,
    strikePrice: input.mode === 'advanced' ? Number(input.advanced?.strikePrice || (input.advanced?.spotPrice || 0) * ((input.advanced?.strikePercent || 105) / 100)) : undefined,
    strikePercent: input.mode === 'advanced' ? Number(input.advanced?.strikePercent || 105) : undefined,
    spotPrice: input.mode === 'advanced' ? Number(input.advanced?.spotPrice || 0) : undefined,
    volatilityPercent: input.mode === 'advanced' ? input.advanced?.volatilityPercent : undefined,
    riskFreeRate: input.mode === 'advanced' ? input.advanced?.riskFreeRate : undefined,
    maturityDays: input.mode === 'advanced' ? input.advanced?.maturityDays : undefined,
    premiumPerSacaBRL,
    premiumTotalBRL,
    additionalSacas,
  };

  return {
    mode: input.mode,
    premiumPerSacaBRL,
    premiumTotalBRL,
    additionalSacas,
    totalSacas: baseSacas + additionalSacas,
    blockingReasons,
    snapshot,
  };
}
