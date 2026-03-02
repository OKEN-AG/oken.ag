import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Capability } from '@/types/authorization';

interface CapabilityRouteProps {
  capability: Capability;
  children: ReactNode;
}

export default function CapabilityRoute({ capability, children }: CapabilityRouteProps) {
  const { hasCapability } = useAuth();

  if (!hasCapability(capability)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
