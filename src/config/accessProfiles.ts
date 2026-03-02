import type { UserProfile } from '@/types/authorization';

export type AppRole = 'admin' | 'manager' | 'sales' | 'distributor' | 'client';

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  manager: 'Gestor',
  sales: 'Comercial',
  distributor: 'Distribuidor',
  client: 'Cliente',
};

export const USER_PROFILE_LABELS: Record<UserProfile, string> = {
  backoffice: 'Backoffice',
  credor_oem: 'Credor / OEM',
  juridico: 'Jurídico',
  tomador: 'Tomador',
  fornecedor: 'Fornecedor',
  investidor: 'Investidor',
  compliance_auditoria: 'Compliance / Auditoria',
};

export const APP_ROLE_TO_USER_PROFILE: Record<AppRole, UserProfile> = {
  admin: 'backoffice',
  manager: 'juridico',
  sales: 'credor_oem',
  distributor: 'fornecedor',
  client: 'tomador',
};

export const APP_ROLES: AppRole[] = ['admin', 'manager', 'sales', 'distributor', 'client'];
