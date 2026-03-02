import { describe, expect, it } from 'vitest';
import { RegistryHub } from '@/domains/adapters/registry';
import { BaseRegistryAdapter } from '@/domains/adapters/registry/base-adapter';
import type { RegistryPayload, RegistryResponse } from '@/domains/adapters/registry/types';

class FlakyAdapter extends BaseRegistryAdapter {
  provider = 'flaky';
  attempts = 0;

  normalizePayload(payload: RegistryPayload): Record<string, unknown> {
    return { ...payload, normalized: true };
  }

  protected async performSubmit(payload: Record<string, unknown>, idempotencyKey: string): Promise<RegistryResponse> {
    this.attempts += 1;
    if (this.attempts < 2) {
      throw new Error('temporary failure');
    }

    return {
      idempotencyKey,
      externalStatus: 'VALIDATED',
      state: 'aprovado',
      evidence: {
        protocol: String(payload.externalReference),
        attachments: ['anexo.pdf'],
        requirements: ['assinatura_faltante'],
      },
      raw: payload,
    };
  }
}

describe('registry hub', () => {
  it('aplica retry idempotente e mapeia status canônico', async () => {
    const hub = new RegistryHub({ maxRetries: 3 });
    const adapter = new FlakyAdapter();

    hub.registerAdapter(adapter);

    const payload: RegistryPayload = {
      operationId: 'op-1',
      documentId: 'doc-1',
      externalReference: 'PROTO-1',
    };

    const first = await hub.submit('flaky', payload, 'idem-1');
    const second = await hub.submit('flaky', payload, 'idem-1');

    expect(first.state).toBe('aprovado');
    expect(second.state).toBe('aprovado');
    expect(adapter.attempts).toBe(2);
  });
});
