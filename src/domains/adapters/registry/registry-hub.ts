import { normalizeDocumentState } from '@/domains/core/formalization';
import type { RegistryAdapter, RegistryPayload, RegistryResponse } from './types';

export interface RegistryHubOptions {
  maxRetries?: number;
}

export class RegistryHub {
  private adapters = new Map<string, RegistryAdapter>();
  private responseByIdempotency = new Map<string, RegistryResponse>();
  private maxRetries: number;

  constructor(options: RegistryHubOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
  }

  registerAdapter(adapter: RegistryAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  async submit(provider: string, payload: RegistryPayload, idempotencyKey: string): Promise<RegistryResponse> {
    const cached = this.responseByIdempotency.get(idempotencyKey);
    if (cached) return cached;

    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Registry adapter not found for provider: ${provider}`);
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await adapter.submit(payload, idempotencyKey);
        const normalized: RegistryResponse = {
          ...response,
          state: normalizeDocumentState(response.state),
        };
        this.responseByIdempotency.set(idempotencyKey, normalized);
        return normalized;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }
}
