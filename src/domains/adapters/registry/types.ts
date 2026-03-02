import type { CanonicalDocumentState } from '@/domains/core/formalization';

export interface RegistryPayload {
  operationId: string;
  documentId: string;
  externalReference: string;
  metadata?: Record<string, unknown>;
}

export interface RegistryEvidence {
  protocol: string;
  attachments: string[];
  requirements: string[];
  registrationConfirmedAt?: string;
}

export interface RegistryResponse {
  idempotencyKey: string;
  externalStatus: string;
  state: CanonicalDocumentState;
  evidence: RegistryEvidence;
  raw: unknown;
}

export interface RegistryAdapter {
  provider: string;
  normalizePayload(payload: RegistryPayload): Record<string, unknown>;
  submit(payload: RegistryPayload, idempotencyKey: string): Promise<RegistryResponse>;
}
