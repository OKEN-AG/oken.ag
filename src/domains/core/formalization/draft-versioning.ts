import type { CanonicalDocumentState } from './document-state';

export interface DraftVersion {
  documentId: string;
  version: number;
  state: CanonicalDocumentState;
  contentHash: string;
  createdBy: string;
  createdAt: string;
  notes?: string;
}

export class DraftVersioningService {
  private versions = new Map<string, DraftVersion[]>();

  append(version: DraftVersion): DraftVersion {
    const current = this.versions.get(version.documentId) ?? [];
    const nextVersion = {
      ...version,
      version: current.length + 1,
    };

    this.versions.set(version.documentId, [...current, nextVersion]);
    return nextVersion;
  }

  getHistory(documentId: string): DraftVersion[] {
    return this.versions.get(documentId) ?? [];
  }

  getLatest(documentId: string): DraftVersion | undefined {
    const history = this.versions.get(documentId) ?? [];
    return history[history.length - 1];
  }
}
