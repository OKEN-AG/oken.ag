import { describe, expect, it } from 'vitest';
import {
  runUnifiedEngineAdapter,
  type SupabaseLikeClient,
  type UnifiedEngineResponse,
} from '../../../supabase/functions/server/engines/unified-engine-adapter';

type Row = Record<string, unknown>;

function createMockSupabase() {
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};

  const client: SupabaseLikeClient = {
    from(table: string) {
      return {
        async insert(payload: Row | Row[]) {
          const rows = Array.isArray(payload) ? payload : [payload];
          inserts[table] = [...(inserts[table] || []), ...rows];
          return { data: rows[0] || null, error: null };
        },
        update(payload: Row) {
          const selfTable = table;
          return {
            insert: async () => ({ data: null, error: { message: 'unsupported' } }),
            update: () => this,
            async eq() {
              updates[selfTable] = [...(updates[selfTable] || []), payload];
              return { data: payload, error: null };
            },
          } as any;
        },
        async eq() {
          return { data: null, error: null };
        },
      };
    },
  };

  return { client, inserts, updates };
}

describe('unified engine adapter', () => {
  it('padroniza payload, persiste execução e publica outbox para consumidores default', async () => {
    const { client, inserts, updates } = createMockSupabase();

    const response: UnifiedEngineResponse = {
      decision_status: 'approved',
      decision_payload: { approved_limit: 250000 },
      explainability_rows: [{ metric: 'pd', value: 0.02 }],
      warnings: [],
      policy_refs: ['credit.policy.v3'],
      engine_trace_id: 'trace-1',
    };

    const result = await runUnifiedEngineAdapter(
      client,
      {
        request: {
          context: {
            tenant: 'tenant-1',
            campaign: 'campaign-2026',
            user: 'user-1',
          },
          operation_id: 'op-1',
          snapshot_ref: 'snapshot-abc',
          engine_name: 'credito',
          engine_version: '1.0.0',
          input_payload: { amount: 200000 },
        },
        idempotencyKey: 'engine:credito:op-1:v1',
      },
      async () => response,
    );

    expect(result).toEqual(response);
    expect(inserts.engine_adapter_runs[0].idempotency_key).toBe('engine:credito:op-1:v1');
    expect(updates.engine_adapter_runs[0].status).toBe('success');
    expect(inserts.business_events[0].event_name).toBe('engine.decision.completed');
    expect(inserts.event_outbox).toHaveLength(3);
    expect(inserts.event_outbox.map((row) => row.destination)).toEqual([
      'monitoring.decision_events',
      'compliance.decision_events',
      'portals.decision_events',
    ]);
  });

  it('marca execução com erro quando engine falha', async () => {
    const { client, updates } = createMockSupabase();

    await expect(
      runUnifiedEngineAdapter(
        client,
        {
          request: {
            context: {
              tenant: 'tenant-1',
              campaign: 'campaign-2026',
              user: 'user-1',
            },
            operation_id: 'op-2',
            engine_name: 'frete',
            engine_version: '2.0.0',
            input_payload: { route: 'MT-SP' },
          },
          idempotencyKey: 'engine:frete:op-2:v2',
        },
        async () => {
          throw new Error('timeout from freight provider');
        },
      ),
    ).rejects.toThrow('timeout from freight provider');

    expect(updates.engine_adapter_runs[0].status).toBe('error');
    expect((updates.engine_adapter_runs[0].response_payload as Record<string, unknown>).decision_status).toBe('error');
  });
});
