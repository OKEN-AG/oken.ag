import { describe, it, expect } from 'vitest';
import { calculateAgronomicSelection } from '@/engines/agronomic';

describe('calculateAgronomicSelection', () => {
  it('usa área x dose para pricingBasis por_hectare', () => {
    const result = calculateAgronomicSelection({
      id: 'p1',
      name: 'Fertilizante X',
      ref: 'FX',
      category: 'fertilizante',
      activeIngredient: '-',
      unitType: 'kg',
      packageSizes: [1],
      unitsPerBox: 10,
      boxesPerPallet: 20,
      palletsPerTruck: 10,
      dosePerHectare: 2,
      minDose: 1,
      maxDose: 3,
      pricePerUnit: 100,
      currency: 'BRL',
      priceType: 'vista',
      includesMargin: false,
      pricingBasis: 'por_hectare',
    }, 100, 2);

    expect(result.rawQuantity).toBe(200);
  });

  it('usa quantidade direta para pricingBasis por_unidade', () => {
    const result = calculateAgronomicSelection({
      id: 'p2',
      name: 'Maquinário Y',
      ref: 'MY',
      category: 'maquinario',
      activeIngredient: '-',
      unitType: 'un',
      packageSizes: [1],
      unitsPerBox: 1,
      boxesPerPallet: 1,
      palletsPerTruck: 1,
      dosePerHectare: 1,
      minDose: 1,
      maxDose: 10,
      pricePerUnit: 1000,
      currency: 'BRL',
      priceType: 'vista',
      includesMargin: false,
      pricingBasis: 'por_unidade',
    }, 100, 3);

    expect(result.rawQuantity).toBe(3);
  });
});
