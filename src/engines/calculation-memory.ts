export interface InputMemoryParams {
  precoFornecedor: number;
  markupPct: number;
  descontoPct: number;
  jurosCetAa: number;
  dataConcessao: string;
  vencimento: string;
  feeOkenPct: number;
  incentivoPct: number;
  commodity: string;
  periodoEntrega: string;
  localEntrega: string;
  precoBrutoCommodity: number;
  temImposto: boolean;
  descontoImpostosPct: number;
  dataEntrega: string;
  dataPagamento: string;
  dataRepasse: string;
  rendimentoAntecipacaoAa: number;
  feeMerchantPct: number;
  creditContext?: CreditSelectionContext;
}

export interface CommodityDebtMemoryParams {
  valorDividaPv: number;
  jurosCetAa: number;
  dataConcessao: string;
  vencimento: string;
  feeOkenPct: number;
  incentivoPct: number;
  commodity: string;
  periodoEntrega: string;
  localEntrega: string;
  precoBrutoCommodity: number;
  temImposto: boolean;
  descontoImpostosPct: number;
  dataEntrega: string;
  dataPagamento: string;
  dataRepasse: string;
  rendimentoAntecipacaoAa: number;
  feeDealerPct: number;
  creditContext?: CreditSelectionContext;
}

export interface CreditLine {
  id: string;
  name: string;
  fundingCostAa: number;
  spreadAa: number;
  priority?: number;
  maxShare?: number;
  active?: boolean;
}

export interface CreditLineRequirement {
  creditLineId: string;
  riskLevels?: string[];
  profiles?: string[];
  operationTypes?: string[];
}

export interface CreditSelectionContext {
  riskLevel?: string;
  profile?: string;
  operationType?: string;
  lines?: CreditLine[];
  requirements?: CreditLineRequirement[];
}

export interface SelectedCreditSource {
  creditLineId: string;
  creditLineName: string;
  share: number;
  fundingCostAa: number;
  spreadAa: number;
  cetAa: number;
}

function matchesRequirement(value: string | undefined, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!value) return false;
  return allowed.includes(value);
}

export function selectCreditSources(context?: CreditSelectionContext): SelectedCreditSource[] {
  if (!context?.lines?.length) return [];

  const requirementsByLine = new Map<string, CreditLineRequirement[]>(
    (context.requirements || []).reduce<Array<[string, CreditLineRequirement[]]>>((acc, req) => {
      const current = acc.find(([lineId]) => lineId === req.creditLineId);
      if (current) {
        current[1].push(req);
      } else {
        acc.push([req.creditLineId, [req]]);
      }
      return acc;
    }, []),
  );

  const eligible = context.lines
    .filter((line) => line.active !== false)
    .filter((line) => {
      const reqs = requirementsByLine.get(line.id) || [];
      if (reqs.length === 0) return true;
      return reqs.some((req) => (
        matchesRequirement(context.riskLevel, req.riskLevels)
        && matchesRequirement(context.profile, req.profiles)
        && matchesRequirement(context.operationType, req.operationTypes)
      ));
    })
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));

  if (eligible.length === 0) return [];

  let remaining = 1;
  const selected: SelectedCreditSource[] = [];
  for (const line of eligible) {
    if (remaining <= 0) break;
    const configuredShare = line.maxShare == null ? 1 : Math.max(0, Math.min(1, line.maxShare));
    const share = Math.min(configuredShare, remaining);
    if (share <= 0) continue;
    remaining -= share;
    selected.push({
      creditLineId: line.id,
      creditLineName: line.name,
      share,
      fundingCostAa: line.fundingCostAa,
      spreadAa: line.spreadAa,
      cetAa: line.fundingCostAa + line.spreadAa,
    });
  }

  if (selected.length > 0 && remaining > 0) {
    selected[selected.length - 1].share += remaining;
  }

  return selected;
}

function resolveCetAa(baseCetAa: number, context?: CreditSelectionContext) {
  const selectedSources = selectCreditSources(context);
  if (selectedSources.length === 0) {
    return {
      effectiveCetAa: baseCetAa,
      selectedSources,
      weightedFundingCostAa: 0,
      weightedSpreadAa: baseCetAa,
    };
  }

  const weightedFundingCostAa = selectedSources.reduce((sum, source) => sum + source.fundingCostAa * source.share, 0);
  const weightedSpreadAa = selectedSources.reduce((sum, source) => sum + source.spreadAa * source.share, 0);

  return {
    effectiveCetAa: weightedFundingCostAa + weightedSpreadAa,
    selectedSources,
    weightedFundingCostAa,
    weightedSpreadAa,
  };
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
  const creditComposition = resolveCetAa(p.jurosCetAa, p.creditContext);
  const valorPresenteCredito = p.precoFornecedor * (1 + p.markupPct - p.descontoPct);
  const periodoJurosAnos = yearsBetween(p.dataConcessao, p.vencimento);
  const valorPontaSemFee = fv(creditComposition.effectiveCetAa, periodoJurosAnos, valorPresenteCredito) * (1 - p.incentivoPct);
  const valorPontaComFee = valorPontaSemFee * (1 + p.feeOkenPct);

  const descontoImpostosEfetivo = p.temImposto ? p.descontoImpostosPct : 0;
  const precoLiquido = p.precoBrutoCommodity * (1 + descontoImpostosEfetivo);
  const periodoAteRepasseAnos = yearsBetween(p.dataRepasse, p.dataPagamento);
  const precoEntregaAjustado = pv(p.rendimentoAntecipacaoAa, periodoAteRepasseAnos, precoLiquido);

  const paridadeRealSacas = valorPontaComFee / precoEntregaAjustado;

  const montanteInsumoReferencia = fv(
    creditComposition.effectiveCetAa,
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
    creditComposition,
  };
}

export function calculateCommodityDebtMemory(p: CommodityDebtMemoryParams) {
  const creditComposition = resolveCetAa(p.jurosCetAa, p.creditContext);
  const periodoJurosAnos = yearsBetween(p.dataConcessao, p.vencimento);
  const valorPontaSemFee = fv(creditComposition.effectiveCetAa, periodoJurosAnos, p.valorDividaPv) * (1 - p.incentivoPct);
  const valorPontaComFee = valorPontaSemFee * (1 + p.feeOkenPct);

  const descontoImpostosEfetivo = p.temImposto ? p.descontoImpostosPct : 0;
  const precoLiquido = p.precoBrutoCommodity * (1 + descontoImpostosEfetivo);
  const periodoAteRepasseAnos = yearsBetween(p.dataRepasse, p.dataPagamento);
  const precoEntregaAjustado = pv(p.rendimentoAntecipacaoAa, periodoAteRepasseAnos, precoLiquido);

  const paridadeRealSacas = valorPontaComFee / precoEntregaAjustado;
  const montanteInsumoReferencia = fv(creditComposition.effectiveCetAa, periodoJurosAnos, p.valorDividaPv);

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
    creditComposition,
  };
}
