import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOrderCalculations } from './useOrderCalculations';

describe('useOrderCalculations', () => {
  it('calculates effective area and validates cpf/cnpj', () => {
    const { result } = renderHook(() => useOrderCalculations({
      area: 100,
      comboQty: 3,
      dueDates: [{ region_type: 'estado', region_value: 'MT', payment_method: 'pix' }],
      clientCity: 'Sorriso',
      clientState: 'MT',
      selectedPaymentMethod: 'pix',
      clientDocument: '123.456.789-09',
      validateCpf: () => true,
      validateCnpj: () => false,
    }));

    expect(result.current.effectiveArea).toBe(300);
    expect(result.current.filteredDueDates).toHaveLength(1);
    expect(result.current.dueDateOptions).toHaveLength(1);
    expect(result.current.documentDigits).toBe('12345678909');
    expect(result.current.documentValid).toBe(true);
  });
});
