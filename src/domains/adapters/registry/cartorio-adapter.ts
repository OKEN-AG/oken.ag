import { BaseRegistryAdapter } from './base-adapter';
import type { RegistryPayload, RegistryResponse } from './types';

export class CartorioRegistryAdapter extends BaseRegistryAdapter {
  provider = 'cartorio';

  normalizePayload(payload: RegistryPayload): Record<string, unknown> {
    return {
      operation_code: payload.operationId,
      document_code: payload.documentId,
      reference: payload.externalReference,
      metadata: payload.metadata ?? {},
    };
  }

  protected async performSubmit(payload: Record<string, unknown>, idempotencyKey: string): Promise<RegistryResponse> {
    return {
      idempotencyKey,
      externalStatus: 'PROTOCOLLED',
      state: 'pendente',
      evidence: {
        protocol: String(payload.reference),
        attachments: [],
        requirements: [],
      },
      raw: payload,
    };
  }
}
