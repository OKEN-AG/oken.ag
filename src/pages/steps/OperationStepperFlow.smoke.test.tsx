import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SimulationStep } from './SimulationStep';
import { PaymentStep } from './PaymentStep';
import { SummaryStep } from './SummaryStep';

const noop = () => {};
const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
const emptyGrossToNet = { grossRevenue: 100, comboDiscount: 0, directIncentiveDiscount: 0, netRevenue: 100, financialRevenue: 0, distributorMargin: 0 };
const emptyParity = { quantitySacas: 10, valorization: 5, referencePrice: 50, commodityPricePerUnit: 45 };

describe('OperationStepperFlow smoke', () => {
  it('renders SimulationStep when active', () => {
    render(<SimulationStep isActive={true} products={[]} pricingResults={[]} grossToNet={emptyGrossToNet} formatCurrency={fmt} />);
    expect(screen.getByText('Receita Bruta')).toBeTruthy();
  });

  it('renders PaymentStep when active', () => {
    render(<PaymentStep isActive={true} paymentMethods={[]} selectedPaymentMethod="" selectedPM={null} onPaymentMethodChange={noop} grossToNet={emptyGrossToNet} simLoading={false} formatCurrency={fmt} />);
    expect(screen.getByText('Meio de Pagamento')).toBeTruthy();
  });

  it('renders SummaryStep when active', () => {
    render(<SummaryStep isActive={true} clientName="Test" area={100} selections={[]} grossToNet={emptyGrossToNet} parity={emptyParity} insurancePremium={null} consumptionLedger={undefined} comboActivations={[]} formatCurrency={fmt} />);
    expect(screen.getByText('Test')).toBeTruthy();
  });
});
