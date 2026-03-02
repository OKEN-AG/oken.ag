import type { ReactNode } from 'react';

type OrderStepProps = { isActive: boolean; children: ReactNode };

export function OrderStep({ isActive, children }: OrderStepProps) {
  if (!isActive) return null;
  return <>{children}</>;
}
