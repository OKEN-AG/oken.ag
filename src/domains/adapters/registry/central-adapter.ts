import { BaseRegistryAdapter } from './base-adapter';
import type { RegistryPayload, RegistryResponse } from './types';

export class CentralRegistryAdapter extends BaseRegistryAdapter {
  provider = 'central_registradora';

  normalizePayload(payload: RegistryPayload): Record<string, unknown> {
    return {
      operationId: payload.operationId,
      documentId: payload.documentId,
      sourceRef: payload.externalReference,
      metadata: payload.metadata ?? {},
    };
  }

  protected async performSubmit(payload: Record<string, unknown>, idempotencyKey: string): Promise<RegistryResponse> {
    return {
      idempotencyKey,
      externalStatus: 'REGISTERED',
      state: 'registrado',
      evidence: {
        protocol: `${payload.sourceRef}`,
        attachments: [],
        requirements: [],
        registrationConfirmedAt: new Date().toISOString(),
      },
      raw: payload,
    };
  }
}
