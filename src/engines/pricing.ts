import type { Product, Campaign, PricingResult, AgronomicSelection, ChannelSegment, GrossToNet, ComboActivation } from '@/types/barter';

/**
 * PRICING NORMALIZATION ENGINE
 * I1: paymentMethodMarkup, I2: segmentAdjustmentPercent
 */
export function normalizePrice(
  product: Product,
  campaign: Campaign,
  targetSegment: ChannelSegment,
  dueMonths: number,
  options?: { paymentMethodMarkup?: number; segmentAdjustmentPercent?: number }
): number {
  let price: number;
  if (product.priceType === 'prazo' && product.priceTerm && product.priceTerm > 0) {
    price = product.priceTerm;
  } else if (product.priceType === 'vista' && product.priceCash && product.priceCash > 0) {
    price = product.priceCash;
  } else {
    price = product.pricePerUnit;
  }

  if (product.currency === 'USD') price *= campaign.exchangeRateProducts;

  const isAlreadyTermPrice = product.priceType === 'prazo' && product.priceTerm && product.priceTerm > 0;
  if (!isAlreadyTermPrice && product.priceType === 'vista' && dueMonths > 0) {
    price *= Math.pow(1 + campaign.interestRate / 100, dueMonths);
  }

  if (!product.includesMargin && targetSegment !== 'direto') {
    const margin = campaign.margins.find(m => m.segment === targetSegment);
    if (margin) price *= (1 + margin.marginPercent / 100);
  }

  const segAdj = options?.segmentAdjustmentPercent ?? 0;
  if (segAdj !== 0) price *= (1 + segAdj / 100);

  const pmMarkup = options?.paymentMethodMarkup ?? 0;
  if (pmMarkup !== 0) price *= (1 + pmMarkup / 100);

  return price;
}

/**
 * Decompose price into components
 */
export function decomposePricing(
  product: Product,
  campaign: Campaign,
  targetSegment: ChannelSegment,
  dueMonths: number,
  quantity: number,
  options?: { paymentMethodMarkup?: number; segmentAdjustmentPercent?: number }
): PricingResult {
  let basePrice: number;
  const isAlreadyTermPrice = product.priceType === 'prazo' && product.priceTerm && product.priceTerm > 0;
  if (isAlreadyTermPrice) {
    basePrice = product.priceTerm!;
  } else if (product.priceType === 'vista' && product.priceCash && product.priceCash > 0) {
    basePrice = product.priceCash;
  } else {
    basePrice = product.pricePerUnit;
  }
  if (product.currency === 'USD') basePrice *= campaign.exchangeRateProducts;

  const interestMultiplier = (!isAlreadyTermPrice && product.priceType === 'vista' && dueMonths > 0)
    ? Math.pow(1 + campaign.interestRate / 100, dueMonths) - 1 : 0;

  const margin = campaign.margins.find(m => m.segment === targetSegment);
  const marginPercent = (!product.includesMargin && margin) ? margin.marginPercent / 100 : 0;

  const segAdj = (options?.segmentAdjustmentPercent ?? 0) / 100;
  const pmMarkup = (options?.paymentMethodMarkup ?? 0) / 100;

  const priceWithInterest = basePrice * (1 + interestMultiplier);
  const priceWithMargin = priceWithInterest * (1 + marginPercent);
  const priceWithSegAdj = priceWithMargin * (1 + segAdj);
  const normalizedPrice = priceWithSegAdj * (1 + pmMarkup);

  return {
    productId: product.id,
    basePrice,
    normalizedPrice,
    interestComponent: basePrice * interestMultiplier,
    marginComponent: priceWithInterest * marginPercent,
    segmentAdjustmentComponent: priceWithMargin * segAdj,
    paymentMethodComponent: priceWithSegAdj * pmMarkup,
    commercialPrice: normalizedPrice,
    quantity,
    subtotal: normalizedPrice * quantity,
  };
}

/**
 * Calculate Gross-to-Net analysis
 * FIX: Combo discount applied line-by-line based on eligible REFs, not globally.
 * Now receives `selections` to determine which products are eligible for which combo.
 */
