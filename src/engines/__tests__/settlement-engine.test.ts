import { describe, expect, it } from 'vitest';
import {
  createSettlementOperation,
  recordCompensation,
  recordGrainDelivery,
  reconcileFinancial,
} from '../../../supabase/functions/server/engines/settlement';

describe('settlement engine', () => {
  it('mantém status parcial quando a entrega não atinge o volume contratado', () => {
    const operation = createSettlementOperation({
      id: 'op-1',
      contractedQuantity: 100,
      expectedFinancialValue: 10000,
      currency: 'BRL',
      toleranceQuantity: 0.5,
      toleranceAmount: 5,
    });

    const withDelivery = recordGrainDelivery(operation, {
      deliveredQuantity: 70,
      expectedQuantity: 100,
      unitPrice: 100,
      deliveredAt: '2026-03-01T10:00:00.000Z',
    });

    const reconciliation = reconcileFinancial(withDelivery);

    expect(reconciliation.deliveredQuantity).toBe(70);
    expect(reconciliation.quantityDelta).toBe(30);
    expect(withDelivery.finalStatus).toBe('partially_delivered');
    expect(reconciliation.shouldClose).toBe(false);
  });

  it('marca divergência de entrega quando volume excede tolerância', () => {
    const operation = createSettlementOperation({
      id: 'op-2',
      contractedQuantity: 100,
      expectedFinancialValue: 10000,
      currency: 'BRL',
      toleranceQuantity: 1,
      toleranceAmount: 5,
    });

    const withDelivery = recordGrainDelivery(operation, {
      deliveredQuantity: 103,
      expectedQuantity: 100,
      unitPrice: 100,
      deliveredAt: '2026-03-01T10:00:00.000Z',
    });

    const reconciliation = reconcileFinancial(withDelivery);

    expect(reconciliation.quantityDelta).toBe(-3);
    expect(reconciliation.hasQuantityDivergence).toBe(true);
    expect(withDelivery.finalStatus).toBe('delivery_divergence');
  });

  it('fecha operação após compensação e conciliação total', () => {
    const operation = createSettlementOperation({
      id: 'op-3',
      contractedQuantity: 100,
      expectedFinancialValue: 10000,
      currency: 'BRL',
      toleranceQuantity: 0,
      toleranceAmount: 1,
    });

    const delivered = recordGrainDelivery(operation, {
      deliveredQuantity: 100,
      expectedQuantity: 100,
      unitPrice: 98,
      deliveredAt: '2026-03-01T10:00:00.000Z',
    });

    expect(delivered.finalStatus).toBe('financial_pending');

    const compensated = recordCompensation(
      delivered,
      200,
      'Compensação de diferença de preço',
      '2026-03-01T12:00:00.000Z',
    );

    const reconciliation = reconcileFinancial(compensated);

    expect(reconciliation.financialDelta).toBe(0);
    expect(reconciliation.shouldClose).toBe(true);
    expect(compensated.finalStatus).toBe('closed');
    expect(compensated.closedAt).toBeTruthy();
    expect(
      compensated.settlementEntries.some((entry) => entry.kind === 'financial_reconciliation'),
    ).toBe(true);
  });
});
