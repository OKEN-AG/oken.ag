export type IncentiveEffectType = 'desconto_direto' | 'credito_liberacao' | 'credito_liquidacao';
export type IncentiveScope = 'global' | 'item' | 'segmento' | 'cliente';

export interface IncentiveRule {
  id: string;
  name: string;
  effectType: IncentiveEffectType;
  valueType: 'percent' | 'fixed';
  value: number;
  scope?: IncentiveScope;
  priority?: number;
  combinable?: boolean;
  maxAmount?: number;
  active?: boolean;
  appliesToProductId?: string;
  appliesToSegment?: string;
  appliesToClientType?: 'PF' | 'PJ';
}

export interface IncentiveContext {
  baseAmount: number;
  productId?: string;
  segment?: string;
  clientType?: 'PF' | 'PJ';
}

export interface IncentiveSummary {
  directDiscount: number;
  creditLiberacao: number;
  creditLiquidacao: number;
  appliedRules: Array<{ id: string; name: string; effectType: IncentiveEffectType; amount: number }>;
}

function matchesRule(rule: IncentiveRule, context: IncentiveContext): boolean {
  if (rule.active === false) return false;
  if (rule.appliesToProductId && rule.appliesToProductId !== context.productId) return false;
  if (rule.appliesToSegment && rule.appliesToSegment !== context.segment) return false;
  if (rule.appliesToClientType && rule.appliesToClientType !== context.clientType) return false;
  return true;
}

function computeAmount(rule: IncentiveRule, baseAmount: number): number {
  const raw = rule.valueType === 'percent' ? baseAmount * (rule.value / 100) : rule.value;
  if (rule.maxAmount && rule.maxAmount > 0) return Math.min(raw, rule.maxAmount);
  return Math.max(0, raw);
}

export function applyIncentiveRules(rules: IncentiveRule[], context: IncentiveContext): IncentiveSummary {
  const ordered = [...(rules || [])].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  const applied: IncentiveSummary['appliedRules'] = [];

  let directDiscount = 0;
  let creditLiberacao = 0;
  let creditLiquidacao = 0;

  const nonCombinableApplied = new Set<IncentiveEffectType>();

  for (const rule of ordered) {
    if (!matchesRule(rule, context)) continue;
    if (rule.combinable === false && nonCombinableApplied.has(rule.effectType)) continue;

    const amount = computeAmount(rule, context.baseAmount);
    if (amount <= 0) continue;

    if (rule.effectType === 'desconto_direto') directDiscount += amount;
    if (rule.effectType === 'credito_liberacao') creditLiberacao += amount;
    if (rule.effectType === 'credito_liquidacao') creditLiquidacao += amount;

    if (rule.combinable === false) nonCombinableApplied.add(rule.effectType);
    applied.push({ id: rule.id, name: rule.name, effectType: rule.effectType, amount });
  }

  return { directDiscount, creditLiberacao, creditLiquidacao, appliedRules: applied };
}
