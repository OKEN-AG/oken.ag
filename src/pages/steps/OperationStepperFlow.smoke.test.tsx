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

const noop = () => {};
const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
const emptyGrossToNet = { grossRevenue: 100, comboDiscount: 0, directIncentiveDiscount: 0, netRevenue: 100, financialRevenue: 0, distributorMargin: 0 };
const emptyParity = { quantitySacas: 10, valorization: 5, referencePrice: 50, commodityPricePerUnit: 45 };

function FlowHarness() {
  const [idx, setIdx] = React.useState(0);
  return (
    <div>
      <button onClick={() => setIdx((v) => Math.max(0, v - 1))}>prev</button>
      <button onClick={() => setIdx((v) => Math.min(6, v + 1))}>next</button>
      <ContextStep isActive={idx === 0}><div>context</div></ContextStep>
      <OrderStep isActive={idx === 1}><div>order</div></OrderStep>
      <SimulationStep isActive={idx === 2} products={[]} pricingResults={[]} grossToNet={emptyGrossToNet} formatCurrency={fmt} />
      <PaymentStep isActive={idx === 3} paymentMethods={[]} selectedPaymentMethod="" selectedPM={null} onPaymentMethodChange={noop} grossToNet={emptyGrossToNet} simLoading={false} formatCurrency={fmt} />
      <BarterStep
        isActive={idx === 4}
        freightOrigin="" onFreightOriginChange={noop} freightReducers={[]} deliveryLocations={[]}
        port="" onPortChange={noop} selectedBuyerId="" onBuyerChange={noop} buyers={[]}
        counterpartyOther="" onCounterpartyOtherChange={noop} contractPriceType="fixo"
        onContractPriceTypeChange={noop} hasContract={false} onHasContractChange={noop}
        userPrice={0} onUserPriceChange={noop} commodityNetPrice={0} parity={emptyParity}
        freightReducer={undefined} ivp={1} buyerFee={0} selectedValorization={null}
        showInsurance={false} onShowInsuranceChange={noop} insurancePremium={null} formatCurrency={fmt}
      />
      <FormalizationStep
        isActive={idx === 5}
        isNewOperation={true} wagonStages={[]} nextStatus={null} onAdvanceStatus={noop}
        docMap={new Map()} emitting={null} onDocAction={noop} onCessaoNotify={noop}
        performanceIndex={100} onPerformanceIndexChange={noop} aforoPercent={null}
        netRevenue={100} quantitySacas={10} formatCurrency={fmt}
      />
      <SummaryStep isActive={idx === 6} clientName="Test" area={500} selections={[]} grossToNet={emptyGrossToNet} parity={emptyParity} insurancePremium={null} consumptionLedger={undefined} comboActivations={[]} formatCurrency={fmt} />
    </div>
  );
}

describe('7-step flow smoke', () => {
  it('navigates across all seven steps', () => {
    render(<FlowHarness />);
    expect(screen.getByText('context')).toBeInTheDocument();
    fireEvent.click(screen.getByText('next'));
    expect(screen.getByText('order')).toBeInTheDocument();
    fireEvent.click(screen.getByText('next'));
    expect(screen.getByText('Breakdown da Simulação')).toBeInTheDocument();
    fireEvent.click(screen.getByText('next'));
    expect(screen.getByText('Montante Final')).toBeInTheDocument();
    fireEvent.click(screen.getByText('next'));
    expect(screen.getByText('Preço Net/sc')).toBeInTheDocument();
    fireEvent.click(screen.getByText('next'));
    expect(screen.getByText(/Salve a operação/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('next'));
    expect(screen.getByText('Resumo Final')).toBeInTheDocument();
  });
});
