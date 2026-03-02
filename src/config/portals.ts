import { Capability, OperationalQueue, UserProfile } from '@/types/authorization';

export interface PortalDefinition {
  profile: UserProfile;
  title: string;
  description: string;
  route: string;
  requiredCapability: Capability;
  queues: OperationalQueue[];
}

const ALL_QUEUES: OperationalQueue[] = [
  { key: 'kyc', label: 'KYC', pending: 11, slaHours: 24, capability: 'queue.kyc.manage' },
  { key: 'docs', label: 'Documentos', pending: 19, slaHours: 12, capability: 'queue.docs.manage' },
  { key: 'formalizacao', label: 'Formalização', pending: 8, slaHours: 18, capability: 'queue.formalizacao.manage' },
  { key: 'pagamentos', label: 'Pagamentos', pending: 6, slaHours: 8, capability: 'queue.pagamentos.manage' },
  { key: 'reconciliacao', label: 'Reconciliação', pending: 4, slaHours: 24, capability: 'queue.reconciliacao.manage' },
  { key: 'cobranca', label: 'Cobrança', pending: 13, slaHours: 48, capability: 'queue.cobranca.manage' },
];

export const PROFILE_CAPABILITIES: Record<UserProfile, Capability[]> = {
  credor_oem: ['portal.credor_oem.view', 'queue.docs.manage', 'queue.formalizacao.manage', 'audit.read', 'audit.write'],
  backoffice: ['portal.backoffice.view', ...ALL_QUEUES.map(q => q.capability), 'audit.read', 'audit.write'],
  juridico: ['portal.juridico.view', 'queue.docs.manage', 'queue.formalizacao.manage', 'audit.read', 'audit.write'],
  tomador: ['portal.tomador.view', 'queue.kyc.manage', 'queue.docs.manage', 'audit.read', 'audit.write'],
  fornecedor: ['portal.fornecedor.view', 'queue.docs.manage', 'queue.pagamentos.manage', 'audit.read', 'audit.write'],
  investidor: ['portal.investidor.view', 'queue.reconciliacao.manage', 'queue.cobranca.manage', 'audit.read', 'audit.write'],
  compliance_auditoria: ['portal.compliance_auditoria.view', 'queue.kyc.manage', 'queue.docs.manage', 'queue.formalizacao.manage', 'audit.read', 'audit.write'],
};

export const PORTAL_DEFINITIONS: PortalDefinition[] = [
  {
    profile: 'credor_oem',
    title: 'Portal Credor / OEM',
    description: 'Acompanha formalização comercial e documentação financeira de contratos OEM.',
    route: '/portal/credor-oem',
    requiredCapability: 'portal.credor_oem.view',
    queues: ALL_QUEUES,
  },
  {
    profile: 'backoffice',
    title: 'Portal Backoffice',
    description: 'Central operacional com governança ponta a ponta para operação.',
    route: '/portal/backoffice',
    requiredCapability: 'portal.backoffice.view',
    queues: ALL_QUEUES,
  },
  {
    profile: 'juridico',
    title: 'Portal Jurídico / Formalização',
    description: 'Templates, minutas, assinatura, registro e evidências documentais.',
    route: '/portal/juridico',
    requiredCapability: 'portal.juridico.view',
    queues: ALL_QUEUES,
  },
  {
    profile: 'tomador',
    title: 'Portal Tomador',
    description: 'Visão do tomador focada em onboarding KYC e envio de documentos.',
    route: '/portal/tomador',
    requiredCapability: 'portal.tomador.view',
    queues: ALL_QUEUES,
  },
  {
    profile: 'fornecedor',
    title: 'Portal Fornecedor',
    description: 'Fluxo do fornecedor para validação documental e programação de pagamentos.',
    route: '/portal/fornecedor',
    requiredCapability: 'portal.fornecedor.view',
    queues: ALL_QUEUES,
  },
  {
    profile: 'investidor',
    title: 'Portal Investidor',
    description: 'Monitor de carteira, reconciliação financeira e cobrança.',
    route: '/portal/investidor',
    requiredCapability: 'portal.investidor.view',
    queues: ALL_QUEUES,
  },
  {
    profile: 'compliance_auditoria',
    title: 'Portal Compliance / Auditoria',
    description: 'Controle de aderência, rastreabilidade e trilha de auditoria regulatória.',
    route: '/portal/compliance-auditoria',
    requiredCapability: 'portal.compliance_auditoria.view',
    queues: ALL_QUEUES,
  },
];

export const PORTAL_BY_PROFILE: Record<UserProfile, PortalDefinition> = PORTAL_DEFINITIONS.reduce((acc, portal) => {
  acc[portal.profile] = portal;
  return acc;
}, {} as Record<UserProfile, PortalDefinition>);
