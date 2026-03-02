export interface ResolvedPolicy {
  policyVersionId: string | null;
  policyKey: string;
  versionNo: number | null;
  precedence: number | null;
  lifecycleStatus: 'draft' | 'published' | 'archived' | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  policyPayload: Record<string, unknown>;
  rationale: string | null;
  resolutionSource: 'published' | 'fallback' | null;
}

export type PolicyDomain =
  | 'product_price_policy'
  | 'commodity_pricing_policy'
  | 'freight_policy'
  | 'incentive_policy'
  | 'due_date_policy';

export interface ResolvedPolicySet {
  policySetId: string | null;
  domain: PolicyDomain;
  version: number | null;
  validFrom: string | null;
  validTo: string | null;
  status: 'draft' | 'published' | 'archived' | null;
  tenantId: string | null;
  campaignId: string | null;
  policyPayload: Record<string, unknown>;
  resolutionSource: 'tenant_override' | 'campaign' | 'global_default' | null;
}

const POLICY_DOMAINS: PolicyDomain[] = [
  'product_price_policy',
  'commodity_pricing_policy',
  'freight_policy',
  'incentive_policy',
  'due_date_policy',
];

export async function resolvePolicy(
  supabase: any,
  policyKey: string,
  tenantId: string | null,
): Promise<ResolvedPolicy> {
  const { data, error } = await supabase.rpc('resolve_policy_version', {
    p_policy_key: policyKey,
    p_tenant_id: tenantId,
  });

  if (error) {
    throw new Error(`Policy resolution failed for ${policyKey}: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return {
    policyVersionId: row?.policy_version_id ?? null,
    policyKey,
    versionNo: row?.version_no ?? null,
    precedence: row?.precedence ?? null,
    lifecycleStatus: row?.lifecycle_status ?? null,
    effectiveFrom: row?.effective_from ?? null,
    effectiveTo: row?.effective_to ?? null,
    policyPayload: (row?.policy_payload as Record<string, unknown>) ?? {},
    rationale: row?.rationale ?? null,
    resolutionSource: row?.resolution_source ?? null,
  };
}

export async function recordPolicyDecisionAudit(
  supabase: any,
  payload: {
    tenantId: string | null;
    domainRef: string;
    domainId?: string | null;
    policyKey: string;
    resolvedPolicy: ResolvedPolicy;
    appliedRule: string;
    decisionInputs: Record<string, unknown>;
    decisionOutput: Record<string, unknown>;
    rationale?: string;
  }
): Promise<void> {
  const { error } = await supabase.from('policy_decision_audit').insert({
    tenant_id: payload.tenantId,
    domain_ref: payload.domainRef,
    domain_id: payload.domainId ?? null,
    policy_key: payload.policyKey,
    policy_version_id: payload.resolvedPolicy.policyVersionId,
    policy_version_no: payload.resolvedPolicy.versionNo,
    applied_rule: payload.appliedRule,
    decision_inputs: payload.decisionInputs,
    decision_output: payload.decisionOutput,
    rationale: payload.rationale ?? payload.resolvedPolicy.rationale,
  });

  if (error) {
    throw new Error(`Policy decision audit insert failed: ${error.message}`);
  }
}

export async function resolvePolicySet(
  supabase: any,
  domain: PolicyDomain,
  tenantId: string | null,
  campaignId: string | null,
): Promise<ResolvedPolicySet> {
  const { data, error } = await supabase.rpc('resolve_policy_set', {
    p_domain: domain,
    p_tenant_id: tenantId,
    p_campaign_id: campaignId,
  });

  if (error) {
    throw new Error(`Policy-set resolution failed for ${domain}: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return {
    policySetId: row?.policy_set_id ?? null,
    domain,
    version: row?.version ?? null,
    validFrom: row?.valid_from ?? null,
    validTo: row?.valid_to ?? null,
    status: row?.status ?? null,
    tenantId: row?.tenant_id ?? null,
    campaignId: row?.campaign_id ?? null,
    policyPayload: (row?.policy_payload as Record<string, unknown>) ?? {},
    resolutionSource: row?.resolution_source ?? null,
  };
}

export async function resolvePolicySetDomains(
  supabase: any,
  tenantId: string | null,
  campaignId: string | null,
): Promise<ResolvedPolicySet[]> {
  return Promise.all(POLICY_DOMAINS.map((domain) => resolvePolicySet(supabase, domain, tenantId, campaignId)));
}
