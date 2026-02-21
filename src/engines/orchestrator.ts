import type { OperationStatus, DocumentType, JourneyModule, WagonStage, GuaranteeCategory, GuaranteeCoverage } from '@/types/barter';

/**
 * ORCHESTRATOR ENGINE
 * 
 * Manages the "train" metaphor: each operation is a train that moves
 * through stations (stages/wagons). The train only advances when
 * all required documents for the current stage are validated.
 * 
 * FIX: Sequential blocking — only one stage can be "em_progresso" at a time.
 * FIX: canAdvance checks only current-status stages, not future ones.
 * NEW: PoE/PoL validation gates for garantido→faturado transition.
 */

export interface StageDefinition {
  module: JourneyModule;
  name: string;
  requiredDocuments: DocumentType[];
  requiredStatus: OperationStatus;
  nextStatus: OperationStatus;
}

export const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    module: 'adesao',
    name: 'Termo de Adesão',
    requiredDocuments: ['termo_adesao'],
    requiredStatus: 'simulacao',
    nextStatus: 'pedido',
  },
  {
    module: 'simulacao',
    name: 'Simulação & Pedido',
    requiredDocuments: ['pedido'],
    requiredStatus: 'pedido',
    nextStatus: 'formalizado',
  },
  {
    module: 'formalizacao',
    name: 'Formalização Barter',
    requiredDocuments: ['termo_barter'],
    requiredStatus: 'formalizado',
    nextStatus: 'formalizado',
  },
  {
    module: 'documentos',
    name: 'Documentação (CCV/Cessão)',
    requiredDocuments: ['ccv', 'cessao_credito'],
    requiredStatus: 'formalizado',
    nextStatus: 'garantido',
  },
  {
    module: 'garantias',
    name: 'Garantias',
    requiredDocuments: ['cpr'],
    requiredStatus: 'garantido',
    nextStatus: 'faturado',
  },
];

const STATUS_ORDER: OperationStatus[] = [
  'simulacao', 'pedido', 'formalizado', 'garantido', 'faturado', 'monitorando', 'liquidado',
];

// Map document types to their guarantee category
const DOC_GUARANTEE_CATEGORY: Partial<Record<DocumentType, GuaranteeCategory>> = {
  cpr: 'poe',
  ccv: 'pol',
  cessao_credito: 'pol',
  certificado_aceite: 'pod',
};

function isDocComplete(existingDocuments: { doc_type: string; status: string; guarantee_category?: string }[], docType: string): boolean {
  const doc = existingDocuments.find(d => d.doc_type === docType);
  return !!doc && (doc.status === 'validado' || doc.status === 'assinado');
}

/**
 * Check if PoE (Proof of Existence) is satisfied.
 * At least one document categorized as 'poe' must be validated/signed.
 */
function hasPoE(existingDocuments: { doc_type: string; status: string; guarantee_category?: string }[]): boolean {
  return existingDocuments.some(d => {
    const category = d.guarantee_category || DOC_GUARANTEE_CATEGORY[d.doc_type as DocumentType];
    return category === 'poe' && (d.status === 'validado' || d.status === 'assinado');
  });
}

/**
 * Check if PoL (Proof of Liquidity) is satisfied.
 * At least one document categorized as 'pol' must be validated/signed.
 */
function hasPoL(existingDocuments: { doc_type: string; status: string; guarantee_category?: string }[]): boolean {
  return existingDocuments.some(d => {
    const category = d.guarantee_category || DOC_GUARANTEE_CATEGORY[d.doc_type as DocumentType];
    return category === 'pol' && (d.status === 'validado' || d.status === 'assinado');
  });
}

/**
 * Calculate guarantee coverage for an operation.
 */
export function calculateGuaranteeCoverage(
  guarantees: { estimated_value: number; ip_at_evaluation: number; status: string }[],
  operationAmount: number,
  aforoPercent: number
): GuaranteeCoverage {
  const validGuarantees = guarantees.filter(g => g.status === 'validado');
  const base = validGuarantees.reduce((sum, g) => sum + g.estimated_value, 0);
  const avgIP = validGuarantees.length > 0
    ? validGuarantees.reduce((sum, g) => sum + g.ip_at_evaluation, 0) / validGuarantees.length
    : 1;
  const effective = base * avgIP;
  const required = operationAmount * (aforoPercent / 100);
  return { base, effective, required, sufficient: effective >= required };
}

/**
 * Build wagon stages for an operation.
 */
