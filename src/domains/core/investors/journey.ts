import type { InvestorJourneyState } from './types';

export const investorJourneySteps: Array<{ state: InvestorJourneyState; label: string }> = [
  { state: 'onboarding', label: 'Onboarding' },
  { state: 'suitability_pending', label: 'Suitability pendente' },
  { state: 'suitability_approved', label: 'Suitability aprovada' },
  { state: 'terms_pending', label: 'Aceite pendente' },
  { state: 'terms_accepted', label: 'Termos aceitos' },
  { state: 'order_pending', label: 'Ordem pendente' },
  { state: 'order_submitted', label: 'Ordem enviada' },
  { state: 'allocation_pending', label: 'Alocação pendente' },
  { state: 'allocated', label: 'Alocado' },
  { state: 'statement_available', label: 'Extrato disponível' },
  { state: 'distribution_pending', label: 'Distribuição pendente' },
  { state: 'distributed', label: 'Distribuído' },
];

export function getNextJourneyState(currentState: InvestorJourneyState): InvestorJourneyState {
  const index = investorJourneySteps.findIndex((step) => step.state === currentState);
  if (index < 0 || index === investorJourneySteps.length - 1) return currentState;
  return investorJourneySteps[index + 1].state;
}
