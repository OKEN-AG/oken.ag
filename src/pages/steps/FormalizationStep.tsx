import type { ReactNode } from 'react';

type FormalizationStepProps = { isActive: boolean; children: ReactNode };

export function FormalizationStep({ isActive, children }: FormalizationStepProps) {
  if (!isActive) return null;
  return <>{children}</>;
}