export function buildWagonStages(
  activeModules: JourneyModule[],
  currentStatus: OperationStatus,
  existingDocuments: { doc_type: string; status: string; guarantee_category?: string }[]
): WagonStage[] {
  const stages: WagonStage[] = [];
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);

  for (const def of STAGE_DEFINITIONS) {
    if (!activeModules.includes(def.module)) continue;

    const stageStatusIdx = STATUS_ORDER.indexOf(def.requiredStatus);

    const completedDocs = def.requiredDocuments.filter(dt => isDocComplete(existingDocuments, dt));
    const allDocsComplete = completedDocs.length >= def.requiredDocuments.length;

    let status: WagonStage['status'];

    if (currentIdx > stageStatusIdx) {
      status = 'concluido';
    } else if (currentIdx === stageStatusIdx) {
      const prevStage = stages[stages.length - 1];
      const prevBlocked = prevStage && prevStage.status !== 'concluido';

      if (prevBlocked) {
        status = 'bloqueado';
      } else {
        status = allDocsComplete ? 'concluido' : 'em_progresso';
      }
    } else {
      status = 'bloqueado';
    }

    stages.push({
      id: def.module,
      name: def.name,
      module: def.module,
      status,
      requiredDocuments: def.requiredDocuments,
      completedDocuments: completedDocs as DocumentType[],
      completedAt: status === 'concluido' ? new Date().toISOString() : undefined,
    });
  }

  return stages;
}

/**
 * Check if an operation can advance to the next status.
 * NEW: For garantido→faturado, requires PoE + PoL validated.
 */
export function canAdvance(
  activeModules: JourneyModule[],
  currentStatus: OperationStatus,
  existingDocuments: { doc_type: string; status: string; guarantee_category?: string }[]
): OperationStatus | null {
  const stages = buildWagonStages(activeModules, currentStatus, existingDocuments);

  const currentStages = stages.filter(s => {
    const def = STAGE_DEFINITIONS.find(d => d.module === s.module);
    return def && def.requiredStatus === currentStatus;
  });

  if (currentStages.length === 0) {
    const allDone = stages.length > 0 && stages.every(s => s.status === 'concluido');
    if (allDone) {
      const lastDef = STAGE_DEFINITIONS.find(d => d.module === stages[stages.length - 1].module);
      return lastDef?.nextStatus || null;
    }
    return null;
  }

  const allCurrentComplete = currentStages.every(s => s.status === 'concluido');
  if (!allCurrentComplete) return null;

  // PoE/PoL gate: garantido → faturado requires proof of existence AND liquidity
  if (currentStatus === 'garantido') {
    if (!hasPoE(existingDocuments)) return null;
    if (!hasPoL(existingDocuments)) return null;
  }

  const lastCurrentStage = currentStages[currentStages.length - 1];
  const lastDef = STAGE_DEFINITIONS.find(d => d.module === lastCurrentStage.module);
  return lastDef?.nextStatus || null;
}

/**
 * Get a human-readable summary of what's blocking advancement.
 */
export function getBlockingReason(
  activeModules: JourneyModule[],
  currentStatus: OperationStatus,
  existingDocuments: { doc_type: string; status: string; guarantee_category?: string }[]
): string | null {
  // Check PoE/PoL gates first
  if (currentStatus === 'garantido') {
    const missingProofs: string[] = [];
    if (!hasPoE(existingDocuments)) missingProofs.push('Prova de Existência (PoE) — CPR ou laudo validado');
    if (!hasPoL(existingDocuments)) missingProofs.push('Prova de Liquidez (PoL) — CCV ou cessão validada');
    if (missingProofs.length > 0) return `Provas pendentes: ${missingProofs.join('; ')}`;
  }

  const stages = buildWagonStages(activeModules, currentStatus, existingDocuments);
  const currentStage = stages.find(s => s.status === 'em_progresso');
  
  if (!currentStage) return null;

  const missing = currentStage.requiredDocuments.filter(
    d => !currentStage.completedDocuments.includes(d)
  );

  if (missing.length > 0) {
    const labels: Record<string, string> = {
      termo_adesao: 'Termo de Adesão',
      pedido: 'Pedido',
      termo_barter: 'Termo de Barter',
      ccv: 'Contrato de Compra e Venda',
      cessao_credito: 'Cessão de Crédito',
      cpr: 'CPR',
      duplicata: 'Duplicata',
      nota_comercial: 'Nota Comercial',
      hipoteca: 'Hipoteca',
      alienacao_fiduciaria: 'Alienação Fiduciária',
      certificado_aceite: 'Certificado de Aceite',
    };
    return `Documentos pendentes: ${missing.map(m => labels[m] || m).join(', ')}`;
  }

  return null;
}
