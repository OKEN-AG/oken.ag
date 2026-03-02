import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOrderWizardState } from './useOrderWizardState';

describe('useOrderWizardState', () => {
  it('initializes and updates critical wizard state', () => {
    const { result } = renderHook(() => useOrderWizardState('campaign-1'));

    expect(result.current.selectedCampaignId).toBe('campaign-1');
    expect(result.current.currentStep).toBe(0);
    expect(result.current.area).toBe(500);

    act(() => {
      result.current.setCurrentStep(3);
      result.current.setArea(700);
      result.current.setComboQty(2);
      result.current.setClientName('Cliente Teste');
      result.current.setSelectedProducts(new Map([['prod-1', 2]]));
    });

    expect(result.current.currentStep).toBe(3);
    expect(result.current.area).toBe(700);
    expect(result.current.comboQty).toBe(2);
    expect(result.current.clientName).toBe('Cliente Teste');
    expect(result.current.selectedProducts.get('prod-1')).toBe(2);
  });
});
