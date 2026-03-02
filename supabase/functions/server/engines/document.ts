export type DocumentType =
  | 'termo_adesao'
  | 'pedido'
  | 'termo_barter'
  | 'ccv'
  | 'cessao_credito'
  | 'cpr';

export type DocumentState = 'draft' | 'aprovado' | 'assinado' | 'registrado' | 'cancelado' | 'substituido';

export interface DocumentTemplateVersion {
  id: string;
  templateCode: DocumentType;
  versionNumber: number;
  body: string;
  variables: string[];
  dynamic: boolean;
}

export interface DocumentInstanceVersion {
  id: string;
  operationId: string;
  documentType: DocumentType;
  versionNo: number;
  templateVersionId: string;
  state: DocumentState;
  payloadFrozen: Record<string, unknown>;
  emittedAt: string;
}

export interface IssueDocumentInput {
  operationId: string;
  snapshotId: string;
  payload: Record<string, unknown>;
  emittedBy?: string;
}

export interface IssueDocumentResult {
  emitted: Array<Pick<DocumentInstanceVersion, 'documentType' | 'versionNo' | 'state'>>;
}

export interface BlockingResult {
  blocked: boolean;
  blockingReasons: string[];
}

export interface DocumentRequirementRule {
  code: DocumentType;
  minState: Exclude<DocumentState, 'cancelado' | 'substituido'>;
  description: string;
  when: (ctx: RequirementContext) => boolean;
}

export interface RequirementContext {
  hasCessionFlow: boolean;
  hasExistingContract: boolean;
  paymentMethod?: 'barter' | 'brl' | 'usd';
}

const STATE_RANK: Record<DocumentState, number> = {
  draft: 0,
  aprovado: 1,
  assinado: 2,
  registrado: 3,
  cancelado: -1,
  substituido: -1,
};

export const DYNAMIC_TEMPLATE_CODES: DocumentType[] = ['ccv', 'cpr', 'cessao_credito'];

export const DOCUMENT_REQUIREMENT_RULES: DocumentRequirementRule[] = [
  {
    code: 'pedido',
    minState: 'assinado',
    description: 'Pedido deve estar assinado para avançar a formalização.',
    when: () => true,
  },
  {
    code: 'termo_barter',
    minState: 'assinado',
    description: 'Termo de Barter deve estar assinado para habilitar garantias.',
    when: ({ paymentMethod }) => paymentMethod === 'barter',
  },
  {
    code: 'cpr',
    minState: 'assinado',
    description: 'CPR assinada é obrigatória para comprovação de produção (PoE).',
    when: ({ paymentMethod }) => paymentMethod === 'barter',
  },
  {
    code: 'ccv',
    minState: 'assinado',
    description: 'CCV assinado é obrigatório para comprovação de liquidez (PoL).',
    when: ({ hasExistingContract }) => hasExistingContract,
  },
  {
    code: 'cessao_credito',
    minState: 'assinado',
    description: 'Cessão de crédito assinada é obrigatória quando houver cadeia de cessão.',
    when: ({ hasCessionFlow }) => hasCessionFlow,
  },
];

export function buildMandatoryDocumentList(context: RequirementContext): DocumentRequirementRule[] {
  return DOCUMENT_REQUIREMENT_RULES.filter((rule) => rule.when(context));
}

export function issuePedidoAndBarterTerm(_input: IssueDocumentInput): IssueDocumentResult {
  return {
    emitted: [
      {
        documentType: 'pedido',
        versionNo: 1,
        state: 'draft',
      },
      {
        documentType: 'termo_barter',
        versionNo: 1,
        state: 'draft',
      },
    ],
  };
}

export function evaluateDocumentBlocking(
  instances: DocumentInstanceVersion[],
  context: RequirementContext,
): BlockingResult {
  const required = buildMandatoryDocumentList(context);

  const blockingReasons = required
    .filter((rule) => {
      const latest = instances
        .filter((instance) => instance.documentType === rule.code)
        .sort((a, b) => b.versionNo - a.versionNo)[0];

      if (!latest) return true;

      const currentRank = STATE_RANK[latest.state] ?? -1;
      const minimumRank = STATE_RANK[rule.minState] ?? Number.MAX_SAFE_INTEGER;
      return currentRank < minimumRank;
    })
    .map((rule) => `${rule.description} (documento: ${rule.code}).`);

  return {
    blocked: blockingReasons.length > 0,
    blockingReasons,
  };
}
