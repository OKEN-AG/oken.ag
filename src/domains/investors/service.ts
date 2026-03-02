import type {
  InvestorEventComplianceEvidence,
  InvestorLifecycleEvent,
  InvestorLifecycleEventName,
  RegulatoryWrapper,
  SuitabilityAssessment,
} from './types';

const wrapperCompatibilityMatrix: Record<RegulatoryWrapper, { allowsProfessionalOnlyOrders: boolean; evidenceBaseline: string[] }> = {
  platform_88: {
    allowsProfessionalOnlyOrders: false,
    evidenceBaseline: ['kyc', 'suitability', 'regulatory_acceptance'],
  },
  fund_management: {
    allowsProfessionalOnlyOrders: true,
    evidenceBaseline: ['kyc', 'kyb', 'suitability', 'risk', 'regulatory_acceptance'],
  },
  securitization: {
    allowsProfessionalOnlyOrders: true,
    evidenceBaseline: ['kyc', 'kyb', 'risk', 'regulatory_acceptance'],
  },
};

export function getWrapperPolicy(wrapper: RegulatoryWrapper) {
  return wrapperCompatibilityMatrix[wrapper];
}

export function validateSuitabilityForOrder(input: {
  wrapper: RegulatoryWrapper;
  suitability: SuitabilityAssessment;
  requiresProfessionalInvestor: boolean;
}) {
  const policy = getWrapperPolicy(input.wrapper);

  if (input.suitability.outcome !== 'approved') {
    return {
      allowed: false,
      reason: 'Suitability não aprovada para este investidor.',
    };
  }

  if (input.requiresProfessionalInvestor && !policy.allowsProfessionalOnlyOrders) {
    return {
      allowed: false,
      reason: 'Wrapper regulatório não permite ordem exclusiva para investidor profissional.',
    };
  }

  if (input.requiresProfessionalInvestor && input.suitability.riskProfile !== 'professional') {
    return {
      allowed: false,
      reason: 'Ordem restrita para perfil profissional.',
    };
  }

  return { allowed: true };
}

export function buildInvestorLifecycleEvent(input: {
  name: InvestorLifecycleEventName;
  aggregateType: 'investor' | 'investor_order';
  aggregateId: string;
  wrapper: RegulatoryWrapper;
  payload: Record<string, unknown>;
  complianceEvidence: InvestorEventComplianceEvidence[];
}): InvestorLifecycleEvent {
  const policy = getWrapperPolicy(input.wrapper);
  const evidenceTypes = new Set(input.complianceEvidence.map((evidence) => evidence.evidenceType));

  const missingEvidence = policy.evidenceBaseline.filter((evidence) => !evidenceTypes.has(evidence as InvestorEventComplianceEvidence['evidenceType']));

  if (missingEvidence.length > 0) {
    throw new Error(
      `Evento ${input.name} sem evidência de compliance obrigatória para ${input.wrapper}: ${missingEvidence.join(', ')}`,
    );
  }

  return {
    name: input.name,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    wrapper: input.wrapper,
    payload: input.payload,
    complianceEvidence: input.complianceEvidence,
  };
}
