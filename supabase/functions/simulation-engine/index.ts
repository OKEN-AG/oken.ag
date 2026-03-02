import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolvePolicy, recordPolicyDecisionAudit } from "../_shared/policy.ts";
import { calculateInsurance } from "../server/engines/insurance.ts";

// ─── CORS ───
function getCorsHeaders(req: Request) {
  const allowedRaw = Deno.env.get('ALLOWED_ORIGINS') || '*';
  const origin = req.headers.get('Origin') || '';
  let allowOrigin = '*';
  if (allowedRaw !== '*') {
    const allowed = allowedRaw.split(',').map(s => s.trim());
    allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Vary': 'Origin',
  };
}

// ─── TYPES ───
interface ProductRow {
  id: string; name: string; ref: string; category: string; active_ingredient: string;
  unit_type: string; package_sizes: number[] | null; units_per_box: number;
  boxes_per_pallet: number; pallets_per_truck: number; dose_per_hectare: number;
  min_dose: number; max_dose: number; price_per_unit: number; price_cash: number | null;
  price_term: number | null; currency: string; price_type: string; includes_margin: boolean;
  code: string | null;
}

interface AgronomicResult {
  productId: string; ref: string; productName: string; areaHectares: number;
  dosePerHectare: number; rawQuantity: number; roundedQuantity: number;
  boxes: number; pallets: number; packageSize: number; unitType: string;
}

interface ComboActivationResult {
  comboId: string; comboName: string; discountPercent: number;
  matchedProducts: string[]; applied: boolean; isComplementary: boolean;
  activatedHectares?: number; proportionalHectares?: number;
}

interface PricingResultItem {
  productId: string; basePrice: number; normalizedPrice: number;
  interestComponent: number; marginComponent: number;
  segmentAdjustmentComponent: number; paymentMethodComponent: number;
  commercialPrice: number; quantity: number; subtotal: number;
}

interface PricingDebugRow {
  productId: string; code: string; ref: string; productName: string; unitType: string;
  quantity: number; boxes: number; pallets: number;
  sourceField: 'price_cash' | 'price_term' | 'price_per_unit';
  sourceValue: number; listCurrency: 'BRL' | 'USD';
  exchangeRateProducts: number; priceAfterFx: number;
  dueMonths: number; campaignMonthlyRatePercent: number; paymentMethodAnnualRatePercent: number;
  paymentMethodMonthlyRatePercent: number; interestMultiplier: number;
  interestPerUnit: number; priceWithInterest: number;
  channelSegment: string; marginPercent: number; marginPerUnit: number; priceWithMargin: number;
  segmentName: string; segmentAdjustmentPercent: number; segmentAdjPerUnit: number; priceWithSegAdj: number;
  paymentMethodMarkupPercent: number; paymentMarkupPerUnit: number;
  normalizedPrice: number; subtotal: number;
  feesOkenPercent: number;
  g2nComboDiscountAllocated: number; g2nBarterDiscountAllocated: number;
  g2nDirectIncentiveAllocated: number; g2nNetRevenueAllocated: number;
  g2nCommodityCreditAllocated: number;
  parityCommodity: string | null; parityPricePerSaca: number | null;
  fxSourceUsed: 'products' | 'barter'; pricingPlaza: string | null;
}

interface GrossToNetResult {
  grossRevenue: number; comboDiscount: number; barterDiscount: number;
  directIncentiveDiscount: number; creditLiberacao: number; creditLiquidacao: number;
  netRevenue: number; financialRevenue: number; distributorMargin: number;
  segmentAdjustment: number; paymentMethodMarkup: number; barterCost: number;
  netNetRevenue: number;
  commodityCredit: number;
}

interface EligibilityResult {
  eligible: boolean; blocked: boolean;
  flags: Record<string, boolean>; warnings: string[];
}

interface ParityResultType {
  totalAmountBRL: number; commodityPricePerUnit: number; quantitySacas: number;
  referencePrice: number; valorization: number;
  userOverridePrice: number | null; hasExistingContract: boolean;
}

// ─── AGRONOMIC ENGINE ───
function calculateAgronomic(product: ProductRow, areaHectares: number, dosePerHectare: number, overrideQuantity?: number): AgronomicResult {
  const dose = dosePerHectare || product.dose_per_hectare;
  const rawQuantity = overrideQuantity ?? (areaHectares * dose);

  const packageSizes = [...(product.package_sizes || [])].filter(s => s > 0);
  if (packageSizes.length === 0) packageSizes.push(1);

  let best = { packageSize: 1, boxes: 0, roundedQuantity: 0, waste: Infinity, pallets: 0 };

  for (const pkgSize of packageSizes) {
    const unitsPerBox = product.units_per_box * pkgSize;
    const boxes = Math.ceil(rawQuantity / unitsPerBox);
    const rounded = boxes * unitsPerBox;
    const waste = rounded - rawQuantity;
    const pallets = Math.ceil(boxes / product.boxes_per_pallet);

    if (waste < best.waste || (waste === best.waste && boxes < best.boxes)) {
      best = { packageSize: pkgSize, boxes, roundedQuantity: rounded, waste, pallets };
    }
  }

  return {
    productId: product.id, ref: product.ref || '', productName: product.name,
    areaHectares, dosePerHectare: dose, rawQuantity,
    roundedQuantity: best.roundedQuantity, boxes: best.boxes,
    pallets: best.pallets, packageSize: best.packageSize,
    unitType: product.unit_type,
  };
}

