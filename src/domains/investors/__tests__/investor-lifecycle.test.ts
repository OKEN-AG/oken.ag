import { buildInvestorLifecycleEvent, validateSuitabilityForOrder } from '../service';
import type { InvestorEventComplianceEvidence } from '../types';

const now = new Date().toISOString();

const platformEvidence: InvestorEventComplianceEvidence[] = [
  {
    id: 'e1',
    tenantId: 't1',
    eventName: 'investor.order.submitted',
    aggregateType: 'investor_order',
    aggregateId: 'o1',
    evidenceType: 'kyc',
    subjectId: 'inv1',
    hashSha256: 'hash-1',
    provider: 'sumsub',
    metadata: {},
    capturedAt: now,
  },
  {
    id: 'e2',
    tenantId: 't1',
    eventName: 'investor.order.submitted',
    aggregateType: 'investor_order',
    aggregateId: 'o1',
    evidenceType: 'suitability',
    subjectId: 'inv1',
    hashSha256: 'hash-2',
    provider: 'internal',
    metadata: {},
    capturedAt: now,
  },
  {
    id: 'e3',
    tenantId: 't1',
    eventName: 'investor.order.submitted',
    aggregateType: 'investor_order',
    aggregateId: 'o1',
    evidenceType: 'regulatory_acceptance',
    subjectId: 'inv1',
    hashSha256: 'hash-3',
    provider: 'docusign',
    metadata: {},
    capturedAt: now,
  },
];

describe('investor lifecycle', () => {
  it('rejects professional-only order for non professional suitability', () => {
    const result = validateSuitabilityForOrder({
      wrapper: 'fund_management',
      suitability: {
        id: 's1',
        tenantId: 't1',
        investorId: 'inv1',
        questionnaireVersion: '1.0.0',
        riskProfile: 'moderate',
        outcome: 'approved',
        score: 72,
        restrictions: [],
        assessedAt: now,
      },
      requiresProfessionalInvestor: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('perfil profissional');
  });

  it('builds event when wrapper baseline evidence is complete', () => {
    const event = buildInvestorLifecycleEvent({
      name: 'investor.order.submitted',
      aggregateType: 'investor_order',
      aggregateId: 'o1',
      wrapper: 'platform_88',
      payload: { orderId: 'o1', amount: 100000 },
      complianceEvidence: platformEvidence,
    });

    expect(event.name).toBe('investor.order.submitted');
    expect(event.complianceEvidence).toHaveLength(3);
  });

  it('throws when mandatory evidence is missing', () => {
    expect(() =>
      buildInvestorLifecycleEvent({
        name: 'investor.order.submitted',
        aggregateType: 'investor_order',
        aggregateId: 'o2',
        wrapper: 'securitization',
        payload: { orderId: 'o2' },
        complianceEvidence: platformEvidence,
      }),
    ).toThrow('kyb');
  });
});
