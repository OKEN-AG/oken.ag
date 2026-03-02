// Web Crypto-based hash (browser-compatible)
import type { CanonicalDocumentState } from './document-state';

export interface TemplateRegistryEntry {
  id: string;
  code: string;
  name: string;
  jurisdiction: string;
  language: string;
  activeVersionId?: string;
}

export interface TemplateVersionEntry {
  id: string;
  templateId: string;
  version: number;
  body: string;
  clauses: string[];
  createdAt: string;
  createdBy: string;
}

export interface ClauseLibraryEntry {
  id: string;
  code: string;
  title: string;
  text: string;
  tags: string[];
  mandatory: boolean;
  version: number;
}

export interface DocumentInstance {
  id: string;
  dealId: string;
  templateVersionId: string;
  snapshotId: string;
  snapshotHash: string;
  state: CanonicalDocumentState;
  content: string;
  contentHash: string;
  createdAt: string;
}

export interface SignatureWorkflowStep {
  signerId: string;
  role: string;
  acceptedAt?: string;
  evidenceHash?: string;
}

export interface SignatureWorkflow {
  documentId: string;
  state: 'pending' | 'in_progress' | 'completed' | 'failed';
  steps: SignatureWorkflowStep[];
  completedAt?: string;
}

export interface RegistrationWorkflow {
  documentId: string;
  provider: string;
  protocol?: string;
  status: 'pending' | 'submitted' | 'registered' | 'failed';
  evidenceHash?: string;
  trail: Array<{ at: string; event: string; payload: Record<string, unknown> }>;
}

export function hashPayload(payload: unknown): string {
  // Synchronous simple hash for deterministic fingerprinting (not cryptographic security)
  const str = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function createDocumentFromImmutableSnapshot(params: {
  id: string;
  dealId: string;
  templateVersion: TemplateVersionEntry;
  snapshotId: string;
  dealSnapshot: Record<string, unknown>;
  renderedContent: string;
  createdAt?: string;
}): DocumentInstance {
  const createdAt = params.createdAt ?? new Date().toISOString();
  const immutableSnapshot = Object.freeze(structuredClone(params.dealSnapshot));
  const snapshotHash = hashPayload(immutableSnapshot);
  return {
    id: params.id,
    dealId: params.dealId,
    templateVersionId: params.templateVersion.id,
    snapshotId: params.snapshotId,
    snapshotHash,
    state: 'draft',
    content: params.renderedContent,
    contentHash: hashPayload(params.renderedContent),
    createdAt,
  };
}

export function appendAcceptanceTrail(
  workflow: SignatureWorkflow,
  step: SignatureWorkflowStep,
): SignatureWorkflow {
  const nextSteps = workflow.steps.map((current) =>
    current.signerId === step.signerId
      ? { ...current, acceptedAt: step.acceptedAt, evidenceHash: step.evidenceHash }
      : current,
  );

  const completed = nextSteps.every((current) => Boolean(current.acceptedAt));

  return {
    ...workflow,
    steps: nextSteps,
    state: completed ? 'completed' : 'in_progress',
    completedAt: completed ? step.acceptedAt : workflow.completedAt,
  };
}
