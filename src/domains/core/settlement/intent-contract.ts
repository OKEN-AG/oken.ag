import type { QuorumPolicy, SettlementActor, SettlementIntent, SettlementIntentAction } from './types';

export function createSettlementIntent(input: {
  id: string;
  tenantId: string;
  programId: string;
  amount: number;
  currency: string;
  tokenSymbol?: string;
  vaultId?: string;
  maker: SettlementActor;
  now?: string;
}): SettlementIntent {
  const now = input.now ?? new Date().toISOString();

  return {
    id: input.id,
    tenantId: input.tenantId,
    programId: input.programId,
    amount: input.amount,
    currency: input.currency,
    tokenSymbol: input.tokenSymbol,
    vaultId: input.vaultId,
    action: 'create',
    maker: input.maker,
    createdAt: now,
    updatedAt: now,
  };
}

export function advanceIntentAction(
  intent: SettlementIntent,
  action: SettlementIntentAction,
  actor: SettlementActor,
  policy: QuorumPolicy,
  now = new Date().toISOString(),
): SettlementIntent {
  if (action === 'approve') {
    if (actor.role !== 'checker') {
      throw new Error('Apenas checker pode aprovar intent.');
    }

    if (!policy.allowSelfApproval && actor.userId === intent.maker.userId) {
      throw new Error('Maker não pode aprovar a própria intent com a política atual.');
    }

    return {
      ...intent,
      action,
      checker: actor,
      updatedAt: now,
    };
  }

  if (action === 'execute') {
    if (policy.signerRequired && actor.role !== 'signer') {
      throw new Error('Execução requer signer.');
    }

    if (!policy.signerRequired && actor.role !== 'checker' && actor.role !== 'signer') {
      throw new Error('Execução requer checker ou signer.');
    }

    if (policy.approvalsRequired > 0 && !intent.checker) {
      throw new Error('Execução bloqueada: aprovação obrigatória ausente.');
    }

    return {
      ...intent,
      action,
      signer: actor.role === 'signer' ? actor : intent.signer,
      updatedAt: now,
    };
  }

  if (action === 'cancel') {
    if (actor.role === 'maker' && actor.userId !== intent.maker.userId) {
      throw new Error('Apenas o maker original pode cancelar como maker.');
    }

    return {
      ...intent,
      action,
      updatedAt: now,
    };
  }

  return {
    ...intent,
    action,
    updatedAt: now,
  };
}
