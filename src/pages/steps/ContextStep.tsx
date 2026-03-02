import type { ReactNode } from 'react';

type ContextStepProps = { isActive: boolean; children: ReactNode };

export function ContextStep({ isActive, children }: ContextStepProps) {
  if (!isActive) return null;
  return <>{children}</>;
}
