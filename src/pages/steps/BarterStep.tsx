import type { ReactNode } from 'react';

type BarterStepProps = { isActive: boolean; children: ReactNode };

export function BarterStep({ isActive, children }: BarterStepProps) {
  if (!isActive) return null;
  return <>{children}</>;
}