// ─── COMBO CASCADE ENGINE ───
function applyComboCascade(
  combos: { id: string; name: string; discount_percent: number; products: { ref: string; min_dose_per_ha: number; max_dose_per_ha: number }[] }[],
  selections: AgronomicResult[]
): { activations: ComboActivationResult[]; consumptionLedger: Record<string, Record<string, number>> } {
  const isComplementary = (c: { name: string }) => /^COMPLEMENTAR/i.test(c.name);
  const mainCombos = combos.filter(c => !isComplementary(c));
  const complementaryCombos = combos.filter(c => isComplementary(c));

  const sortedMain = [...mainCombos].sort((a, b) => {
    if (b.discount_percent !== a.discount_percent) return b.discount_percent - a.discount_percent;
    return b.products.length - a.products.length;
  });

  const remainingQty = new Map<string, number>();
  for (const sel of selections) {
    const ref = (sel.ref || '').toUpperCase().trim();
    if (ref) remainingQty.set(ref, (remainingQty.get(ref) || 0) + sel.roundedQuantity);
  }

  const availableRefs = new Set<string>(remainingQty.keys());
  const activations: ComboActivationResult[] = [];
  const consumptionLedger: Record<string, Record<string, number>> = {};
  let totalActivatedHectares = 0;

  for (const combo of sortedMain) {
    const matchedRefs: string[] = [];
    let allMatch = true;

    for (const rule of combo.products) {
      const ruleRef = (rule.ref || '').toUpperCase().trim();
      if (!ruleRef || !availableRefs.has(ruleRef)) { allMatch = false; break; }

      const sel = selections.find(s => (s.ref || '').toUpperCase().trim() === ruleRef);
      if (!sel) { allMatch = false; break; }
      if (sel.dosePerHectare < rule.min_dose_per_ha || sel.dosePerHectare > rule.max_dose_per_ha) { allMatch = false; break; }
      if ((remainingQty.get(ruleRef) || 0) <= 0) { allMatch = false; break; }

      matchedRefs.push(ruleRef);
    }

    if (allMatch && matchedRefs.length > 0) {
      const comboLedger: Record<string, number> = {};
      for (const ref of matchedRefs) {
        const sel = selections.find(s => (s.ref || '').toUpperCase().trim() === ref);
        const qty = sel?.roundedQuantity || 0;
        const remaining = remainingQty.get(ref) || 0;
        const consumed = Math.min(qty, remaining);
        comboLedger[ref] = consumed;
        remainingQty.set(ref, remaining - consumed);
        if ((remainingQty.get(ref) || 0) <= 0) availableRefs.delete(ref);
      }
      consumptionLedger[combo.id] = comboLedger;

      const matchedAreas = matchedRefs.map(ref => {
        const sel = selections.find(s => (s.ref || '').toUpperCase().trim() === ref);
        return sel?.areaHectares || 0;
      });
      const comboHectares = Math.min(...matchedAreas);
      totalActivatedHectares = Math.max(totalActivatedHectares, comboHectares);

      activations.push({
        comboId: combo.id, comboName: combo.name, discountPercent: combo.discount_percent,
        matchedProducts: matchedRefs, applied: true, isComplementary: false,
        activatedHectares: comboHectares,
      });
    } else {
      activations.push({
        comboId: combo.id, comboName: combo.name, discountPercent: combo.discount_percent,
        matchedProducts: [], applied: false, isComplementary: false,
      });
    }
  }

  // Complementary combos
  const hasActivated = activations.some(a => a.applied && !a.isComplementary);
  for (const combo of complementaryCombos) {
    if (!hasActivated) {
      activations.push({ comboId: combo.id, comboName: combo.name, discountPercent: combo.discount_percent, matchedProducts: [], applied: false, isComplementary: true });
      continue;
    }
    const matchedRefs: string[] = [];
    for (const rule of combo.products) {
      const ruleRef = (rule.ref || '').toUpperCase().trim();
      if (!ruleRef) continue;
      const sel = selections.find(s => (s.ref || '').toUpperCase().trim() === ruleRef);
      if (!sel) continue;
      if (sel.dosePerHectare >= rule.min_dose_per_ha && sel.dosePerHectare <= rule.max_dose_per_ha) {
        matchedRefs.push(ruleRef);
      }
    }
    activations.push({
      comboId: combo.id, comboName: combo.name, discountPercent: combo.discount_percent,
      matchedProducts: matchedRefs, applied: matchedRefs.length > 0, isComplementary: true,
      proportionalHectares: matchedRefs.length > 0 ? totalActivatedHectares : undefined,
    });
  }

  return { activations, consumptionLedger };
}

// ─── PRICING NORMALIZATION ENGINE ───
function calculatePricing(
  product: ProductRow, campaign: any, margins: any[], channelSegment: string,
  segmentName: string, dueMonths: number, quantity: number,
  opts: { paymentMethodMarkup: number; segmentAdjustmentPercent: number; paymentMethodAnnualRate: number; boxes: number; pallets: number; useBarterFx: boolean; forcedChannelMarginPercent?: number }
): { pricing: PricingResultItem; debug: PricingDebugRow } {
  const priceListFormat = String(campaign.price_list_format || '').toLowerCase();
  const forceTerm = priceListFormat.includes('prazo');
  const forceCash = priceListFormat.includes('vista');
  const forceIncludesMargin = priceListFormat.includes('com_margem');
  const forcedCurrency = priceListFormat.startsWith('usd') ? 'USD' : (priceListFormat.startsWith('brl') ? 'BRL' : null);

  const resolvedSourceField: 'price_cash' | 'price_term' | 'price_per_unit' = forceTerm
    ? (product.price_term && product.price_term > 0 ? 'price_term' : 'price_per_unit')
    : (forceCash
      ? (product.price_cash && product.price_cash > 0 ? 'price_cash' : 'price_per_unit')
      : (product.price_type === 'prazo' && product.price_term && product.price_term > 0
        ? 'price_term'
        : (product.price_type === 'vista' && product.price_cash && product.price_cash > 0 ? 'price_cash' : 'price_per_unit')));

  const sourceValue = resolvedSourceField === 'price_term'
    ? (product.price_term || product.price_per_unit)
    : (resolvedSourceField === 'price_cash' ? (product.price_cash || product.price_per_unit) : product.price_per_unit);

  const listCurrency = (forcedCurrency || product.currency || 'BRL') as 'BRL' | 'USD';
  const useBarterFx = opts.useBarterFx || priceListFormat.includes('indicativa') || priceListFormat.includes('barter');
  const exchangeRateProducts = useBarterFx
    ? Number(campaign.exchange_rate_barter || campaign.exchange_rate_products || 1)
    : Number(campaign.exchange_rate_products || 1);
  const priceAfterFx = listCurrency === 'USD' ? sourceValue * exchangeRateProducts : sourceValue;

  const isTermPrice = resolvedSourceField === 'price_term';
  const campaignMonthlyRate = Number(campaign.interest_rate || 0) / 100;
  const paymentMethodAnnualRate = Number(opts.paymentMethodAnnualRate || 0) / 100;
  const paymentMethodMonthlyRate = paymentMethodAnnualRate > 0 ? Math.pow(1 + paymentMethodAnnualRate, 1 / 12) - 1 : 0;
  const totalMonthlyRate = campaignMonthlyRate + paymentMethodMonthlyRate;

  const interestMultiplier = (!isTermPrice && dueMonths > 0)
    ? Math.pow(1 + totalMonthlyRate, dueMonths) - 1 : 0;

  const margin = margins.find((m: any) => m.segment === channelSegment);
  const marginPercentFromConfig = opts.forcedChannelMarginPercent != null ? (opts.forcedChannelMarginPercent / 100) : null;
  const marginPercent = (!forceIncludesMargin && !product.includes_margin && channelSegment !== 'direto')
    ? (marginPercentFromConfig != null ? marginPercentFromConfig : (margin ? margin.margin_percent / 100 : 0))
    : 0;

  const segAdj = (opts.segmentAdjustmentPercent || 0) / 100;
  const pmMarkup = (opts.paymentMethodMarkup || 0) / 100;

  const basePrice = priceAfterFx;
  const priceWithInterest = basePrice * (1 + interestMultiplier);
  const priceWithMargin = priceWithInterest * (1 + marginPercent);
  const priceWithSegAdj = priceWithMargin * (1 + segAdj);
  const normalizedPrice = priceWithSegAdj * (1 + pmMarkup);

  return {
    pricing: {
      productId: product.id, basePrice, normalizedPrice,
      interestComponent: basePrice * interestMultiplier,
      marginComponent: priceWithInterest * marginPercent,
      segmentAdjustmentComponent: priceWithMargin * segAdj,
      paymentMethodComponent: priceWithSegAdj * pmMarkup,
      commercialPrice: normalizedPrice, quantity,
      subtotal: normalizedPrice * quantity,
    },
    debug: {
      productId: product.id,
      code: product.code || '',
      ref: product.ref || '',
      productName: product.name,
      unitType: product.unit_type,
      quantity,
      boxes: opts.boxes,
      pallets: opts.pallets,
      sourceField: resolvedSourceField,
      sourceValue,
      listCurrency,
      exchangeRateProducts,
      priceAfterFx,
      dueMonths,
      campaignMonthlyRatePercent: campaignMonthlyRate * 100,
      paymentMethodAnnualRatePercent: paymentMethodAnnualRate * 100,
      paymentMethodMonthlyRatePercent: paymentMethodMonthlyRate * 100,
      interestMultiplier,
      interestPerUnit: basePrice * interestMultiplier,
      priceWithInterest,
      channelSegment,
      marginPercent: marginPercent * 100,
      marginPerUnit: priceWithInterest * marginPercent,
      priceWithMargin,
      segmentName,
      segmentAdjustmentPercent: segAdj * 100,
      segmentAdjPerUnit: priceWithMargin * segAdj,
      priceWithSegAdj,
      paymentMethodMarkupPercent: pmMarkup * 100,
      paymentMarkupPerUnit: priceWithSegAdj * pmMarkup,
      normalizedPrice,
      subtotal: normalizedPrice * quantity,
      feesOkenPercent: 0,
      g2nComboDiscountAllocated: 0,
      g2nBarterDiscountAllocated: 0,
      g2nDirectIncentiveAllocated: 0,
      g2nNetRevenueAllocated: 0,
      g2nCommodityCreditAllocated: 0,
      parityCommodity: null,
      parityPricePerSaca: null,
      fxSourceUsed: useBarterFx ? 'barter' : 'products',
      pricingPlaza: null,
    },
  };
}

