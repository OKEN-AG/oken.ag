import type { OperationStatus, DocumentType, JourneyModule, WagonStage } from '@/types/barter';

/**
 * ORCHESTRATOR ENGINE
 * 
 * Manages the "train" metaphor: each operation is a train that moves
 * through stations (stages/wagons). The train only advances when
 * all required documents for the current stage are validated.
 */

export interface StageDefinition {
  module: JourneyModule;
  name: string;
  requiredDocuments: DocumentType[];
  requiredStatus: OperationStatus;
  nextStatus: OperationStatus;
}

/**
 * Full journey stages in order.
 * Each stage requires specific documents to be validated before advancing.
 */
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

/**
 * Build wagon stages for an operation based on active modules and existing documents.
 */
export function buildWagonStages(
  activeModules: JourneyModule[],
  currentStatus: OperationStatus,
  existingDocuments: { doc_type: string; status: string }[]
): WagonStage[] {
  const stages: WagonStage[] = [];
  const statusOrder: OperationStatus[] = [
    'simulacao', 'pedido', 'formalizado', 'garantido', 'faturado', 'monitorando', 'liquidado',
  ];
  const currentIdx = statusOrder.indexOf(currentStatus);

  for (const def of STAGE_DEFINITIONS) {
    // Only include stages whose module is active in the campaign
    if (!activeModules.includes(def.module)) continue;

    const stageStatusIdx = statusOrder.indexOf(def.requiredStatus);

    // Check which required docs are completed (validated or signed)
    const completedDocs = def.requiredDocuments.filter(docType => {
      const doc = existingDocuments.find(d => d.doc_type === docType);
      return doc && (doc.status === 'validado' || doc.status === 'assinado');
    });

    const allDocsComplete = completedDocs.length >= def.requiredDocuments.length;

    let status: WagonStage['status'];
    if (currentIdx > stageStatusIdx) {
      status = 'concluido';
    } else if (currentIdx === stageStatusIdx) {
      status = allDocsComplete ? 'concluido' : 'em_progresso';
    } else {
      // Check if previous stage is complete
      const prevStage = stages[stages.length - 1];
      status = prevStage && prevStage.status !== 'concluido' ? 'bloqueado' : 'pendente';
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
 * Returns the next status if all gates are passed, or null if blocked.
 */
export function canAdvance(
  activeModules: JourneyModule[],
  currentStatus: OperationStatus,
  existingDocuments: { doc_type: string; status: string }[]
): OperationStatus | null {
  const stages = buildWagonStages(activeModules, currentStatus, existingDocuments);
  
  // Find the current in-progress stage
  const currentStage = stages.find(s => s.status === 'em_progresso');
  if (!currentStage) {
    // All stages complete, check if there's a next status
    const lastCompleted = stages.filter(s => s.status === 'concluido');
    if (lastCompleted.length === stages.length && stages.length > 0) {
      const lastDef = STAGE_DEFINITIONS.find(d => d.module === stages[stages.length - 1].module);
      return lastDef?.nextStatus || null;
    }
    return null;
  }

  // Current stage is not complete
  return null;
}

/**
 * Get a human-readable summary of what's blocking advancement.
 */
export function getBlockingReason(
  activeModules: JourneyModule[],
  currentStatus: OperationStatus,
  existingDocuments: { doc_type: string; status: string }[]
): string | null {
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
