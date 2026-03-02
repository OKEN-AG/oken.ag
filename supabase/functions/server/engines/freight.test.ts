import { describe, expect, it } from 'vitest';
import { calculateFreightBreakdown } from './freight';

describe('calculateFreightBreakdown', () => {
  it('aplica redutor específico quando origem/destino casam', () => {
    const result = calculateFreightBreakdown({
      reducers: [{ id: 'r1', cidade: 'Sorriso', porto: 'Santos', km: 2000, custo_km: 0.22, ajuste: -15 }],
      origin: 'Sorriso',
      destination: 'Santos',
      defaultCostPerKm: 0.5,
    });

    expect(result.matchedReducerId).toBe('r1');
    expect(result.baseCost).toBe(440);
    expect(result.totalCostPerTon).toBe(425);
    expect(result.usedDefaultCost).toBe(false);
  });

  it('usa fallback sem redutor mantendo custo padrão', () => {
    const result = calculateFreightBreakdown({
      reducers: [],
      origin: 'Lucas do Rio Verde',
      destination: 'Paranagua',
      defaultCostPerKm: 0.35,
    });

    expect(result.matchedReducerId).toBeNull();
    expect(result.km).toBe(0);
    expect(result.costPerKm).toBe(0.35);
    expect(result.totalCostPerTon).toBe(0);
    expect(result.usedDefaultCost).toBe(true);
  });

  it('não permite custo final negativo (borda de ajuste)', () => {
    const result = calculateFreightBreakdown({
      reducers: [{ id: 'r2', cidade: 'X', porto: 'Y', km: 100, custo_km: 0.1, ajuste: -20 }],
      origin: 'X',
      destination: 'Y',
      defaultCostPerKm: 0.2,
    });

    expect(result.baseCost).toBe(10);
    expect(result.totalCostPerTon).toBe(0);
  });

  it('aceita modelo legado (origin/destination/distance_km/cost_per_km)', () => {
    const result = calculateFreightBreakdown({
      reducers: [{ id: 'legacy', origin: 'A', destination: 'B', distance_km: 300, cost_per_km: 0.4, adjustment: 12 }],
      origin: 'A',
      destination: 'B',
      defaultCostPerKm: 0.2,
    });

    expect(result.matchedReducerId).toBe('legacy');
    expect(result.baseCost).toBe(120);
    expect(result.totalCostPerTon).toBe(132);
  });
});
