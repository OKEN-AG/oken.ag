import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextStep } from './ContextStep';
import { OrderStep } from './OrderStep';
import { SimulationStep } from './SimulationStep';
import { PaymentStep } from './PaymentStep';
import { BarterStep } from './BarterStep';
import { FormalizationStep } from './FormalizationStep';
import { SummaryStep } from './SummaryStep';

const labels = ['context', 'order', 'simulation', 'payment', 'barter', 'formalization', 'summary'] as const;

function FlowHarness() {
  const [idx, setIdx] = React.useState(0);
  return (
    <div>
      <button onClick={() => setIdx((v) => Math.max(0, v - 1))}>prev</button>
      <button onClick={() => setIdx((v) => Math.min(6, v + 1))}>next</button>
      <ContextStep isActive={idx === 0}><div>context</div></ContextStep>
      <OrderStep isActive={idx === 1}><div>order</div></OrderStep>
      <SimulationStep isActive={idx === 2}><div>simulation</div></SimulationStep>
      <PaymentStep isActive={idx === 3}><div>payment</div></PaymentStep>
      <BarterStep isActive={idx === 4}><div>barter</div></BarterStep>
      <FormalizationStep isActive={idx === 5}><div>formalization</div></FormalizationStep>
      <SummaryStep isActive={idx === 6}><div>summary</div></SummaryStep>
    </div>
  );
}

describe('7-step flow smoke', () => {
  it('navigates across all seven steps', () => {
    render(<FlowHarness />);

    labels.forEach((label, index) => {
      if (index > 0) fireEvent.click(screen.getByText('next'));
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });
});
