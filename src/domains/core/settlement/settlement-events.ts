import type { SettlementEvent } from './types';

interface BankWebhookPayload {
  event_id: string;
  settlement_id: string;
  movement_type: 'created' | 'approved' | 'executed' | 'cancelled' | 'failed';
  status: 'pending' | 'processing' | 'settled' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  bank_reference: string;
  occurred_at: string;
}

interface OnchainWatcherPayload {
  tx_hash: string;
  settlement_id: string;
  event_type: 'executed' | 'reversed' | 'failed' | 'created';
  amount: number;
  token_symbol: string;
  block_timestamp: string;
}

export function fromBankWebhook(payload: BankWebhookPayload): SettlementEvent {
  return {
    id: payload.event_id,
    settlementId: payload.settlement_id,
    source: 'bank_webhook',
    rail: 'bank',
    type: payload.movement_type,
    status: payload.status,
    amount: payload.amount,
    currency: payload.currency,
    occurredAt: payload.occurred_at,
    metadata: {
      bankReference: payload.bank_reference,
    },
  };
}

export function fromOnchainWatcher(payload: OnchainWatcherPayload): SettlementEvent {
  return {
    id: payload.tx_hash,
    settlementId: payload.settlement_id,
    source: 'onchain_watcher',
    rail: 'token',
    type: payload.event_type,
    status: payload.event_type === 'failed' ? 'failed' : 'settled',
    amount: payload.amount,
    currency: payload.token_symbol,
    occurredAt: payload.block_timestamp,
    metadata: {
      txHash: payload.tx_hash,
    },
  };
}
