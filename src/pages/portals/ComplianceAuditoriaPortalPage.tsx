import PortalPage from './PortalPage';
import { PORTAL_BY_PROFILE } from '@/config/portals';

export default function ComplianceAuditoriaPortalPage() {
  return <PortalPage portal={PORTAL_BY_PROFILE.compliance_auditoria} />;
}
