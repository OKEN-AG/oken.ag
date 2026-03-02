import { describe, expect, it } from 'vitest';
import {
  computeInvoicingProvisions,
  evaluateReleaseGates,
  runInvoicingEngine,
  type SupabaseLikeClient,
} from '../../../supabase/functions/server/engines/invoicing';

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

describe('invoicing engine', () => {
  it('calcula provisões, margem e custo barter', () => {
    const result = computeInvoicingProvisions({
      grossRevenue: 1000,
      provisionRate: 0.1,
      marginRate: 0.05,
      barterCostRate: 0.02,
      paymentMethod: 'barter',
    });

    expect(result.financialProvision).toBe(100);
    expect(result.distributorMargin).toBe(50);
    expect(result.barterCost).toBe(20);
    expect(result.netRevenueAfterProvision).toBe(830);
  });

  it('aplica gates de liberação documental/crédito/risco', () => {
    const blocked = evaluateReleaseGates({
      documentApproved: true,
      creditApproved: false,
      riskApproved: false,
    });

    expect(blocked.released).toBe(false);
    expect(blocked.blockedReasons).toEqual([
      'blocked_credit_not_approved',
      'blocked_risk_not_approved',
    ]);
  });

  it('publica order_issued no outbox e persiste trilha quando liberado', async () => {
    const { client, inserts, updates } = createMockSupabase();

    const result = await runInvoicingEngine(client, {
      operationId: 'op-1',
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      fromStatus: 'garantido',
      outboxDestinations: ['https://example.com/hooks/order-issued'],
      provisions: {
        grossRevenue: 1500,
        provisionRate: 0.12,
        marginRate: 0.07,
        barterCostRate: 0.03,
        paymentMethod: 'barter',
      },
      gates: {
        documentApproved: true,
        creditApproved: true,
        riskApproved: true,
      },
    });

    expect(result.released).toBe(true);
    expect(updates.operations[0].status).toBe('faturado');
    expect(inserts.operation_status_history[0].to_status).toBe('faturado');
    expect(inserts.operation_logs[0].action).toBe('order_release_granted');
    expect(inserts.business_events[0].event_name).toBe('order_issued');
    expect(inserts.event_outbox[0].status).toBe('pending');
  });
});
