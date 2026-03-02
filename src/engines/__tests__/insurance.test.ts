import { describe, expect, it } from 'vitest';
import { calculateInsurance } from '../../../supabase/functions/server/engines/insurance';

describe('insurance engine', () => {
  it('supports simplified mode converting premium into additional sacas', () => {
    const result = calculateInsurance({
      mode: 'simplified',
      baseSacas: 100,
      commodityPricePerSaca: 80,
      simplified: { additionalPremiumBRL: 810 },
    });

    expect(result.additionalSacas).toBe(11);
    expect(result.totalSacas).toBe(111);
    expect(result.blockingReasons).toEqual([]);
  });

  it('returns blocking reasons and snapshot for missing advanced params', () => {
    const result = calculateInsurance({
      mode: 'advanced',
      baseSacas: 100,
      commodityPricePerSaca: 90,
      advanced: { spotPrice: 120, strikePercent: 105 },
    });

    expect(result.blockingReasons).toEqual([
      'MISSING_VOLATILITY',
      'MISSING_RISK_FREE_RATE',
      'MISSING_MATURITY_DAYS',
    ]);
    expect(result.snapshot.mode).toBe('advanced');
    expect(result.premiumPerSacaBRL).toBe(0);
    expect(result.additionalSacas).toBe(0);
  });

  it('has premium sensitivity for volatility, rate and maturity', () => {
    const base = {
      mode: 'advanced' as const,
      baseSacas: 200,
      commodityPricePerSaca: 100,
      advanced: {
        spotPrice: 130,
        strikePercent: 105,
        volatilityPercent: 20,
        riskFreeRate: 0.05,
        maturityDays: 120,
      },
    };

    const premiumBase = calculateInsurance(base);
    const premiumHigherVol = calculateInsurance({
      ...base,
      advanced: { ...base.advanced, volatilityPercent: 35 },
    });
    const premiumHigherRate = calculateInsurance({
      ...base,
      advanced: { ...base.advanced, riskFreeRate: 0.1 },
    });
    const premiumLongerTime = calculateInsurance({
      ...base,
      advanced: { ...base.advanced, maturityDays: 240 },
    });

    expect(premiumHigherVol.premiumPerSacaBRL).toBeGreaterThan(premiumBase.premiumPerSacaBRL);
    expect(premiumHigherRate.premiumPerSacaBRL).toBeGreaterThan(premiumBase.premiumPerSacaBRL);
    expect(premiumLongerTime.premiumPerSacaBRL).toBeGreaterThan(premiumBase.premiumPerSacaBRL);
  });

  it('keeps premium consistency in sacas conversion', () => {
    const result = calculateInsurance({
      mode: 'advanced',
      baseSacas: 157,
      commodityPricePerSaca: 92,
      advanced: {
        spotPrice: 130,
        strikePercent: 105,
        volatilityPercent: 24,
        riskFreeRate: 0.08,
        maturityDays: 180,
      },
    });

    expect(result.blockingReasons).toEqual([]);
    expect(result.additionalSacas).toBe(Math.ceil(result.premiumTotalBRL / 92));
    expect(result.totalSacas).toBe(result.snapshot.baseSacas + result.additionalSacas);
  });
});