// ─── GROSS-TO-NET ───
function calculateGrossToNet(
  pricingResults: PricingResultItem[],
  comboActivations: ComboActivationResult[],
  barterDiscountPercent: number,
  campaign: any,
  selections: AgronomicResult[]
): GrossToNetResult {
  const grossRevenue = pricingResults.reduce((s, p) => s + p.subtotal, 0);
  const totalInterest = pricingResults.reduce((s, p) => s + p.interestComponent * p.quantity, 0);
  const totalMargin = pricingResults.reduce((s, p) => s + p.marginComponent * p.quantity, 0);
  const totalSegAdj = pricingResults.reduce((s, p) => s + (p.segmentAdjustmentComponent || 0) * p.quantity, 0);
  const totalPmMarkup = pricingResults.reduce((s, p) => s + (p.paymentMethodComponent || 0) * p.quantity, 0);

  const activatedMain = comboActivations.filter(c => c.applied && !c.isComplementary);
  const activatedComp = comboActivations.filter(c => c.applied && c.isComplementary);

  const mainEligibleRefs = new Set<string>();
  let mainDiscountPercent = 0;
  for (const ca of activatedMain) {
    for (const ref of ca.matchedProducts) mainEligibleRefs.add(ref.toUpperCase().trim());
    mainDiscountPercent = Math.max(mainDiscountPercent, ca.discountPercent);
  }

  const compEligibleRefs = new Set<string>();
  let compDiscountPercent = 0;
  for (const ca of activatedComp) {
    for (const ref of ca.matchedProducts) compEligibleRefs.add(ref.toUpperCase().trim());
    compDiscountPercent += ca.discountPercent;
  }

  let comboDiscount = 0;
  const maxActivatedHectares = activatedMain.reduce((max, ca) => Math.max(max, ca.activatedHectares || 0), 0);

  for (const pr of pricingResults) {
    const sel = selections.find(s => s.productId === pr.productId);
    if (!sel) continue;
    const ref = (sel.ref || '').toUpperCase().trim();

    if (mainEligibleRefs.has(ref) && mainDiscountPercent > 0) {
      comboDiscount += pr.subtotal * mainDiscountPercent / 100;
    }

    if (compEligibleRefs.has(ref) && compDiscountPercent > 0) {
      const activatedHectares = maxActivatedHectares || 0;
      const proportionalRatio = sel.areaHectares > 0
        ? Math.min(1, Math.max(0, activatedHectares / sel.areaHectares))
        : 0;
      comboDiscount += pr.subtotal * (compDiscountPercent / 100) * proportionalRatio;
    }
  }

  const barterDiscount = (grossRevenue - comboDiscount) * barterDiscountPercent / 100;

  const incentiveBase = grossRevenue - comboDiscount;
  const incentiveType = campaign.global_incentive_type || '';
  const incentiveTotal = (campaign.global_incentive_1 || 0) + (campaign.global_incentive_2 || 0) + (campaign.global_incentive_3 || 0);
  const directIncentiveDiscount = incentiveType === 'desconto_direto' ? incentiveBase * incentiveTotal / 100 : 0;
  const creditLiberacao = incentiveType === 'credito_liberacao' ? incentiveBase * incentiveTotal / 100 : 0;
  const creditLiquidacao = incentiveType === 'credito_liquidacao' ? incentiveBase * incentiveTotal / 100 : 0;

  const netRevenue = grossRevenue - comboDiscount - barterDiscount - directIncentiveDiscount;

  return {
    grossRevenue, comboDiscount, barterDiscount, directIncentiveDiscount,
    creditLiberacao, creditLiquidacao, netRevenue,
    financialRevenue: totalInterest, distributorMargin: totalMargin,
    segmentAdjustment: totalSegAdj, paymentMethodMarkup: totalPmMarkup,
    barterCost: barterDiscount, netNetRevenue: netRevenue - totalMargin, commodityCredit: 0,
  };
}

// ─── ELIGIBILITY ENGINE ───
function checkEligibility(campaign: any, input: any, eligibilityPolicy?: any): EligibilityResult {
  const warnings: string[] = [];
  const normalize = (v?: string) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  // PF/PJ
  const campaignTypes = campaign.client_type || [];
  const hasPfPjFilter = campaignTypes.length > 0;
  const pf_pj_ok = !hasPfPjFilter || !input.clientType || campaignTypes.some((t: string) => t.toLowerCase() === input.clientType.toLowerCase());
  if (!pf_pj_ok) warnings.push(`Tipo "${input.clientType}" não elegível`);

  // Geo
  const eligStates = campaign.eligible_states || [];
  const eligMeso = campaign.eligible_mesoregions || [];
  const eligCities = campaign.eligible_cities || [];
  const normalizedState = String(input.state || '').trim().toUpperCase();
  const state_ok = eligStates.length === 0 || !input.state || eligStates.some((s: string) => String(s).trim().toUpperCase() === normalizedState);
  const mesoregion_ok = eligMeso.length === 0 || !input.mesoregion || eligMeso.some((m: string) => normalize(m) === normalize(input.mesoregion));
  const city_ok = eligCities.length === 0 || !input.city || eligCities.some((c: string) => normalize(c) === normalize(input.city));

  const geoPrecedence = Array.isArray(eligibilityPolicy?.geo_precedence)
    ? eligibilityPolicy.geo_precedence
    : ['city', 'mesoregion', 'state'];

  let geo_ok = true;
  for (const level of geoPrecedence) {
    if (level === 'city' && eligCities.length > 0) {
      geo_ok = city_ok;
      if (!city_ok) warnings.push(`Cidade "${input.city}" não elegível`);
      break;
    }
    if (level === 'mesoregion' && eligMeso.length > 0) {
      geo_ok = mesoregion_ok;
      if (!mesoregion_ok) warnings.push('Mesorregião não elegível');
      break;
    }
    if (level === 'state' && eligStates.length > 0) {
      geo_ok = state_ok;
      if (!state_ok) warnings.push(`Estado "${input.state}" não elegível`);
      break;
    }
  }

  // Segment
  const eligSegs = campaign.eligible_distributor_segments || [];
  const segment_ok = eligSegs.length === 0 || !input.segment || eligSegs.includes(input.segment);
  if (!segment_ok) warnings.push(`Segmento "${input.segment}" não elegível`);

  // Client segment
  const eligClientSegs = campaign.eligible_client_segments || [];
  const client_segment_ok = eligClientSegs.length === 0 || !input.clientSegment || eligClientSegs.includes(input.clientSegment);

  // Min order
  const minAmount = campaign.min_order_amount || 0;
  const min_ok = minAmount <= 0 || !input.orderAmount || input.orderAmount >= minAmount;
  if (!min_ok) warnings.push(`Pedido mínimo não atingido`);

  // Whitelist
  const whitelist = input.whitelist || [];
  const whitelist_ok = whitelist.length === 0 || !input.clientDocument || whitelist.some((w: string) => w.replace(/\D/g, '') === input.clientDocument.replace(/\D/g, ''));
  if (!whitelist_ok) warnings.push('Cliente não está na whitelist');

  const eligible = pf_pj_ok && geo_ok && segment_ok && client_segment_ok && min_ok && whitelist_ok;
  const blockIneligible = eligibilityPolicy?.block_ineligible ?? campaign.block_ineligible;
  const blocked = !!(blockIneligible && !eligible);

  return {
    eligible, blocked,
    flags: { pf_pj_ok, geo_ok, state_ok, mesoregion_ok, city_ok, segment_ok, client_segment_ok, min_ok, whitelist_ok },
    warnings,
  };
}

