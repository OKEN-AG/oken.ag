import type { ReactNode } from 'react';

type SummaryStepProps = { isActive: boolean; children: ReactNode };

export function SummaryStep({ isActive, children }: SummaryStepProps) {
  if (!isActive) return null;
  return <>{children}</>;
}
