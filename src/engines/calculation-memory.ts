export interface InputMemoryParams {
  precoFornecedor: number;
  markupPct: number;
  descontoPct: number;
  jurosCetAa: number;
  dataConcessao: string;
  vencimento: string;
  feeOkenPct: number;
  incentivoPct: number;
  precoBrutoCommodity: number;
  descontoImpostosPct: number;
  dataEntrega: string;
  dataPagamento: string;
  dataRepasse: string;
  rendimentoAntecipacaoAa: number;
  feeMerchantPct: number;
}

export interface CommodityDebtMemoryParams {
  valorDividaPv: number;
  jurosCetAa: number;
  dataConcessao: string;
  vencimento: string;
  feeOkenPct: number;
  incentivoPct: number;
  precoBrutoCommodity: number;
  descontoImpostosPct: number;
  dataEntrega: string;
  dataPagamento: string;
  dataRepasse: string;
  rendimentoAntecipacaoAa: number;
  feeDealerPct: number;
}

function yearsBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`).getTime();
  const end = new Date(`${endISO}T00:00:00`).getTime();
  return (end - start) / 86400000 / 365;
}

function fv(rate: number, years: number, pv: number): number {
  return pv * Math.pow(1 + rate, years);
}

function pv(rate: number, years: number, fvValue: number): number {
  return fvValue / Math.pow(1 + rate, years);
}

export function calculateInputMemory(p: InputMemoryParams) {
  const valorPresenteCredito = p.precoFornecedor * (1 + p.markupPct - p.descontoPct);
  const periodoJurosAnos = yearsBetween(p.dataConcessao, p.vencimento);
  const valorPontaSemFee = fv(p.jurosCetAa, periodoJurosAnos, valorPresenteCredito) * (1 - p.incentivoPct);
  const valorPontaComFee = valorPontaSemFee * (1 + p.feeOkenPct);

  const precoLiquido = p.precoBrutoCommodity * (1 + p.descontoImpostosPct);
  const periodoAteRepasseAnos = yearsBetween(p.dataEntrega, p.dataPagamento);
  const precoEntregaAjustado = pv(p.rendimentoAntecipacaoAa, periodoAteRepasseAnos, precoLiquido);

  const paridadeRealSacas = valorPontaComFee / precoEntregaAjustado;

  const montanteInsumoReferencia = fv(
    p.jurosCetAa,
    periodoJurosAnos,
    p.precoFornecedor * (1 + p.markupPct + p.feeOkenPct)
  );
  const precoValorizado = montanteInsumoReferencia / paridadeRealSacas;
  const valorizacaoNominal = precoValorizado - precoLiquido;
  const valorizacaoPercent = precoLiquido !== 0 ? valorizacaoNominal / precoLiquido : 0;

  const sacasTransfMerchant = paridadeRealSacas / (1 + p.feeOkenPct);
  const feeSacasFarmer = paridadeRealSacas - sacasTransfMerchant;
  const feeSacasMerchant = p.feeMerchantPct * sacasTransfMerchant;
  const walletMerchant = sacasTransfMerchant - feeSacasMerchant;

  const montantePagoMerchant = walletMerchant * precoLiquido;
  const revenueOken = (feeSacasFarmer + feeSacasMerchant) * precoLiquido;

  return {
    valorPresenteCredito,
    periodoJurosAnos,
    valorPontaSemFee,
    valorPontaComFee,
    precoLiquido,
    periodoAteRepasseAnos,
    precoEntregaAjustado,
    paridadeRealSacas,
    montanteInsumoReferencia,
    precoValorizado,
    valorizacaoNominal,
    valorizacaoPercent,
    feeSacasFarmer,
    sacasTransfMerchant,
    feeSacasMerchant,
    walletMerchant,
    montantePagoMerchant,
    revenueOken,
  };
}

export function calculateCommodityDebtMemory(p: CommodityDebtMemoryParams) {
  const periodoJurosAnos = yearsBetween(p.dataConcessao, p.vencimento);
  const valorPontaSemFee = fv(p.jurosCetAa, periodoJurosAnos, p.valorDividaPv) * (1 - p.incentivoPct);
  const valorPontaComFee = valorPontaSemFee * (1 + p.feeOkenPct);

  const precoLiquido = p.precoBrutoCommodity * (1 + p.descontoImpostosPct);
  const periodoAteRepasseAnos = yearsBetween(p.dataEntrega, p.dataPagamento);
  const precoEntregaAjustado = pv(p.rendimentoAntecipacaoAa, periodoAteRepasseAnos, precoLiquido);

  const paridadeRealSacas = valorPontaComFee / precoEntregaAjustado;
  const montanteInsumoReferencia = fv(p.jurosCetAa, periodoJurosAnos, p.valorDividaPv);

  const precoValorizado = montanteInsumoReferencia / paridadeRealSacas;
  const valorizacaoNominal = precoValorizado - precoLiquido;
  const valorizacaoPercent = precoLiquido !== 0 ? valorizacaoNominal / precoLiquido : 0;

  const sacasTransfDealer = paridadeRealSacas / (1 + p.feeOkenPct);
  const feeSacasFarmer = paridadeRealSacas - sacasTransfDealer;
  const feeSacasDealer = p.feeDealerPct * sacasTransfDealer;
  const walletDealer = sacasTransfDealer - feeSacasDealer;

  const montantePagoDealer = walletDealer * precoLiquido;
  const revenueOken = (feeSacasFarmer + feeSacasDealer) * precoLiquido;

  return {
    periodoJurosAnos,
    valorPontaSemFee,
    valorPontaComFee,
    precoLiquido,
    periodoAteRepasseAnos,
    precoEntregaAjustado,
    paridadeRealSacas,
    montanteInsumoReferencia,
    precoValorizado,
    valorizacaoNominal,
    valorizacaoPercent,
    feeSacasFarmer,
    sacasTransfDealer,
    feeSacasDealer,
    walletDealer,
    montantePagoDealer,
    revenueOken,
  };
}
