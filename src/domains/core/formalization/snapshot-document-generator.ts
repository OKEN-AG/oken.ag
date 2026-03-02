export interface CoreSnapshot {
  id: string;
  payload: Record<string, unknown>;
  payloadHash?: string | null;
  createdAt: string;
}

export interface TemplateVersionSource {
  id: string;
  body: string;
  versionNumber: number;
}

export interface GeneratedDocumentDraft {
  snapshotId: string;
  templateVersionId: string;
  payloadFrozen: Record<string, unknown>;
  renderedContent: string;
  contentHash?: string | null;
}

export function generateDocumentFromSnapshot(
  snapshot: CoreSnapshot,
  templateVersion: TemplateVersionSource,
): GeneratedDocumentDraft {
  return {
    snapshotId: snapshot.id,
    templateVersionId: templateVersion.id,
    payloadFrozen: structuredClone(snapshot.payload),
    renderedContent: templateVersion.body,
    contentHash: snapshot.payloadHash ?? null,
  };
}