// ─── COMMODITY / PARITY ENGINE ───
function calculateCommodityNetPrice(pricing: any, port: string, freightReducer: any, opts: any): number {
  const bushelsPerTon = pricing.bushels_per_ton;
  const pesoSacaKg = pricing.peso_saca_kg;
  if (!bushelsPerTon || !pesoSacaKg) throw new Error('commodity_pricing is missing bushels_per_ton or peso_saca_kg — configure them in the campaign');
  const sacasPerTon = 1000 / pesoSacaKg;

  const basisByPort = typeof pricing.basis_by_port === 'string' ? JSON.parse(pricing.basis_by_port) : (pricing.basis_by_port || {});
  const basis = basisByPort[port] ?? 0;

  const fobUsdPerTon = (pricing.exchange_price + basis) * bushelsPerTon;
  const fobBrlPerTon = fobUsdPerTon * pricing.exchange_rate_bolsa;
  const afterMarketDelta = fobBrlPerTon * (1 - (pricing.security_delta_market ?? 0) / 100);

  const freightCostPerTon = freightReducer?.total_reducer ?? 0;
  const interiorPricePerTon = afterMarketDelta - freightCostPerTon;
  const netPricePerTon = interiorPricePerTon * (1 - (pricing.security_delta_freight ?? 0) / 100);

  let netPricePerSaca = netPricePerTon / sacasPerTon;

  if (opts?.buyerFeePercent && opts.buyerFeePercent > 0) {
    netPricePerSaca *= (1 - opts.buyerFeePercent / 100);
  }

  if (netPricePerSaca <= 0) throw new Error('Calculated commodity net price is <= 0. Check commodity_pricing configuration.');
  return netPricePerSaca;
}

function calculateIVP(contractPriceType: string, volatility: number | null): number {
  if (contractPriceType === 'fixo' || contractPriceType === 'pre_existente') return 1;
  const vol = ((volatility ?? 0)) / 100;
  return Math.max(1 - vol * 0.2, 0.8);
}

