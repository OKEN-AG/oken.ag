export type UserProfile =
  | 'credor_oem'
  | 'backoffice'
  | 'juridico'
  | 'tomador'
  | 'fornecedor'
  | 'investidor'
  | 'compliance_auditoria';

export type Capability =
  | 'portal.credor_oem.view'
  | 'portal.backoffice.view'
  | 'portal.juridico.view'
  | 'portal.tomador.view'
  | 'portal.fornecedor.view'
  | 'portal.investidor.view'
  | 'portal.compliance_auditoria.view'
  | 'queue.kyc.manage'
  | 'queue.docs.manage'
  | 'queue.formalizacao.manage'
  | 'queue.pagamentos.manage'
  | 'queue.reconciliacao.manage'
  | 'queue.cobranca.manage'
  | 'audit.read'
  | 'audit.write';

export interface OperationalQueue {
  key: 'kyc' | 'docs' | 'formalizacao' | 'pagamentos' | 'reconciliacao' | 'cobranca';
  label: string;
  pending: number;
  slaHours: number;
  capability: Capability;
}
