export type RegulatoryWrapper = 'platform_88' | 'fund_management' | 'securitization';

export type InvestorStatus = 'prospect' | 'onboarding' | 'active' | 'suspended' | 'offboarded';

export type SuitabilityRiskProfile = 'conservative' | 'moderate' | 'sophisticated' | 'professional';

export type SuitabilityOutcome = 'approved' | 'restricted' | 'rejected';

export type InvestorOrderStatus =
  | 'draft'
  | 'submitted'
  | 'allocated'
  | 'partially_settled'
  | 'settled'
  | 'canceled';

export type InvestorLifecycleEventName =
  | 'investor.onboarding.started'
  | 'investor.kyc.completed'
  | 'investor.suitability.completed'
  | 'investor.regulatory.accepted'
  | 'investor.order.submitted'
  | 'investor.order.allocated'
  | 'investor.order.settled'
  | 'investor.distribution.booked'
  | 'investor.statement.generated'
  | 'investor.tax_document.generated';

export type ComplianceEvidenceType = 'kyc' | 'kyb' | 'suitability' | 'risk' | 'regulatory_acceptance';

export interface Investor {
  id: string;
  tenantId: string;
  partyId: string;
  wrapper: RegulatoryWrapper;
  status: InvestorStatus;
  onboardingCompletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvestorOrder {
  id: string;
  tenantId: string;
  investorId: string;
  offerId: string;
  status: InvestorOrderStatus;
  amount: number;
  allocatedAmount: number;
  settledAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SuitabilityAssessment {
  id: string;
  tenantId: string;
  investorId: string;
  questionnaireVersion: string;
  riskProfile: SuitabilityRiskProfile;
  outcome: SuitabilityOutcome;
  score: number;
  restrictions: string[];
  assessedAt: string;
  expiresAt?: string;
}

export interface RegulatoryAcceptance {
  id: string;
  tenantId: string;
  investorId: string;
  wrapper: RegulatoryWrapper;
  documentType: 'term' | 'risk_disclosure' | 'privacy_policy' | 'offer_memorandum';
  documentVersion: string;
  acceptedAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InvestorEventComplianceEvidence {
  id: string;
  tenantId: string;
  eventName: InvestorLifecycleEventName;
  aggregateType: 'investor' | 'investor_order';
  aggregateId: string;
  evidenceType: ComplianceEvidenceType;
  subjectId: string;
  hashSha256: string;
  provider: string;
  metadata: Record<string, string | number | boolean | null>;
  capturedAt: string;
}

export interface InvestorLifecycleEvent {
  name: InvestorLifecycleEventName;
  aggregateType: 'investor' | 'investor_order';
  aggregateId: string;
  wrapper: RegulatoryWrapper;
  payload: Record<string, unknown>;
  complianceEvidence: InvestorEventComplianceEvidence[];
}
