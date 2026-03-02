export type OperationFinalStatus =
  | 'open'
  | 'partially_delivered'
  | 'delivery_divergence'
  | 'financial_pending'
  | 'closed';

export type SettlementEntryKind = 'grain_delivery' | 'financial_reconciliation' | 'compensation';

export interface SettlementEntry {
  id: string;
  kind: SettlementEntryKind;
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GrainDelivery {
  id: string;
  deliveredQuantity: number;
  expectedQuantity: number;
  unitPrice: number;
  qualityDiscountPct?: number;
  deliveredAt: string;
}

export interface SettlementOperation {
  id: string;
  contractedQuantity: number;
  expectedFinancialValue: number;
  currency: string;
  toleranceQuantity: number;
  toleranceAmount: number;
  grainDeliveries: GrainDelivery[];
  settlementEntries: SettlementEntry[];
  finalStatus: OperationFinalStatus;
  closedAt?: string;
}

export interface FinancialReconciliation {
  deliveredQuantity: number;
  deliveredValue: number;
  compensationTotal: number;
  netSettledValue: number;
  financialDelta: number;
  quantityDelta: number;
  hasQuantityDivergence: boolean;
  hasFinancialDivergence: boolean;
  shouldClose: boolean;
  suggestedFinalStatus: OperationFinalStatus;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const randomId = (prefix: string): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export function createSettlementOperation(
  input: Pick<
    SettlementOperation,
    'id' | 'contractedQuantity' | 'expectedFinancialValue' | 'currency' | 'toleranceQuantity' | 'toleranceAmount'
  >,
): SettlementOperation {
  return {
    ...input,
    grainDeliveries: [],
    settlementEntries: [],
    finalStatus: 'open',
  };
}

function calculateDeliveryAmount(delivery: GrainDelivery): number {
  const qualityFactor = 1 - (delivery.qualityDiscountPct ?? 0) / 100;
  return round2(delivery.deliveredQuantity * delivery.unitPrice * qualityFactor);
}

export function recordGrainDelivery(
  operation: SettlementOperation,
  delivery: Omit<GrainDelivery, 'id'> & { id?: string },
): SettlementOperation {
  const safeDelivery: GrainDelivery = {
    ...delivery,
    id: delivery.id ?? randomId('delivery'),
  };

  const deliveryAmount = calculateDeliveryAmount(safeDelivery);
  const next: SettlementOperation = {
    ...operation,
    grainDeliveries: [...operation.grainDeliveries, safeDelivery],
    settlementEntries: [
      ...operation.settlementEntries,
      {
        id: randomId('entry'),
        kind: 'grain_delivery',
        amount: deliveryAmount,
        currency: operation.currency,
        description: `Entrega de grãos ${safeDelivery.id}`,
        createdAt: safeDelivery.deliveredAt,
        metadata: {
          deliveredQuantity: safeDelivery.deliveredQuantity,
          expectedQuantity: safeDelivery.expectedQuantity,
          qualityDiscountPct: safeDelivery.qualityDiscountPct ?? 0,
        },
      },
    ],
  };

  return refreshOperationStatus(next);
}

export function recordCompensation(
  operation: SettlementOperation,
  amount: number,
  description: string,
  createdAt: string,
): SettlementOperation {
  const next: SettlementOperation = {
    ...operation,
    settlementEntries: [
      ...operation.settlementEntries,
      {
        id: randomId('entry'),
        kind: 'compensation',
        amount: round2(amount),
        currency: operation.currency,
        description,
        createdAt,
      },
    ],
  };

  return refreshOperationStatus(next);
}

export function reconcileFinancial(operation: SettlementOperation): FinancialReconciliation {
  const deliveredQuantity = round2(
    operation.grainDeliveries.reduce((acc, d) => acc + d.deliveredQuantity, 0),
  );

  const deliveredValue = round2(
    operation.settlementEntries
      .filter((entry) => entry.kind === 'grain_delivery')
      .reduce((acc, entry) => acc + entry.amount, 0),
  );

  const compensationTotal = round2(
    operation.settlementEntries
      .filter((entry) => entry.kind === 'compensation')
      .reduce((acc, entry) => acc + entry.amount, 0),
  );

  const netSettledValue = round2(deliveredValue + compensationTotal);
  const financialDelta = round2(operation.expectedFinancialValue - netSettledValue);
  const quantityDelta = round2(operation.contractedQuantity - deliveredQuantity);

  const hasQuantityDivergence = Math.abs(quantityDelta) > operation.toleranceQuantity;
  const hasFinancialDivergence = Math.abs(financialDelta) > operation.toleranceAmount;

  const shouldClose = !hasQuantityDivergence && !hasFinancialDivergence;

  let suggestedFinalStatus: OperationFinalStatus = 'open';
  if (shouldClose) {
    suggestedFinalStatus = 'closed';
  } else if (hasQuantityDivergence) {
    suggestedFinalStatus = deliveredQuantity < operation.contractedQuantity
      ? 'partially_delivered'
      : 'delivery_divergence';
  } else {
    suggestedFinalStatus = 'financial_pending';
  }

  return {
    deliveredQuantity,
    deliveredValue,
    compensationTotal,
    netSettledValue,
    financialDelta,
    quantityDelta,
    hasQuantityDivergence,
    hasFinancialDivergence,
    shouldClose,
    suggestedFinalStatus,
  };
}

export function refreshOperationStatus(operation: SettlementOperation): SettlementOperation {
  const reconciliation = reconcileFinancial(operation);

  const next: SettlementOperation = {
    ...operation,
    finalStatus: reconciliation.suggestedFinalStatus,
  };

  if (reconciliation.shouldClose) {
    const now = new Date().toISOString();
    next.closedAt = now;

    if (!operation.settlementEntries.some((entry) => entry.kind === 'financial_reconciliation')) {
      next.settlementEntries = [
        ...operation.settlementEntries,
        {
          id: randomId('entry'),
          kind: 'financial_reconciliation',
          amount: reconciliation.netSettledValue,
          currency: operation.currency,
          description: 'Conciliação financeira final concluída',
          createdAt: now,
          metadata: {
            financialDelta: reconciliation.financialDelta,
            quantityDelta: reconciliation.quantityDelta,
          },
        },
      ];
    }
  }

  return next;
}
