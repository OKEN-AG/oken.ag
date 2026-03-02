import { describe, expect, it } from 'vitest';
import {
  RailExecutionBook,
  SettlementPolicyRegistry,
  advanceIntentAction,
  buildMismatchMetrics,
  createSettlementIntent,
  fromBankWebhook,
  fromOnchainWatcher,
} from '@/domains/core/settlement';

describe('settlement core', () => {
  it('define contrato canônico de intent com segregação maker-checker-signer', () => {
    const policy = {
      tenantId: 't1',
      programId: 'p1',
      approvalsRequired: 1,
      signerRequired: true,
      allowSelfApproval: false,
    } as const;

    const intent = createSettlementIntent({
      id: 'set-1',
      tenantId: 't1',
      programId: 'p1',
      amount: 100,
      currency: 'BRL',
      maker: { userId: 'maker-1', role: 'maker', at: new Date().toISOString() },
    });

    const approved = advanceIntentAction(intent, 'approve', {
      userId: 'checker-1',
      role: 'checker',
      at: new Date().toISOString(),
    }, policy);

    const executed = advanceIntentAction(approved, 'execute', {
      userId: 'signer-1',
      role: 'signer',
      at: new Date().toISOString(),
    }, policy);

    expect(executed.action).toBe('execute');
    expect(executed.checker?.userId).toBe('checker-1');
    expect(executed.signer?.userId).toBe('signer-1');
  });

  it('mantém estado por rail e reconciliação cruzada', () => {
    const book = new RailExecutionBook();

    book.upsert({
      rail: 'bank',
      status: 'settled',
      reference: 'bank-1',
      amount: 100,
      currency: 'BRL',
      updatedAt: new Date().toISOString(),
    });

    book.upsert({
      rail: 'escrow',
      status: 'settled',
      reference: 'escrow-1',
      amount: 100,
      currency: 'BRL',
      updatedAt: new Date().toISOString(),
    });

    book.upsert({
      rail: 'token',
      status: 'settled',
      reference: 'token-1',
      amount: 95,
      currency: 'BRL',
      updatedAt: new Date().toISOString(),
    });

    const reconciliation = book.reconcileCrossRail();

    expect(reconciliation.isBalanced).toBe(false);
    expect(reconciliation.mismatches).toEqual([{ rail: 'token', amount: 95 }]);
  });

  it('normaliza webhook bancário e watcher on-chain no mesmo modelo de evento', () => {
    const bankEvent = fromBankWebhook({
      event_id: 'evt-1',
      settlement_id: 'set-1',
      movement_type: 'executed',
      status: 'settled',
      amount: 100,
      currency: 'BRL',
      bank_reference: 'bank-ref',
      occurred_at: new Date().toISOString(),
    });

    const chainEvent = fromOnchainWatcher({
      tx_hash: '0xabc',
      settlement_id: 'set-1',
      event_type: 'executed',
      amount: 100,
      token_symbol: 'USDC',
      block_timestamp: new Date().toISOString(),
    });

    expect(bankEvent.settlementId).toBe(chainEvent.settlementId);
    expect(bankEvent.rail).toBe('bank');
    expect(chainEvent.rail).toBe('token');
  });

  it('suporta políticas de quorum por tenant/programa', () => {
    const registry = new SettlementPolicyRegistry();
    registry.set({
      tenantId: 't2',
      programId: 'p2',
      approvalsRequired: 2,
      signerRequired: false,
      allowSelfApproval: true,
    });

    const policy = registry.get('t2', 'p2');

    expect(policy.approvalsRequired).toBe(2);
    expect(policy.signerRequired).toBe(false);
    expect(registry.get('unknown', 'unknown').signerRequired).toBe(true);
  });

  it('publica métricas e alertas de mismatch fiat↔token↔vault', () => {
    const { metrics, alerts } = buildMismatchMetrics([
      { settlementId: 'set-1', fiatAmount: 100, tokenAmount: 99, vaultAmount: 100 },
      { settlementId: 'set-2', fiatAmount: 200, tokenAmount: 200, vaultAmount: 200 },
    ]);

    expect(metrics.totalObserved).toBe(2);
    expect(metrics.mismatchCount).toBe(1);
    expect(alerts.some((alert) => alert.code === 'FIAT_TOKEN_MISMATCH')).toBe(true);
  });
});
