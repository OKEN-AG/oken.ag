import { describe, it, expect } from 'vitest';
import { applyIncentiveRules } from '@/engines/incentives';

describe('applyIncentiveRules', () => {
  it('aplica desconto direto percentual e crédito fixo', () => {
    const result = applyIncentiveRules([
      { id: 'r1', name: 'Desc 5%', effectType: 'desconto_direto', valueType: 'percent', value: 5, active: true },
      { id: 'r2', name: 'Crédito 100', effectType: 'credito_liberacao', valueType: 'fixed', value: 100, active: true },
    ], { baseAmount: 1000 });

    expect(result.directDiscount).toBe(50);
    expect(result.creditLiberacao).toBe(100);
    expect(result.creditLiquidacao).toBe(0);
    expect(result.appliedRules).toHaveLength(2);
  });

  it('respeita não cumulativo por tipo de efeito', () => {
    const result = applyIncentiveRules([
      { id: 'r1', name: 'Desc A', effectType: 'desconto_direto', valueType: 'percent', value: 10, active: true, combinable: false, priority: 1 },
      { id: 'r2', name: 'Desc B', effectType: 'desconto_direto', valueType: 'percent', value: 5, active: true, combinable: false, priority: 2 },
    ], { baseAmount: 1000 });

    expect(result.directDiscount).toBe(100);
    expect(result.appliedRules.map(r => r.id)).toEqual(['r1']);
  });
});
