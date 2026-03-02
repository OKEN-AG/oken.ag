import { describe, expect, it } from 'vitest';
import {
  calculateCommodityDebtMemory,
  calculateInputMemory,
  selectCreditSources,
} from '@/engines/calculation-memory';

describe('calculation-memory', () => {
  it('usa dataRepasse -> dataPagamento para antecipacao no fluxo insumo', () => {
    const result = calculateInputMemory({
      precoFornecedor: 1000,
      markupPct: 0.1,
      descontoPct: 0,
      jurosCetAa: 0.2,
      dataConcessao: '2026-01-01',
      vencimento: '2027-01-01',
      feeOkenPct: 0.02,
      incentivoPct: 0,
      commodity: 'soja',
      periodoEntrega: '2026-02',
      localEntrega: 'Sorriso-MT',
      precoBrutoCommodity: 100,
      temImposto: true,
      descontoImpostosPct: 0,
      dataEntrega: '2026-02-01',
      dataPagamento: '2026-08-01',
      dataRepasse: '2026-07-25',
      rendimentoAntecipacaoAa: 0.1,
      feeMerchantPct: 0.01,
    });

    expect(result.periodoAteRepasseAnos).toBeCloseTo((7 / 365), 3);
  });

  it('seleciona fontes elegíveis por risco/perfil/operação e compõe CET final ponderado', () => {
    const selected = selectCreditSources({
      riskLevel: 'high',
      profile: 'farmer',
      operationType: 'barter',
      lines: [
        { id: 'l1', name: 'AAA', fundingCostAa: 0.09, spreadAa: 0.03, maxShare: 0.6, priority: 1 },
        { id: 'l2', name: 'BBB', fundingCostAa: 0.11, spreadAa: 0.04, maxShare: 1, priority: 2 },
        { id: 'l3', name: 'CCC', fundingCostAa: 0.08, spreadAa: 0.02, maxShare: 1, priority: 3 },
      ],
      requirements: [
        { creditLineId: 'l1', riskLevels: ['high'], profiles: ['farmer'], operationTypes: ['barter'] },
        { creditLineId: 'l2', riskLevels: ['high'], profiles: ['farmer'], operationTypes: ['barter'] },
        { creditLineId: 'l3', riskLevels: ['low'], profiles: ['dealer'], operationTypes: ['insumo'] },
      ],
    });

    expect(selected).toHaveLength(2);
    expect(selected[0].share).toBeCloseTo(0.6, 6);
    expect(selected[1].share).toBeCloseTo(0.4, 6);

    const result = calculateInputMemory({
      precoFornecedor: 1000,
      markupPct: 0.1,
      descontoPct: 0,
      jurosCetAa: 0.2,
      dataConcessao: '2026-01-01',
      vencimento: '2027-01-01',
      feeOkenPct: 0.02,
      incentivoPct: 0,
      commodity: 'soja',
      periodoEntrega: '2026-02',
      localEntrega: 'Sorriso-MT',
      precoBrutoCommodity: 100,
      temImposto: true,
      descontoImpostosPct: 0,
      dataEntrega: '2026-02-01',
      dataPagamento: '2026-08-01',
      dataRepasse: '2026-07-25',
      rendimentoAntecipacaoAa: 0.1,
      feeMerchantPct: 0.01,
      creditContext: {
        riskLevel: 'high',
        profile: 'farmer',
        operationType: 'barter',
        lines: [
          { id: 'l1', name: 'AAA', fundingCostAa: 0.09, spreadAa: 0.03, maxShare: 0.6, priority: 1 },
          { id: 'l2', name: 'BBB', fundingCostAa: 0.11, spreadAa: 0.04, maxShare: 1, priority: 2 },
        ],
      },
    });

    expect(result.creditComposition.effectiveCetAa).toBeCloseTo(0.132, 6);
    expect(result.creditComposition.weightedFundingCostAa).toBeCloseTo(0.098, 6);
    expect(result.creditComposition.weightedSpreadAa).toBeCloseTo(0.034, 6);
  });

  it('calcula fluxo dívida com outputs financeiros positivos', () => {
    const result = calculateCommodityDebtMemory({
      valorDividaPv: 50000,
      jurosCetAa: 0.15,
      dataConcessao: '2026-01-01',
      vencimento: '2026-12-31',
      feeOkenPct: 0.02,
      incentivoPct: 0.01,
      commodity: 'milho',
      periodoEntrega: '2026-03',
      localEntrega: 'Rio Verde-GO',
      precoBrutoCommodity: 150,
      temImposto: true,
      descontoImpostosPct: -0.05,
      dataEntrega: '2026-03-01',
      dataPagamento: '2026-09-01',
      dataRepasse: '2026-08-20',
      rendimentoAntecipacaoAa: 0.12,
      feeDealerPct: 0.03,
    });

    expect(result.paridadeRealSacas).toBeGreaterThan(0);
    expect(result.montantePagoDealer).toBeGreaterThan(0);
    expect(result.revenueOken).toBeGreaterThan(0);
  });
});
