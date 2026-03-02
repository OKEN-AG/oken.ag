export interface InvoicingProvisionInput {
  grossRevenue: number;
  provisionRate: number;
  marginRate: number;
  barterCostRate: number;
  paymentMethod: 'barter' | 'boleto' | 'transferencia' | 'outro';
}

export interface InvoicingProvisionResult {
  grossRevenue: number;
  financialProvision: number;
  distributorMargin: number;
  barterCost: number;
  netRevenueAfterProvision: number;
}

export interface ReleaseGateInput {
  documentApproved: boolean;
  creditApproved: boolean;
  riskApproved: boolean;
}

export interface ReleaseGateResult {
  released: boolean;
  blockedReasons: string[];
  releaseReasons: string[];
}

interface QueryResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}

interface QueryBuilder {
  insert(payload: Record<string, unknown> | Record<string, unknown>[]): Promise<QueryResult>;
  update(payload: Record<string, unknown>): QueryBuilder;
  eq(column: string, value: string): Promise<QueryResult>;
}

export interface SupabaseLikeClient {
  from(table: string): QueryBuilder;
}

export interface InvoicingEngineInput {
  operationId: string;
  tenantId: string | null;
  actorUserId: string;
  fromStatus: string;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  outboxDestinations: string[];
  provisions: InvoicingProvisionInput;
  gates: ReleaseGateInput;
}

function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function computeInvoicingProvisions(input: InvoicingProvisionInput): InvoicingProvisionResult {
  const grossRevenue = toMoney(input.grossRevenue);
  const financialProvision = toMoney(grossRevenue * input.provisionRate);
  const distributorMargin = toMoney(grossRevenue * input.marginRate);
  const barterCost = input.paymentMethod === 'barter' ? toMoney(grossRevenue * input.barterCostRate) : 0;
  const netRevenueAfterProvision = toMoney(grossRevenue - financialProvision - distributorMargin - barterCost);

  return {
    grossRevenue,
    financialProvision,
    distributorMargin,
    barterCost,
    netRevenueAfterProvision,
  };
}

export function evaluateReleaseGates(input: ReleaseGateInput): ReleaseGateResult {
  const blockedReasons: string[] = [];
  const releaseReasons: string[] = [];

  if (!input.documentApproved) {
    blockedReasons.push('blocked_documentation_pending');
  } else {
    releaseReasons.push('released_documentation_ok');
  }

  if (!input.creditApproved) {
    blockedReasons.push('blocked_credit_not_approved');
  } else {
    releaseReasons.push('released_credit_ok');
  }

  if (!input.riskApproved) {
    blockedReasons.push('blocked_risk_not_approved');
  } else {
    releaseReasons.push('released_risk_ok');
  }

  return {
    released: blockedReasons.length === 0,
    blockedReasons,
    releaseReasons,
  };
}

async function assertQuery(result: QueryResult, context: string): Promise<void> {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
}

export async function runInvoicingEngine(
  supabase: SupabaseLikeClient,
  input: InvoicingEngineInput,
): Promise<{ released: boolean; reasons: string[]; provisions: InvoicingProvisionResult }> {
  const provisions = computeInvoicingProvisions(input.provisions);
  const gate = evaluateReleaseGates(input.gates);

  const toStatus = gate.released ? 'faturado' : input.fromStatus;
  const notes = gate.released
    ? gate.releaseReasons.join(',')
    : gate.blockedReasons.join(',');

  const operationUpdate = await supabase
    .from('operations')
    .update({
      status: toStatus,
      financial_revenue: provisions.financialProvision,
      distributor_margin: provisions.distributorMargin,
      net_revenue: provisions.netRevenueAfterProvision,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.operationId);
  await assertQuery(operationUpdate, 'operations.update');

  const historyInsert = await supabase.from('operation_status_history').insert({
    operation_id: input.operationId,
    from_status: input.fromStatus,
    to_status: toStatus,
    changed_by: input.actorUserId,
    notes,
  });
  await assertQuery(historyInsert, 'operation_status_history.insert');

  const operationLogInsert = await supabase.from('operation_logs').insert({
    operation_id: input.operationId,
    user_id: input.actorUserId,
    action: gate.released ? 'order_release_granted' : 'order_release_blocked',
    details: {
      blocked_reasons: gate.blockedReasons,
      release_reasons: gate.releaseReasons,
      provisions,
    },
  });
  await assertQuery(operationLogInsert, 'operation_logs.insert');

  if (gate.released) {
    const businessEventId = crypto.randomUUID();
    const eventInsert = await supabase.from('business_events').insert({
      id: businessEventId,
      tenant_id: input.tenantId,
      event_name: 'order_issued',
      event_version: 1,
      aggregate_type: 'operation',
      aggregate_id: input.operationId,
      correlation_id: input.correlationId || input.operationId,
      idempotency_key: input.idempotencyKey || `order-issued:${input.operationId}`,
      payload: {
        operation_id: input.operationId,
        status: toStatus,
        released: true,
        provisions,
        release_reasons: gate.releaseReasons,
      },
      metadata: {
        source: 'supabase/functions/server/engines/invoicing.ts',
      },
    });
    await assertQuery(eventInsert, 'business_events.insert');

    const outboxRows = input.outboxDestinations.map((destination) => ({
      business_event_id: businessEventId,
      destination,
      status: 'pending',
    }));

    const outboxInsert = await supabase.from('event_outbox').insert(outboxRows);
    await assertQuery(outboxInsert, 'event_outbox.insert');
  }

  return {
    released: gate.released,
    reasons: gate.released ? gate.releaseReasons : gate.blockedReasons,
    provisions,
  };
}
