import type { ReactNode } from 'react';

type PaymentStepProps = { isActive: boolean; children: ReactNode };

export function PaymentStep({ isActive, children }: PaymentStepProps) {
  if (!isActive) return null;
  return <>{children}</>;
}
