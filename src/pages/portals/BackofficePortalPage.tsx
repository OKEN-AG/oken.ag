import PortalPage from './PortalPage';
import { PORTAL_BY_PROFILE } from '@/config/portals';

export default function BackofficePortalPage() {
  return <PortalPage portal={PORTAL_BY_PROFILE.backoffice} />;
}
