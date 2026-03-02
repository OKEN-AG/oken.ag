import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOrderPersistence } from './useOrderPersistence';

describe('useOrderPersistence', () => {
  it('loads existing operation and items', () => {
    const setters = {
      setSelectedCampaignId: vi.fn(), setClientName: vi.fn(), setClientDocument: vi.fn(),
      setClientCity: vi.fn(), setClientState: vi.fn(), setClientCityCode: vi.fn(), setChannelEnum: vi.fn(),
      setSelectedDistributorId: vi.fn(), setChannelSegmentName: vi.fn(), setSegment: vi.fn(),
      setArea: vi.fn(), setSelectedCommodity: vi.fn(), setDueMonths: vi.fn(), setSelectedProducts: vi.fn(),
      setFreeQuantities: vi.fn(), setPackagingSplits: vi.fn(), setComboQty: vi.fn(),
    };

    renderHook(() => useOrderPersistence({
      existingOp: { campaign_id: 'c1', client_name: 'Ana', city: 'Sinop', state: 'MT', channel: 'distribuidor', area_hectares: 120 },
      existingItems: [{ product_id: 'p1', dose_per_hectare: 4 }],
      products: [{ id: 'p1' }],
      activeCampaigns: [{ id: 'c1' }],
      selectedCampaignId: 'c1',
      isNewOperation: false,
      ...setters,
    }));

    expect(setters.setSelectedCampaignId).toHaveBeenCalledWith('c1');
    expect(setters.setClientName).toHaveBeenCalledWith('Ana');
    expect(setters.setArea).toHaveBeenCalledWith(120);
    expect(setters.setSelectedProducts).toHaveBeenCalled();
  });
});