export function calculateGrossToNet(
  pricingResults: PricingResult[],
  comboActivations: ComboActivation[],
  barterDiscountPercent: number = 0,
  options?: {
    globalIncentiveType?: string;
    globalIncentive1?: number;
    globalIncentive2?: number;
    globalIncentive3?: number;
    valorizationPercent?: number;
  },
  selections?: AgronomicSelection[]
): GrossToNet {
  const grossRevenue = pricingResults.reduce((sum, p) => sum + p.subtotal, 0);
  const totalInterest = pricingResults.reduce((sum, p) => sum + p.interestComponent * p.quantity, 0);
  const totalMargin = pricingResults.reduce((sum, p) => sum + p.marginComponent * p.quantity, 0);
  const totalSegAdj = pricingResults.reduce((sum, p) => sum + (p.segmentAdjustmentComponent || 0) * p.quantity, 0);
  const totalPmMarkup = pricingResults.reduce((sum, p) => sum + (p.paymentMethodComponent || 0) * p.quantity, 0);

  // Build set of eligible REFs per activated combo
  const activatedMain = comboActivations.filter(c => c.applied && !c.isComplementary);
  const activatedComplementary = comboActivations.filter(c => c.applied && c.isComplementary);

  // All REFs matched by any activated main combo
  const mainEligibleRefs = new Set<string>();
  let mainDiscountPercent = 0;
  for (const ca of activatedMain) {
    for (const ref of ca.matchedProducts) mainEligibleRefs.add(ref.toUpperCase().trim());
    mainDiscountPercent = Math.max(mainDiscountPercent, ca.discountPercent);
  }

  // Complementary eligible REFs
  const compEligibleRefs = new Set<string>();
  let compDiscountPercent = 0;
  for (const ca of activatedComplementary) {
    for (const ref of ca.matchedProducts) compEligibleRefs.add(ref.toUpperCase().trim());
    compDiscountPercent += ca.discountPercent;
  }

  // Calculate combo discount line-by-line
  let comboDiscount = 0;

  if (selections && selections.length > 0) {
    for (const pr of pricingResults) {
      const sel = selections.find(s => s.productId === pr.productId);
      if (!sel) continue;
      const ref = (sel.ref || sel.product?.ref || sel.product?.name || '').toUpperCase().trim();

      // Main combo discount
      if (mainEligibleRefs.has(ref) && mainDiscountPercent > 0) {
        comboDiscount += pr.subtotal * mainDiscountPercent / 100;
      }

      // Complementary discount (proportional to activated hectares if available)
      if (compEligibleRefs.has(ref) && compDiscountPercent > 0) {
        const proportionalCa = activatedComplementary.find(ca =>
          ca.matchedProducts.some(r => r.toUpperCase().trim() === ref)
        );
        if (proportionalCa?.proportionalHectares && sel.areaHectares > 0) {
          const ratio = Math.min(1, proportionalCa.proportionalHectares / sel.areaHectares);
          comboDiscount += pr.subtotal * compDiscountPercent / 100 * ratio;
        } else {
          comboDiscount += pr.subtotal * compDiscountPercent / 100;
        }
      }
    }
  } else {
    // Fallback: global discount (backwards compatible)
    const totalDiscountPercent = mainDiscountPercent + compDiscountPercent;
    comboDiscount = grossRevenue * totalDiscountPercent / 100;
  }

  const barterDiscount = (grossRevenue - comboDiscount) * barterDiscountPercent / 100;

  // I7: Global incentives
  const incentiveType = options?.globalIncentiveType || '';
  const incentiveTotal = (options?.globalIncentive1 || 0) + (options?.globalIncentive2 || 0) + (options?.globalIncentive3 || 0);
  const directIncentiveDiscount = incentiveType === 'desconto_direto'
    ? (grossRevenue - comboDiscount) * incentiveTotal / 100 : 0;
  const creditLiberacao = incentiveType === 'credito_liberacao'
    ? (grossRevenue - comboDiscount) * incentiveTotal / 100 : 0;
  const creditLiquidacao = incentiveType === 'credito_liquidacao'
    ? (grossRevenue - comboDiscount) * incentiveTotal / 100 : 0;

  const netRevenue = grossRevenue - comboDiscount - barterDiscount - directIncentiveDiscount;

  return {
    grossRevenue,
    comboDiscount,
    barterDiscount,
    directIncentiveDiscount,
    creditLiberacao,
    creditLiquidacao,
    netRevenue,
    financialRevenue: totalInterest,
    distributorMargin: totalMargin,
    segmentAdjustment: totalSegAdj,
    paymentMethodMarkup: totalPmMarkup,
    barterCost: barterDiscount,
    netNetRevenue: netRevenue - totalMargin,
  };
}

