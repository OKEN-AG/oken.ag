import type { QuorumPolicy } from './types';

const DEFAULT_POLICY: QuorumPolicy = {
  tenantId: 'default',
  programId: 'default',
  approvalsRequired: 1,
  signerRequired: true,
  allowSelfApproval: false,
};

export class SettlementPolicyRegistry {
  private readonly policies = new Map<string, QuorumPolicy>();

  set(policy: QuorumPolicy): void {
    this.policies.set(this.key(policy.tenantId, policy.programId), policy);
  }

  get(tenantId: string, programId: string): QuorumPolicy {
    return this.policies.get(this.key(tenantId, programId)) ?? DEFAULT_POLICY;
  }

  private key(tenantId: string, programId: string): string {
    return `${tenantId}::${programId}`;
  }
}
