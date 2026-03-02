export const SETTLEMENT_INTENT_ACTIONS = ['create', 'approve', 'execute', 'cancel'] as const;

export type SettlementIntentAction = (typeof SETTLEMENT_INTENT_ACTIONS)[number];

export const SETTLEMENT_ROLES = ['maker', 'checker', 'signer'] as const;

export type SettlementRole = (typeof SETTLEMENT_ROLES)[number];

export type SettlementRail = 'bank' | 'escrow' | 'token';

export type ExecutionStatus =
  | 'pending'
  | 'processing'
  | 'settled'
  | 'failed'
  | 'cancelled';

export type SourceSystem = 'internal' | 'bank_webhook' | 'onchain_watcher';

export interface SettlementActor {
  userId: string;
  role: SettlementRole;
  at: string;
}

export interface SettlementIntent {
  id: string;
  tenantId: string;
  programId: string;
  amount: number;
  currency: string;
  tokenSymbol?: string;
  vaultId?: string;
  action: SettlementIntentAction;
  maker: SettlementActor;
  checker?: SettlementActor;
  signer?: SettlementActor;
  createdAt: string;
  updatedAt: string;
}

export interface RailExecutionState {
  rail: SettlementRail;
  status: ExecutionStatus;
  reference: string;
  amount: number;
  currency: string;
  updatedAt: string;
}

export interface SettlementEvent {
  id: string;
  settlementId: string;
  source: SourceSystem;
  rail: SettlementRail;
  type: 'created' | 'approved' | 'executed' | 'cancelled' | 'reversed' | 'failed';
  status: ExecutionStatus;
  amount: number;
  currency: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface QuorumPolicy {
  tenantId: string;
  programId: string;
  approvalsRequired: number;
  signerRequired: boolean;
  allowSelfApproval: boolean;
}