/**
 * G1: Generate audit trail for price formation
 */
export function generatePriceAuditTrail(
  product: Product,
  campaign: Campaign,
  targetSegment: ChannelSegment,
  dueMonths: number,
  options?: {
    paymentMethodMarkup?: number;
    paymentMethodName?: string;
    segmentAdjustmentPercent?: number;
    segmentName?: string;
  }
): PriceAuditStep[] {
  const steps: PriceAuditStep[] = [];

  let price: number;
  if (product.priceType === 'prazo' && product.priceTerm && product.priceTerm > 0) {
    price = product.priceTerm;
    steps.push({ step: 'Preço Base (Prazo)', value: price, description: `Lista prazo: ${product.currency} ${price.toFixed(2)}` });
  } else if (product.priceType === 'vista' && product.priceCash && product.priceCash > 0) {
    price = product.priceCash;
    steps.push({ step: 'Preço Base (Vista)', value: price, description: `Lista vista: ${product.currency} ${price.toFixed(2)}` });
  } else {
    price = product.pricePerUnit;
    steps.push({ step: 'Preço Base', value: price, description: `Lista: ${product.currency} ${price.toFixed(2)}` });
  }

  if (product.currency === 'USD') {
    const prev = price;
    price *= campaign.exchangeRateProducts;
    steps.push({ step: 'Conversão USD → BRL', value: price, description: `${prev.toFixed(2)} × câmbio ${campaign.exchangeRateProducts.toFixed(4)} = R$ ${price.toFixed(2)}` });
  }

  const isAlreadyTermPrice = product.priceType === 'prazo' && product.priceTerm && product.priceTerm > 0;
  if (!isAlreadyTermPrice && product.priceType === 'vista' && dueMonths > 0) {
    const prev = price;
    const factor = Math.pow(1 + campaign.interestRate / 100, dueMonths);
    price *= factor;
    steps.push({ step: `Juros (${campaign.interestRate}% a.m. × ${dueMonths}m)`, value: price, description: `${prev.toFixed(2)} × ${factor.toFixed(4)} = R$ ${price.toFixed(2)}` });
  }

  if (!product.includesMargin && targetSegment !== 'direto') {
    const margin = campaign.margins.find(m => m.segment === targetSegment);
    if (margin && margin.marginPercent > 0) {
      const prev = price;
      price *= (1 + margin.marginPercent / 100);
      steps.push({ step: `Margem Canal (${targetSegment}: ${margin.marginPercent}%)`, value: price, description: `${prev.toFixed(2)} × ${(1 + margin.marginPercent / 100).toFixed(4)} = R$ ${price.toFixed(2)}` });
    }
  }

  const segAdj = options?.segmentAdjustmentPercent ?? 0;
  if (segAdj !== 0) {
    const prev = price;
    price *= (1 + segAdj / 100);
    steps.push({ step: `Ajuste Segmento (${options?.segmentName || ''}: ${segAdj > 0 ? '+' : ''}${segAdj}%)`, value: price, description: `${prev.toFixed(2)} × ${(1 + segAdj / 100).toFixed(4)} = R$ ${price.toFixed(2)}` });
  }

  const pmMarkup = options?.paymentMethodMarkup ?? 0;
  if (pmMarkup !== 0) {
    const prev = price;
    price *= (1 + pmMarkup / 100);
    steps.push({ step: `Markup Pagamento (${options?.paymentMethodName || ''}: ${pmMarkup > 0 ? '+' : ''}${pmMarkup}%)`, value: price, description: `${prev.toFixed(2)} × ${(1 + pmMarkup / 100).toFixed(4)} = R$ ${price.toFixed(2)}` });
  }

  steps.push({ step: 'Preço Final Normalizado', value: price, description: `R$ ${price.toFixed(2)}/${product.unitType}`, isFinal: true });

  return steps;
}

export interface PriceAuditStep {
  step: string;
  value: number;
  description: string;
  isFinal?: boolean;
}
