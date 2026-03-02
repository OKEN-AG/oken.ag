import { z } from 'zod';

export type OperationVisibleStepId =
  | 'context'
  | 'order'
  | 'simulation'
  | 'payment_barter'
  | 'formalization'
  | 'summary_approval';

export interface OperationStepContract<TInput = unknown> {
  id: OperationVisibleStepId;
  label: string;
  feed: string;
  inputSchema: z.ZodType<TInput>;
  precedent: OperationVisibleStepId | null;
  output: 'operation_step_result + transition_event';
}

const contextSchema = z.object({
  campaignId: z.string().min(1),
  clientName: z.string().min(1),
  distributorId: z.string().min(1),
});

const orderSchema = z.object({
  selectedProductsCount: z.number().int().positive(),
  area: z.number().positive(),
});

const simulationSchema = z.object({
  grossRevenue: z.number().nonnegative(),
  netRevenue: z.number().nonnegative(),
});

const paymentBarterSchema = z.object({
  paymentMethod: z.string().min(1).optional().nullable(),
  counterparty: z.string().optional().nullable(),
});

const formalizationSchema = z.object({
  documentsTracked: z.number().int().nonnegative(),
});

const summaryApprovalSchema = z.object({
  approved: z.boolean(),
  currentStatus: z.string().min(1),
});

export const OPERATION_VISIBLE_STEP_CONTRACTS: OperationStepContract[] = [
  {
    id: 'context',
    label: 'Contexto',
    feed: 'dados salvos da operação + catálogo da campanha ativa',
    inputSchema: contextSchema,
    precedent: null,
    output: 'operation_step_result + transition_event',
  },
  {
    id: 'order',
    label: 'Pedido',
    feed: 'dados salvos da operação + catálogo da campanha ativa',
    inputSchema: orderSchema,
    precedent: 'context',
    output: 'operation_step_result + transition_event',
  },
  {
    id: 'simulation',
    label: 'Simulação',
    feed: 'dados salvos da operação + catálogo da campanha ativa',
    inputSchema: simulationSchema,
    precedent: 'order',
    output: 'operation_step_result + transition_event',
  },
  {
    id: 'payment_barter',
    label: 'Pagamento/Barter',
    feed: 'dados salvos da operação + catálogo da campanha ativa',
    inputSchema: paymentBarterSchema,
    precedent: 'simulation',
    output: 'operation_step_result + transition_event',
  },
  {
    id: 'formalization',
    label: 'Formalização',
    feed: 'dados salvos da operação + catálogo da campanha ativa',
    inputSchema: formalizationSchema,
    precedent: 'payment_barter',
    output: 'operation_step_result + transition_event',
  },
  {
    id: 'summary_approval',
    label: 'Resumo/Aprovação',
    feed: 'dados salvos da operação + catálogo da campanha ativa',
    inputSchema: summaryApprovalSchema,
    precedent: 'formalization',
    output: 'operation_step_result + transition_event',
  },
];

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export async function hashIntegrity(payload: unknown): Promise<string> {
  const text = stableStringify(payload);
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildImmutableOperationSnapshot(params: {
  normalizedInputs: Record<string, unknown>;
  policyVersionIds: string[];
  calculationOutput: Record<string, unknown>;
}) {
  const base = {
    normalized_inputs: params.normalizedInputs,
    policy_version_ids: params.policyVersionIds,
    calculation_output: params.calculationOutput,
  };

  const integrity_hash = await hashIntegrity(base);
  return Object.freeze({ ...base, integrity_hash });
}
