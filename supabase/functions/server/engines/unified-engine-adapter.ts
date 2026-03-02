export type SupportedEngineName =
  | 'credito'
  | 'commodity_pricing'
  | 'frete'
  | 'documentos'
  | 'settlement'
  | 'monitoramento';

export type UnifiedDecisionStatus = 'approved' | 'rejected' | 'pending' | 'error';

export interface UnifiedEngineContext {
  tenant: string;
  campaign: string;
  user: string;
}

export interface UnifiedEngineRequest {
  context: UnifiedEngineContext;
  operation_id: string;
  snapshot_ref?: string;
  engine_name: SupportedEngineName;
  engine_version: string;
  input_payload: Record<string, unknown>;
  idempotency_key: string;
}

export interface UnifiedEngineResponse {
  decision_status: UnifiedDecisionStatus;
  decision_payload: Record<string, unknown>;
  explainability_rows: Array<Record<string, unknown>>;
  warnings: string[];
  policy_refs: string[];
  engine_trace_id: string;
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

export interface UnifiedEngineAdapterInput {
  request: Omit<UnifiedEngineRequest, 'idempotency_key'>;
  idempotencyKey: string;
  outboxDestinations?: string[];
}

export type UnifiedEngineExecutor = (
  request: UnifiedEngineRequest,
) => Promise<UnifiedEngineResponse>;

async function assertQuery(result: QueryResult, context: string): Promise<void> {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
}

const defaultOutboxDestinations = [
  'monitoring.decision_events',
  'compliance.decision_events',
  'portals.decision_events',
];

export async function runUnifiedEngineAdapter(
  supabase: SupabaseLikeClient,
  input: UnifiedEngineAdapterInput,
  execute: UnifiedEngineExecutor,
): Promise<UnifiedEngineResponse> {
  const startedAt = Date.now();
  const runId = crypto.randomUUID();
  const request: UnifiedEngineRequest = {
    ...input.request,
    idempotency_key: input.idempotencyKey,
  };

  const requestInsert = await supabase.from('engine_adapter_runs').insert({
    id: runId,
    operation_id: request.operation_id,
    engine_name: request.engine_name,
    engine_version: request.engine_version,
    request_payload: request,
    status: 'processing',
    idempotency_key: request.idempotency_key,
    started_at: new Date(startedAt).toISOString(),
  });
  await assertQuery(requestInsert, 'engine_adapter_runs.insert');

  try {
    const response = await execute(request);
    const latencyMs = Date.now() - startedAt;

    const responseUpdate = await supabase
      .from('engine_adapter_runs')
      .update({
        response_payload: response,
        latency_ms: latencyMs,
        status: 'success',
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    await assertQuery(responseUpdate, 'engine_adapter_runs.update.success');

    const businessEventId = crypto.randomUUID();
    const eventInsert = await supabase.from('business_events').insert({
      id: businessEventId,
      tenant_id: request.context.tenant,
      event_name: 'engine.decision.completed',
      event_version: 1,
      aggregate_type: 'operation',
      aggregate_id: request.operation_id,
      correlation_id: request.operation_id,
      idempotency_key: request.idempotency_key,
      payload: {
        request,
        response,
        latency_ms: latencyMs,
        status: 'success',
      },
      metadata: {
        source: 'supabase/functions/server/engines/unified-engine-adapter.ts',
      },
    });
    await assertQuery(eventInsert, 'business_events.insert');

    const outboxInsert = await supabase.from('event_outbox').insert(
      (input.outboxDestinations || defaultOutboxDestinations).map((destination) => ({
        business_event_id: businessEventId,
        destination,
        status: 'pending',
      })),
    );
    await assertQuery(outboxInsert, 'event_outbox.insert');

    return response;
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : 'engine execution failed';

    const responseUpdate = await supabase
      .from('engine_adapter_runs')
      .update({
        response_payload: {
          decision_status: 'error',
          warnings: [message],
        },
        latency_ms: latencyMs,
        status: 'error',
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    await assertQuery(responseUpdate, 'engine_adapter_runs.update.error');

    throw error;
  }
}
