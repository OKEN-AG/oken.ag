export type RegulatoryWrapper = 'platform_88' | 'asset_management_funds' | 'securitization';

export type InvestorJourneyState =
  | 'onboarding'
  | 'suitability_pending'
  | 'suitability_approved'
  | 'terms_pending'
  | 'terms_accepted'
  | 'order_pending'
  | 'order_submitted'
  | 'allocation_pending'
  | 'allocated'
  | 'statement_available'
  | 'distribution_pending'
  | 'distributed';

export interface Investor {
  id: string;
  full_name: string;
  document_number: string;
  email: string | null;
  wrapper_type: RegulatoryWrapper;
  journey_state: InvestorJourneyState;
  suitability_score: number | null;
  suitability_profile: string | null;
  terms_version: string | null;
  terms_accepted_at: string | null;
}

export interface InvestorOrder {
  id: string;
  investor_id: string;
  operation_id: string | null;
  journey_state: InvestorJourneyState;
  gross_amount: number;
  net_amount: number;
  allocated_amount: number;
  statement_reference: string | null;
  distribution_reference: string | null;
  created_at: string;
}

export interface InvestorEventEvidence {
  id: string;
  investor_id: string;
  investor_order_id: string | null;
  event_type: string;
  from_state: InvestorJourneyState | null;
  to_state: InvestorJourneyState;
  wrapper_type: RegulatoryWrapper;
  payload: Record<string, unknown>;
  happened_at: string;
}
