import { isStateAtLeast, normalizeDocumentState } from './document-state';

export interface DocumentRequirement {
  docType: string;
  minimumState: 'aprovado' | 'assinado' | 'registrado';
}

export interface DocumentSnapshot {
  doc_type: string;
  status: string;
}

export interface MinimumRuleResult {
  canDisburse: boolean;
  missing: string[];
}

export function validateMinimumDocumentRule(
  requiredDocuments: DocumentRequirement[],
  existingDocuments: DocumentSnapshot[],
): MinimumRuleResult {
  const missing = requiredDocuments
    .filter((requirement) => {
      const currentDoc = existingDocuments.find((doc) => doc.doc_type === requirement.docType);
      if (!currentDoc) return true;
      const current = normalizeDocumentState(currentDoc.status);
      return !isStateAtLeast(current, requirement.minimumState);
    })
    .map((requirement) => requirement.docType);

  return {
    canDisburse: missing.length === 0,
    missing,
  };
}
