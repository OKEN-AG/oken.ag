import type { Product, Campaign, PricingResult, AgronomicSelection, ChannelSegment, GrossToNet, ComboActivation } from '@/types/barter';

/**
 * PRICING NORMALIZATION ENGINE
 * Normalizes prices from 8 possible formats to target format
 */
export function normalizePrice(
  product: Product,
  campaign: Campaign,
  targetSegment: ChannelSegment,
  dueMonths: number
): number {
  // Bug #11: Use price_cash or price_term when available
  let price: number;
  if (product.priceType === 'prazo' && product.priceTerm && product.priceTerm > 0) {
    // Already a term price — no interest needed
    price = product.priceTerm;
  } else if (product.priceType === 'vista' && product.priceCash && product.priceCash > 0) {
    price = product.priceCash;
  } else {
    price = product.pricePerUnit;
  }

  // Step 1: Convert USD → BRL if needed
  if (product.currency === 'USD') {
    price *= campaign.exchangeRateProducts;
  }

  // Step 2: Convert vista → prazo if needed (skip if already term price)
  const isAlreadyTermPrice = product.priceType === 'prazo' && product.priceTerm && product.priceTerm > 0;
  if (!isAlreadyTermPrice && product.priceType === 'vista' && dueMonths > 0) {
    price *= Math.pow(1 + campaign.interestRate / 100, dueMonths);
  }

  // Step 3: Add margin if not included and selling to end consumer
  if (!product.includesMargin && targetSegment !== 'direto') {
    const margin = campaign.margins.find(m => m.segment === targetSegment);
    if (margin) {
      price *= (1 + margin.marginPercent / 100);
    }
  }

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
  quantity: number
): PricingResult {
  // Bug #11: Use price_cash or price_term when available
  let basePrice: number;
  const isAlreadyTermPrice = product.priceType === 'prazo' && product.priceTerm && product.priceTerm > 0;
  if (isAlreadyTermPrice) {
    basePrice = product.priceTerm!;
  } else if (product.priceType === 'vista' && product.priceCash && product.priceCash > 0) {
    basePrice = product.priceCash;
  } else {
    basePrice = product.pricePerUnit;
  }
  if (product.currency === 'USD') {
    basePrice *= campaign.exchangeRateProducts;
  }

  const interestMultiplier = (!isAlreadyTermPrice && product.priceType === 'vista' && dueMonths > 0)
    ? Math.pow(1 + campaign.interestRate / 100, dueMonths) - 1
    : 0;

  const margin = campaign.margins.find(m => m.segment === targetSegment);
  const marginPercent = (!product.includesMargin && margin) ? margin.marginPercent / 100 : 0;

  const priceWithInterest = basePrice * (1 + interestMultiplier);
  const normalizedPrice = priceWithInterest * (1 + marginPercent);

  return {
    productId: product.id,
    basePrice,
    normalizedPrice,
    interestComponent: basePrice * interestMultiplier,
    marginComponent: priceWithInterest * marginPercent,
    commercialPrice: normalizedPrice,
    quantity,
    subtotal: normalizedPrice * quantity,
  };
}

/**
 * Calculate Gross-to-Net analysis
 */
export function calculateGrossToNet(
  pricingResults: PricingResult[],
  comboActivations: ComboActivation[],
  barterDiscountPercent: number = 0
): GrossToNet {
  const grossRevenue = pricingResults.reduce((sum, p) => sum + p.subtotal, 0);
  const totalInterest = pricingResults.reduce((sum, p) => sum + p.interestComponent * p.quantity, 0);
  const totalMargin = pricingResults.reduce((sum, p) => sum + p.marginComponent * p.quantity, 0);

  // Non-cumulative: use highest main combo discount, plus additive complementary
  const mainActivated = comboActivations.filter(c => c.applied && !c.isComplementary);
  const mainDiscountPercent = mainActivated.length > 0
    ? Math.max(...mainActivated.map(c => c.discountPercent))
    : 0;
  const complementaryPercent = comboActivations
    .filter(c => c.applied && c.isComplementary)
    .reduce((sum, c) => sum + c.discountPercent, 0);
  const comboDiscountPercent = mainDiscountPercent + complementaryPercent;

  const comboDiscount = grossRevenue * comboDiscountPercent / 100;
  const barterDiscount = (grossRevenue - comboDiscount) * barterDiscountPercent / 100;
  const netRevenue = grossRevenue - comboDiscount - barterDiscount;

  return {
    grossRevenue,
    comboDiscount,
    barterDiscount,
    netRevenue,
    financialRevenue: totalInterest,
    distributorMargin: totalMargin,
    barterCost: barterDiscount,
    netNetRevenue: netRevenue - totalMargin,
  };
}
