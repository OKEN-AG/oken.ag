import type { ReactNode } from 'react';

type SimulationStepProps = { isActive: boolean; children: ReactNode };

export function SimulationStep({ isActive, children }: SimulationStepProps) {
  if (!isActive) return null;
  return <>{children}</>;
}
