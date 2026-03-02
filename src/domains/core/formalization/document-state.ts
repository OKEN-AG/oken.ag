export const CANONICAL_DOCUMENT_STATES = [
  'draft',
  'aprovado',
  'assinado',
  'registrado',
  'pendente',
  'substituido',
  'cancelado',
] as const;

export type CanonicalDocumentState = (typeof CANONICAL_DOCUMENT_STATES)[number];

const LEGACY_TO_CANONICAL: Record<string, CanonicalDocumentState> = {
  emitido: 'draft',
  validado: 'aprovado',
  assinado: 'assinado',
  pendente: 'pendente',
  registrado: 'registrado',
  substituido: 'substituido',
  'substituído': 'substituido',
  cancelado: 'cancelado',
  draft: 'draft',
  aprovado: 'aprovado',
};

const DOCUMENT_STATE_MACHINE: Record<CanonicalDocumentState, CanonicalDocumentState[]> = {
  pendente: ['draft', 'cancelado'],
  draft: ['aprovado', 'cancelado'],
  aprovado: ['assinado', 'substituido', 'cancelado'],
  assinado: ['registrado', 'substituido', 'cancelado'],
  registrado: ['substituido', 'cancelado'],
  substituido: ['draft', 'cancelado'],
  cancelado: [],
};

export function normalizeDocumentState(state: string): CanonicalDocumentState {
  return LEGACY_TO_CANONICAL[state] ?? 'pendente';
}

const STATE_RANK: Record<CanonicalDocumentState, number> = {
  pendente: 0,
  draft: 1,
  aprovado: 2,
  assinado: 3,
  registrado: 4,
  substituido: 5,
  cancelado: 6,
};

export function isStateAtLeast(
  current: CanonicalDocumentState,
  expected: CanonicalDocumentState,
): boolean {
  return STATE_RANK[current] >= STATE_RANK[expected];
}

export function canTransitionDocumentState(
  current: CanonicalDocumentState,
  next: CanonicalDocumentState,
): boolean {
  return DOCUMENT_STATE_MACHINE[current].includes(next);
}

export function getNextDocumentStates(current: CanonicalDocumentState): CanonicalDocumentState[] {
  return DOCUMENT_STATE_MACHINE[current];
}