function calculateParity(totalAmountBRL: number, commodityNetPrice: number, userOverridePrice: number | null, grossAmountBRL: number | null, ivp: number): ParityResultType {
  const effectivePrice = (userOverridePrice ?? commodityNetPrice) * ivp;
  const quantitySacas = Math.ceil(totalAmountBRL / effectivePrice);
  const referencePrice = grossAmountBRL ? grossAmountBRL / quantitySacas : totalAmountBRL / quantitySacas;
  const valorization = effectivePrice > 0 ? ((referencePrice - effectivePrice) / effectivePrice) * 100 : 0;

  return {
    totalAmountBRL, commodityPricePerUnit: effectivePrice, quantitySacas,
    referencePrice, valorization,
    userOverridePrice, hasExistingContract: !!userOverridePrice,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const url = new URL(req.url);
    const urlPath = url.pathname.split('/').pop();
    const endpoint = body.endpoint || (urlPath !== 'simulation-engine' ? urlPath : null);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const tenantId = (body?.tenantId || user.user_metadata?.tenant_id || null) as string | null;
    const simulationPolicy = await resolvePolicy(supabase, 'simulation_engine', tenantId);

    let result: Record<string, unknown> | EligibilityResult;

    switch (endpoint) {
      // ═══════════════════════════════════════════
      // FULL SIMULATION - server-authoritative
      // ═══════════════════════════════════════════
      case 'simulate': {
        const {
          campaignId, selections: inputSelections, segmentName, channelSegment, channelSegmentName, commercialSegmentName, distributorId, dueMonths, dueDate,
          paymentMethodId, commodityCode, port: portName,
          freightOrigin, deliveryLocationId, hasContract: hasExistingContract, userOverridePrice,
          showInsurance, clientContext, barterDiscountPercent,
          buyerId, contractPriceType: cpt, performanceIndex: pi,
        } = body;

        if (!campaignId) throw new Error('campaignId is required');
        if (!inputSelections?.length) throw new Error('selections are required (array of {productId, dosePerHectare, areaHectares, overrideQuantity?})');
        if (!segmentName) throw new Error('segmentName is required');
        if (!channelSegment) throw new Error('channelSegment is required');
        if (dueMonths == null && !dueDate) throw new Error('dueMonths or dueDate is required');

        // 1. Fetch campaign (authoritative)
        const { data: campaign, error: cErr } = await supabase.from('campaigns').select('*').eq('id', campaignId).single();
        if (cErr || !campaign) throw new Error('Campaign not found');

        const { data: eligibilityPolicyResolved, error: eligibilityPolicyErr } = await supabase.rpc('policy_resolve', {
          p_policy_key: 'eligibility',
          p_context: {
            campaignId,
            channelSegment,
            distributorId: distributorId || null,
            clientType: clientContext?.clientType || null,
            state: clientContext?.state || null,
            city: clientContext?.city || null,
          },
          p_decision_type: 'simulacao',
          p_operation_id: null,
          p_persist_snapshot: true,
        });
        if (eligibilityPolicyErr) throw new Error(`Policy resolve failed: ${eligibilityPolicyErr.message}`);
        const eligibilityPolicy = eligibilityPolicyResolved?.resolved || {};

        const { data: pricingPolicyResolved, error: pricingPolicyErr } = await supabase.rpc('policy_resolve', {
          p_policy_key: 'pricing',
          p_context: {
            campaignId,
            channelSegment,
            segmentName,
            dueMonths: dueMonths || null,
            paymentMethodId: paymentMethodId || null,
          },
          p_decision_type: 'pricing',
          p_operation_id: null,
          p_persist_snapshot: true,
        });
        if (pricingPolicyErr) throw new Error(`Policy resolve failed: ${pricingPolicyErr.message}`);

        const { data: formalizationPolicyResolved, error: formalizationPolicyErr } = await supabase.rpc('policy_resolve', {
          p_policy_key: 'formalization',
          p_context: {
            campaignId,
            contractPriceType: cpt || null,
            hasContract: !!hasExistingContract,
          },
          p_decision_type: 'formalizacao',
          p_operation_id: null,
          p_persist_snapshot: true,
        });
        if (formalizationPolicyErr) throw new Error(`Policy resolve failed: ${formalizationPolicyErr.message}`);

        // 2. Fetch related data in parallel
        const [marginsRes, segmentsRes, channelSegRes, distributorsRes, pmRes, combosRes, cpRes, frRes, dlRes, buyersRes, valRes, clientsRes] = await Promise.all([
          supabase.from('channel_margins').select('*').eq('campaign_id', campaignId),
          supabase.from('campaign_segments').select('*').eq('campaign_id', campaignId).eq('active', true),
          supabase.from('campaign_channel_segments').select('*').eq('campaign_id', campaignId).eq('active', true),
          supabase.from('campaign_distributors').select('*').eq('campaign_id', campaignId).eq('active', true),
          supabase.from('campaign_payment_methods').select('*').eq('campaign_id', campaignId).eq('active', true),
          supabase.from('combos').select('id, name, discount_percent, combo_products(product_id, min_dose_per_ha, max_dose_per_ha, products(ref))').eq('campaign_id', campaignId),
          supabase.from('commodity_pricing').select('*').eq('campaign_id', campaignId),
          supabase.from('freight_reducers').select('*').eq('campaign_id', campaignId),
          supabase.from('campaign_delivery_locations').select('*').eq('campaign_id', campaignId),
          supabase.from('campaign_buyers').select('*').eq('campaign_id', campaignId),
          supabase.from('campaign_commodity_valorizations').select('*').eq('campaign_id', campaignId),
          supabase.from('campaign_clients').select('document').eq('campaign_id', campaignId),
        ]);

        const margins = marginsRes.data || [];
        const segments = segmentsRes.data || [];
        const paymentMethods = pmRes.data || [];

        // 3. Fetch products from DB (authoritative — no client-provided prices)
        const productIds = inputSelections.map((s: any) => s.productId);
        const { data: campaignProductLinks } = await supabase.from('campaign_products').select('product_id').eq('campaign_id', campaignId);
        const validProductIds = new Set((campaignProductLinks || []).map((cp: any) => cp.product_id));

        const { data: dbProducts, error: pErr } = await supabase.from('products').select('*').in('id', productIds);
        if (pErr) throw pErr;
        const productMap = new Map((dbProducts || []).map((p: any) => [p.id, p]));

        // Validate all products belong to campaign
        for (const pid of productIds) {
          if (!validProductIds.has(pid)) throw new Error(`Product ${pid} is not part of campaign ${campaignId}`);
          if (!productMap.has(pid)) throw new Error(`Product ${pid} not found in database`);
        }

        // 4. Agronomic calculations
        const agronomicSelections: AgronomicResult[] = inputSelections.map((s: any) => {
          const product = productMap.get(s.productId)!;
          return calculateAgronomic(product, s.areaHectares, s.dosePerHectare, s.overrideQuantity);
        });

        // 5. Combo cascade
        const comboDefinitions = (combosRes.data || []).map((c: any) => ({
          id: c.id, name: c.name, discount_percent: c.discount_percent,
          products: (c.combo_products || []).map((cp: any) => ({
            ref: cp.products?.ref || '', min_dose_per_ha: cp.min_dose_per_ha, max_dose_per_ha: cp.max_dose_per_ha,
          })),
        }));
        const comboCascade = applyComboCascade(comboDefinitions, agronomicSelections);

        // 6. Pricing
        const dueMonthsFinal = (() => {
          if (dueDate) {
            const due = new Date(`${dueDate}T00:00:00`);
            if (!Number.isNaN(due.getTime())) {
              const diffDays = Math.max(Math.round((due.getTime() - Date.now()) / 86400000), 1);
              return Math.max(Math.round(diffDays / 30), 1);
            }
          }
          return Math.max(Math.round(Number(dueMonths || 0)), 1);
        })();

        const segmentCommercialName = commercialSegmentName || segmentName;
        const segmentMatch = segments.find((s: any) => s.segment_name.toLowerCase() === String(segmentCommercialName || '').toLowerCase());
        const commercialAdjustmentPercent = segmentMatch?.price_adjustment_percent || 0;

        const distributors = distributorsRes.data || [];
        const channelSegments = channelSegRes.data || [];
        const selectedDistributor = distributorId ? distributors.find((d: any) => d.id === distributorId) : null;
        const effectiveChannelSegmentName = channelSegmentName || selectedDistributor?.channel_segment_name || channelSegment;
        const channelSegmentCfg = channelSegments.find((cs: any) => String(cs.channel_segment_name).toLowerCase() === String(effectiveChannelSegmentName || '').toLowerCase());
        const channelMarginPercent = Number(channelSegmentCfg?.margin_percent || 0);
        const channelAdjustmentPercent = Number(channelSegmentCfg?.price_adjustment_percent || 0);

        const segmentAdjustmentPercent = commercialAdjustmentPercent + channelAdjustmentPercent;
        const selectedPM = paymentMethodId ? paymentMethods.find((pm: any) => pm.id === paymentMethodId) : paymentMethods[0];
        const paymentMethodMarkup = selectedPM?.markup_percent || 0;

        const pricingDetails = agronomicSelections.map(sel => {
          const product = productMap.get(sel.productId)!;
          return calculatePricing(product, campaign, margins, effectiveChannelSegmentName || channelSegment, segmentCommercialName || segmentName, dueMonthsFinal, sel.roundedQuantity, {
            paymentMethodMarkup,
            segmentAdjustmentPercent,
            paymentMethodAnnualRate: selectedPM?.annual_interest_rate || 0,
            boxes: sel.boxes,
            pallets: sel.pallets,
            useBarterFx: !!selectedPM?.method_name?.toLowerCase().includes('barter'),
            forcedChannelMarginPercent: channelMarginPercent,
          });
        });

        const pricingResults: PricingResultItem[] = pricingDetails.map(pr => pr.pricing);

        // 7. Gross-to-Net
        const grossToNet = calculateGrossToNet(pricingResults, comboCascade.activations, barterDiscountPercent || 0, campaign, agronomicSelections);

        const pricingDebugRows: PricingDebugRow[] = pricingDetails.map(pr => pr.debug);
        const grossRevenueSafe = grossToNet.grossRevenue > 0 ? grossToNet.grossRevenue : 1;
        const incentiveType = String(campaign.global_incentive_type || '');
        const incentiveTotal = (campaign.global_incentive_1 || 0) + (campaign.global_incentive_2 || 0) + (campaign.global_incentive_3 || 0);
        const feePercent = incentiveType === 'credito_liberacao' || incentiveType === 'credito_liquidacao' ? incentiveTotal : 0;

        const pricingDebugRowsAllocated: PricingDebugRow[] = pricingDebugRows.map((row) => {
          const share = Math.max(0, row.subtotal / grossRevenueSafe);
          return {
            ...row,
            feesOkenPercent: feePercent,
            g2nComboDiscountAllocated: grossToNet.comboDiscount * share,
            g2nBarterDiscountAllocated: grossToNet.barterDiscount * share,
            g2nDirectIncentiveAllocated: grossToNet.directIncentiveDiscount * share,
            g2nNetRevenueAllocated: grossToNet.netRevenue * share,
            g2nCommodityCreditAllocated: grossToNet.commodityCredit * share,
            parityCommodity: commodityCode || null,
            parityPricePerSaca: null,
          };
        });

        // 8. Eligibility
        const whitelist = (clientsRes.data || []).map((c: any) => c.document).filter((d: string) => String(d || '').replace(/\D/g, '').length > 0);
        const eligibility = checkEligibility(
          campaign,
          { ...clientContext, orderAmount: grossToNet.grossRevenue, whitelist },
          eligibilityPolicy,
        );

        // 9. Parity (if barter)
        let parityResult: ParityResultType | null = null;
        let commodityNetPriceValue: number | null = null;
        let ivpValue: number | null = null;
        let insuranceResult: any = null;

        const isBarter = selectedPM?.method_name?.toLowerCase().includes('barter');

        if (isBarter && commodityCode) {
          const commodityPricingRow = (cpRes.data || []).find((cp: any) => cp.commodity === commodityCode);
          if (!commodityPricingRow) throw new Error(`No commodity_pricing found for commodity "${commodityCode}" in campaign. Configure it first.`);

          // Validate required fields
          if (!commodityPricingRow.bushels_per_ton) throw new Error('commodity_pricing.bushels_per_ton is not configured');
          if (!commodityPricingRow.peso_saca_kg) throw new Error('commodity_pricing.peso_saca_kg is not configured');
          if (!commodityPricingRow.exchange_rate_bolsa) throw new Error('commodity_pricing.exchange_rate_bolsa is not configured');

          const deliveryLocation = deliveryLocationId
            ? (dlRes.data || []).find((dl: any) => dl.id === deliveryLocationId)
            : null;

          const freightOriginResolved = freightOrigin || deliveryLocation?.city || '';
          const freightReducer = freightOriginResolved
            ? (frRes.data || []).find((fr: any) => fr.origin === freightOriginResolved || fr.origin === deliveryLocation?.city)
            : null;

          const buyer = buyerId ? (buyersRes.data || []).find((b: any) => b.id === buyerId) : null;
          const valorization = (valRes.data || []).find((v: any) => v.commodity?.toLowerCase() === commodityCode.toLowerCase());

          commodityNetPriceValue = calculateCommodityNetPrice(commodityPricingRow, portName || '', freightReducer, {
            buyerFeePercent: buyer?.fee || 0,
          });

          ivpValue = calculateIVP(cpt || 'fixo', commodityPricingRow.volatility);
          parityResult = calculateParity(grossToNet.netRevenue, commodityNetPriceValue, hasExistingContract ? userOverridePrice : null, grossToNet.grossRevenue, ivpValue);

          if (valorization) {
            const nominalCredit = Number(valorization.nominal_value || 0);
            const percentCredit = Number(valorization.percent_value || 0);
            const creditFromNominal = nominalCredit > 0 ? nominalCredit * parityResult.quantitySacas : 0;
            const creditFromPercent = valorization.use_percent ? (grossToNet.grossRevenue * percentCredit / 100) : 0;
            const commodityCreditBRL = creditFromNominal + creditFromPercent;
            grossToNet.commodityCredit = commodityCreditBRL;
            grossToNet.directIncentiveDiscount += commodityCreditBRL;
            grossToNet.netRevenue = Math.max(0, grossToNet.netRevenue - commodityCreditBRL);
            grossToNet.netNetRevenue = Math.max(0, grossToNet.netNetRevenue - commodityCreditBRL);
            if (commodityNetPriceValue > 0) {
              parityResult = calculateParity(grossToNet.netRevenue, commodityNetPriceValue, hasExistingContract ? userOverridePrice : null, grossToNet.grossRevenue, ivpValue);
            }
          }

          // Insurance
          if (showInsurance) {
            const spotPrice = commodityPricingRow.exchange_price * commodityPricingRow.exchange_rate_bolsa;
            const insuranceMode = body.insuranceMode === 'simplified' ? 'simplified' : 'advanced';

            insuranceResult = calculateInsurance(insuranceMode === 'simplified'
              ? {
                mode: 'simplified',
                baseSacas: parityResult.quantitySacas,
                commodityPricePerSaca: commodityNetPriceValue,
                simplified: {
                  additionalPremiumBRL: Number(body.insuranceAdditionalPremiumBRL || 0),
                  additionalSacas: Number(body.insuranceAdditionalSacas || 0),
                },
              }
              : {
                mode: 'advanced',
                baseSacas: parityResult.quantitySacas,
                commodityPricePerSaca: commodityNetPriceValue,
                advanced: {
                  spotPrice,
                  strikePercent: Number(commodityPricingRow.strike_percent || 105),
                  volatilityPercent: commodityPricingRow.volatility,
                  riskFreeRate: commodityPricingRow.risk_free_rate,
                  maturityDays: commodityPricingRow.option_maturity_days,
                },
              });
          }
        }

        if (parityResult) {
          const deliveryLocation = deliveryLocationId
            ? (dlRes.data || []).find((dl: any) => dl.id === deliveryLocationId)
            : null;
          const plaza = deliveryLocation ? `${deliveryLocation.city}/${deliveryLocation.state}` : null;
          for (const row of pricingDebugRowsAllocated) {
            row.parityPricePerSaca = parityResult.commodityPricePerUnit;
            row.pricingPlaza = plaza;
          }
        }

        for (const row of pricingDebugRowsAllocated) {
          const share = Math.max(0, row.subtotal / grossRevenueSafe);
          row.g2nComboDiscountAllocated = grossToNet.comboDiscount * share;
          row.g2nBarterDiscountAllocated = grossToNet.barterDiscount * share;
          row.g2nDirectIncentiveAllocated = grossToNet.directIncentiveDiscount * share;
          row.g2nCommodityCreditAllocated = grossToNet.commodityCredit * share;
          row.g2nNetRevenueAllocated = grossToNet.netRevenue * share;
        }

        // 10. Combo suggestions
        const maxDiscount = comboDefinitions.filter((c: any) => !/^COMPLEMENTAR/i.test(c.name)).reduce((max: number, c: any) => Math.max(max, c.discount_percent), 0);
        const activatedDiscount = comboCascade.activations.filter(a => a.applied && !a.isComplementary).reduce((max, a) => Math.max(max, a.discountPercent), 0);
        const complementaryDiscount = comboCascade.activations.filter(a => a.applied && a.isComplementary).reduce((sum, a) => sum + a.discountPercent, 0);

        result = {
          selections: agronomicSelections,
          comboActivations: comboCascade.activations,
          consumptionLedger: comboCascade.consumptionLedger,
          pricingResults,
          pricingDebugRows: pricingDebugRowsAllocated,
          grossToNet,
          eligibility,
          parity: parityResult,
          insurance: insuranceResult,
          commodityNetPrice: commodityNetPriceValue,
          ivp: ivpValue,
          maxDiscount,
          activatedDiscount,
          complementaryDiscount,
          discountProgress: maxDiscount > 0 ? (activatedDiscount / maxDiscount) * 100 : 0,
          moneyCurrency: (campaign.currency || 'BRL').toUpperCase(),
          campaignConfig: {
            currency: campaign.currency,
            target: campaign.target,
            activeModules: campaign.active_modules || [],
            aforoPercent: Number(campaign.aforo_percent || simulationPolicy.policyPayload.defaultAforoPercent || 130),
            priceListFormat: campaign.price_list_format,
            commodities: campaign.commodities,
            contractPriceTypes: campaign.contract_price_types || ['fixo', 'a_fixar'],
          },
          paymentMethods: paymentMethods.map((pm: any) => ({ id: pm.id, methodName: pm.method_name, markupPercent: pm.markup_percent })),
          segmentOptions: segments.map((s: any) => ({ value: s.segment_name, label: s.segment_name, adjustmentPercent: s.price_adjustment_percent })),
          buyers: (buyersRes.data || []).map((b: any) => ({ id: b.id, buyerName: b.buyer_name, fee: b.fee })),
          ports: (() => {
            const cp = (cpRes.data || []).find((c: any) => c.commodity === commodityCode);
            if (!cp?.basis_by_port) return [];
            const bp = typeof cp.basis_by_port === 'string' ? JSON.parse(cp.basis_by_port) : cp.basis_by_port;
            return Object.keys(bp);
          })(),
          freightOrigins: (frRes.data || []).map((fr: any) => ({ origin: fr.origin, destination: fr.destination })),
          comboDefinitions: comboDefinitions.map((c: any) => ({ id: c.id, name: c.name, discountPercent: c.discount_percent, productRefs: c.products.map((p: any) => p.ref) })),
          distributorContext: selectedDistributor ? { id: selectedDistributor.id, shortName: selectedDistributor.short_name, channelSegmentName: selectedDistributor.channel_segment_name } : null,
          resolvedPolicies: {
            eligibility: eligibilityPolicyResolved,
            pricing: pricingPolicyResolved,
            formalization: formalizationPolicyResolved,
          },
          timestamp: new Date().toISOString(),
        };
        break;
      }

      // ═══════════════════════════════════════════
      // LIGHTWEIGHT ELIGIBILITY CHECK
      // ═══════════════════════════════════════════
      case 'check-eligibility': {
        const { campaignId, clientContext: ctx } = body;
        if (!campaignId) throw new Error('campaignId is required');

        const { data: campaign, error: cErr } = await supabase.from('campaigns').select('*').eq('id', campaignId).single();
        if (cErr || !campaign) throw new Error('Campaign not found');

        const { data: eligibilityPolicyResolved, error: eligibilityPolicyErr } = await supabase.rpc('policy_resolve', {
          p_policy_key: 'eligibility',
          p_context: {
            campaignId,
            clientType: ctx?.clientType || null,
            state: ctx?.state || null,
            city: ctx?.city || null,
            segment: ctx?.segment || null,
            clientSegment: ctx?.clientSegment || null,
          },
          p_decision_type: 'eligibilidade',
          p_operation_id: null,
          p_persist_snapshot: true,
        });
        if (eligibilityPolicyErr) throw new Error(`Policy resolve failed: ${eligibilityPolicyErr.message}`);
        const eligibilityPolicy = eligibilityPolicyResolved?.resolved || {};

        const { data: clients } = await supabase.from('campaign_clients').select('document').eq('campaign_id', campaignId);
        const whitelist = (clients || []).map((c: any) => c.document).filter((d: string) => String(d || '').replace(/\D/g, '').length > 0);

        result = checkEligibility(campaign, { ...ctx, whitelist }, eligibilityPolicy);
        break;
      }

      // ═══════════════════════════════════════════
      // ORCHESTRATOR STATUS
      // ═══════════════════════════════════════════
      case 'get-operation-status': {
        const { operationId } = body;
        if (!operationId) throw new Error('operationId is required');

        const { data: operation, error: opErr } = await supabase.from('operations').select('*').eq('id', operationId).single();
        if (opErr || !operation) throw new Error('Operation not found');

        const { data: campaign } = await supabase.from('campaigns').select('active_modules, aforo_percent').eq('id', operation.campaign_id).single();
        const { data: docs } = await supabase.from('operation_documents').select('doc_type, status, guarantee_category, data').eq('operation_id', operationId);
        const { data: guarantees } = await supabase.from('operation_guarantees').select('estimated_value, ip_at_evaluation, status').eq('operation_id', operationId);

        const activeModules = campaign?.active_modules || [];
        if (activeModules.length === 0) throw new Error('Campaign has no active_modules configured');

        const docList = (docs || []).map(d => ({ doc_type: d.doc_type, status: d.status, guarantee_category: d.guarantee_category, data: d.data }));

        // Stage definitions
        const STAGE_DEFS = [
          { module: 'adesao', name: 'Termo de Adesão', requiredDocuments: ['termo_adesao'], requiredStatus: 'simulacao', nextStatus: 'pedido' },
          { module: 'simulacao', name: 'Simulação & Pedido', requiredDocuments: ['pedido'], requiredStatus: 'pedido', nextStatus: 'formalizado' },
          { module: 'formalizacao', name: 'Formalização Barter', requiredDocuments: ['termo_barter'], requiredStatus: 'formalizado', nextStatus: 'formalizado' },
          { module: 'documentos', name: 'Documentação (CCV/Cessão)', requiredDocuments: ['ccv', 'cessao_credito'], requiredStatus: 'formalizado', nextStatus: 'garantido' },
          { module: 'garantias', name: 'Garantias', requiredDocuments: ['cpr'], requiredStatus: 'garantido', nextStatus: 'faturado' },
        ];
        const STATUS_ORDER = ['simulacao', 'pedido', 'formalizado', 'garantido', 'faturado', 'monitorando', 'liquidado'];

        const currentIdx = STATUS_ORDER.indexOf(operation.status);
        const stages = [];
        for (const def of STAGE_DEFS) {
          if (!activeModules.includes(def.module)) continue;
          const stageIdx = STATUS_ORDER.indexOf(def.requiredStatus);
          const completedDocs = def.requiredDocuments.filter(dt => docList.some(d => d.doc_type === dt && (d.status === 'validado' || d.status === 'assinado')));
          const allComplete = completedDocs.length >= def.requiredDocuments.length;
          let status = 'bloqueado';
          if (currentIdx > stageIdx) status = 'concluido';
          else if (currentIdx === stageIdx) status = allComplete ? 'concluido' : 'em_progresso';
          stages.push({ id: def.module, name: def.name, status, requiredDocuments: def.requiredDocuments, completedDocuments: completedDocs });
        }

        // Next status
        const currentStages = stages.filter(s => {
          const def = STAGE_DEFS.find(d => d.module === s.id);
          return def && STATUS_ORDER.indexOf(def.requiredStatus) === currentIdx;
        });
        let nextStatus: string | null = null;
        if (currentStages.length > 0 && currentStages.every(s => s.status === 'concluido')) {
          const lastDef = STAGE_DEFS.find(d => d.module === currentStages[currentStages.length - 1].id);
          nextStatus = lastDef?.nextStatus || null;
        }

        // Guarantee coverage
        const validGuarantees = (guarantees || []).filter((g: any) => g.status === 'validado');
        const base = validGuarantees.reduce((s: number, g: any) => s + (g.estimated_value || 0), 0);
        const avgIP = validGuarantees.length > 0 ? validGuarantees.reduce((s: number, g: any) => s + (g.ip_at_evaluation || 1), 0) / validGuarantees.length : 1;
        const effective = base * avgIP;
        const required = (operation.gross_revenue || 0) * ((campaign?.aforo_percent || Number(simulationPolicy.policyPayload.defaultAforoPercent || 130)) / 100);

        result = {
          operationStatus: operation.status,
          wagonStages: stages,
          nextStatus,
          guaranteeCoverage: { base, effective, required, sufficient: effective >= required },
        };
        break;
      }

      // ═══════════════════════════════════════════
      // STANDALONE PARITY CALCULATION
      // ═══════════════════════════════════════════
      case 'calculate-parity': {
        const {
          campaignId, commodityCode: parCommodityCode, port: parPort,
          freightOrigin: parFreightOrigin, deliveryLocationId: parDeliveryLocationId,
          amount: parAmount, grossAmount: parGross,
          hasContract: parHasContract, userOverridePrice: parUserOverridePrice,
          showInsurance: parShowInsurance, buyerId: parBuyerId,
          contractPriceType: parCpt, livePrice: parLivePrice, liveExchangeRate: parLiveExchangeRate,
        } = body;

        if (!campaignId) throw new Error('campaignId is required');
        if (!parCommodityCode) throw new Error('commodityCode is required');

        const [campRes, cpRes2, frRes2, dlRes2, buyersRes2, valRes2] = await Promise.all([
          supabase.from('campaigns').select('aforo_percent, default_freight_cost_per_km').eq('id', campaignId).single(),
          supabase.from('commodity_pricing').select('*').eq('campaign_id', campaignId).eq('commodity', parCommodityCode).single(),
          supabase.from('freight_reducers').select('*').eq('campaign_id', campaignId),
          supabase.from('campaign_delivery_locations').select('*').eq('campaign_id', campaignId),
          supabase.from('campaign_buyers').select('*').eq('campaign_id', campaignId),
          supabase.from('campaign_commodity_valorizations').select('*').eq('campaign_id', campaignId).eq('commodity', parCommodityCode).maybeSingle(),
        ]);

        const cpRow = cpRes2.data;
        if (!cpRow) throw new Error(`No commodity_pricing for "${parCommodityCode}" in campaign`);
        if (!cpRow.bushels_per_ton) throw new Error('commodity_pricing.bushels_per_ton not configured');
        if (!cpRow.peso_saca_kg) throw new Error('commodity_pricing.peso_saca_kg not configured');

        // Apply live overrides
        if (parLivePrice != null) cpRow.exchange_price = parLivePrice;
        if (parLiveExchangeRate != null) cpRow.exchange_rate_bolsa = parLiveExchangeRate;

        const parFreightReducer = parFreightOrigin
          ? (frRes2.data || []).find((fr: any) => fr.origin === parFreightOrigin)
          : null;

        const parBuyer = parBuyerId ? (buyersRes2.data || []).find((b: any) => b.id === parBuyerId) : null;

        const commodityNetPriceCalc = calculateCommodityNetPrice(cpRow, parPort || '', parFreightReducer, {
          buyerFeePercent: parBuyer?.fee || 0,
        });

        // Valorization
        const valConfig = valRes2.data;
        let valBonus = 0;
        if (valConfig) {
          if (valConfig.use_percent && valConfig.percent_value) {
            valBonus = commodityNetPriceCalc * Number(valConfig.percent_value) / 100;
          } else {
            valBonus = Number(valConfig.nominal_value || 0);
          }
        }
        const effectiveCommodityPriceCalc = commodityNetPriceCalc + valBonus;

        const ivpCalc = calculateIVP(parCpt || 'fixo', cpRow.volatility);
        const parityCalc = calculateParity(
          parAmount || 0, effectiveCommodityPriceCalc,
          parHasContract ? parUserOverridePrice : null,
          parGross || null, ivpCalc
        );

        let insuranceCalc: any = null;
        if (parShowInsurance) {
          const insuranceMode = body.insuranceMode === 'simplified' ? 'simplified' : 'advanced';
          insuranceCalc = calculateInsurance(insuranceMode === 'simplified'
            ? {
              mode: 'simplified',
              baseSacas: parityCalc.quantitySacas,
              commodityPricePerSaca: effectiveCommodityPriceCalc,
              simplified: {
                additionalPremiumBRL: Number(body.insuranceAdditionalPremiumBRL || 0),
                additionalSacas: Number(body.insuranceAdditionalSacas || 0),
              },
            }
            : {
              mode: 'advanced',
              baseSacas: parityCalc.quantitySacas,
              commodityPricePerSaca: effectiveCommodityPriceCalc,
              advanced: {
                spotPrice: cpRow.exchange_price * cpRow.exchange_rate_bolsa,
                strikePercent: (cpRow as any).strike_percent || 105,
                volatilityPercent: cpRow.volatility,
                riskFreeRate: cpRow.risk_free_rate,
                maturityDays: (cpRow as any).option_maturity_days,
              },
            });
        }

        // Build ports list from basis_by_port
        const basisByPort = typeof cpRow.basis_by_port === 'string' ? JSON.parse(cpRow.basis_by_port) : (cpRow.basis_by_port || {});

        result = {
          parity: parityCalc,
          insurance: insuranceCalc,
          commodityNetPrice: commodityNetPriceCalc,
          effectiveCommodityPrice: effectiveCommodityPriceCalc,
          valorizationBonus: valBonus,
          ivp: ivpCalc,
          ports: Object.keys(basisByPort),
          freightOrigins: (frRes2.data || []).map((fr: any) => ({ origin: fr.origin, destination: fr.destination })),
          deliveryLocations: (dlRes2.data || []).map((dl: any) => ({ id: dl.id, warehouseName: dl.warehouse_name, city: dl.city, state: dl.state, latitude: dl.latitude, longitude: dl.longitude })),
          buyers: (buyersRes2.data || []).map((b: any) => ({ id: b.id, buyerName: b.buyer_name, fee: b.fee })),
          commodityPricingRow: {
            exchange: cpRow.exchange, contract: cpRow.contract,
            exchangePrice: cpRow.exchange_price, exchangeRateBolsa: cpRow.exchange_rate_bolsa,
            optionCost: cpRow.option_cost, securityDeltaMarket: cpRow.security_delta_market,
            securityDeltaFreight: cpRow.security_delta_freight, stopLoss: cpRow.stop_loss,
            bushelsPerTon: cpRow.bushels_per_ton, pesoSacaKg: cpRow.peso_saca_kg,
            volatility: cpRow.volatility, riskFreeRate: cpRow.risk_free_rate,
            ticker: cpRow.ticker, currencyUnit: cpRow.currency_unit,
          },
          timestamp: new Date().toISOString(),
        };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown endpoint' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await recordPolicyDecisionAudit(supabase, {
      tenantId,
      domainRef: 'simulation_engine',
      domainId: body?.operationId || null,
      policyKey: 'simulation_engine',
      resolvedPolicy: simulationPolicy,
      appliedRule: String(endpoint || 'unknown'),
      decisionInputs: body || {},
      decisionOutput: (result || {}) as Record<string, unknown>,
      rationale: 'Simulation executed with server-resolved policy',
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('simulation-engine error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  }
});
