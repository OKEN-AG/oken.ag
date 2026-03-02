import type { RegistryAdapter, RegistryPayload, RegistryResponse } from './types';

export abstract class BaseRegistryAdapter implements RegistryAdapter {
  abstract provider: string;

  abstract normalizePayload(payload: RegistryPayload): Record<string, unknown>;
  protected abstract performSubmit(payload: Record<string, unknown>, idempotencyKey: string): Promise<RegistryResponse>;

  async submit(payload: RegistryPayload, idempotencyKey: string): Promise<RegistryResponse> {
    const normalized = this.normalizePayload(payload);
    return this.performSubmit(normalized, idempotencyKey);
  }
}
