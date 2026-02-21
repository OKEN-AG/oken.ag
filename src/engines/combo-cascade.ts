import type { ComboDefinition, ComboActivation, AgronomicSelection } from '@/types/barter';

/**
 * COMBO CASCADE ENGINE v4
 * 
 * Key improvements:
 * - Consumption ledger: tracks how much quantity each combo "consumed" per product
 * - findSelectionByRef picks best match (highest dose, tiebreak by area)
 * - getSuggestedDoseForRef picks tightest range (smallest span), tiebreak by highest discount
 * - activatedHectares uses Math.min (intersection) instead of Math.max
 */

export interface ComboConsumptionLedger {
  /** comboId -> { REF -> quantity consumed } */
  [comboId: string]: Record<string, number>;
}

export interface ComboCascadeResult {
  activations: ComboActivation[];
  consumptionLedger: ComboConsumptionLedger;
  totalDiscountValue: number; // absolute BRL discount
}

function getSelectionRef(sel: AgronomicSelection): string {
  const ref = (sel.ref || sel.product?.ref || '').toUpperCase().trim();
  if (ref) return ref;
  return (sel.product?.name || '').toUpperCase().trim();
}

function isComplementaryCombo(combo: ComboDefinition): boolean {
  return combo.isComplementary || /^COMPLEMENTAR/i.test(combo.name);
}

function findSelectionByRef(
  ref: string,
  selections: AgronomicSelection[],
  availableRefs: Set<string>
): AgronomicSelection | undefined {
  const upperRef = ref.toUpperCase().trim();
  if (!availableRefs.has(upperRef)) return undefined;

  const candidates = selections.filter(s => getSelectionRef(s) === upperRef);
  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    if (b.dosePerHectare !== a.dosePerHectare) return b.dosePerHectare - a.dosePerHectare;
    return b.areaHectares - a.areaHectares;
  });

  return candidates[0];
}

/**
 * Find tightest dose range for a REF across all combos.
 */
export function getSuggestedDoseForRef(
  combos: ComboDefinition[],
  ref: string
): number | null {
  const upperRef = ref.toUpperCase().trim();
  if (!upperRef) return null;

  let bestRule: { min: number; max: number; discount: number } | null = null;

  for (const combo of combos) {
    const rule = combo.products.find(p => (p.ref || '').toUpperCase().trim() === upperRef);
    if (!rule) continue;

    const span = rule.maxDosePerHa - rule.minDosePerHa;
    if (!bestRule) {
      bestRule = { min: rule.minDosePerHa, max: rule.maxDosePerHa, discount: combo.discountPercent };
    } else {
      const bestSpan = bestRule.max - bestRule.min;
      if (span < bestSpan || (span === bestSpan && combo.discountPercent > bestRule.discount)) {
        bestRule = { min: rule.minDosePerHa, max: rule.maxDosePerHa, discount: combo.discountPercent };
      }
    }
  }

  if (!bestRule) return null;
  return (bestRule.min + bestRule.max) / 2;
}

/**
 * Apply combo cascade with consumption ledger.
 * Returns both activations and a ledger showing how much quantity each combo consumed.
 */
export function applyComboCascadeWithLedger(
  combos: ComboDefinition[],
  selections: AgronomicSelection[]
): ComboCascadeResult {
  const mainCombos = combos.filter(c => !isComplementaryCombo(c));
  const complementaryCombos = combos.filter(c => isComplementaryCombo(c));

  const sortedMain = [...mainCombos].sort((a, b) => {
    if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
    return b.products.length - a.products.length;
  });

  // Track remaining quantity per REF
  const remainingQty = new Map<string, number>();
  for (const sel of selections) {
    const ref = getSelectionRef(sel);
    if (ref) remainingQty.set(ref, (remainingQty.get(ref) || 0) + sel.roundedQuantity);
  }

  const availableRefs = new Set<string>(remainingQty.keys());
  const activations: ComboActivation[] = [];
  const consumptionLedger: ComboConsumptionLedger = {};
  let totalActivatedHectares = 0;

  for (const combo of sortedMain) {
    const matchedRefs: string[] = [];
    let allMatch = true;

    for (const rule of combo.products) {
      const ruleRef = (rule.ref || '').toUpperCase().trim();
      if (!ruleRef) { allMatch = false; break; }

      const sel = findSelectionByRef(ruleRef, selections, availableRefs);
      if (!sel) { allMatch = false; break; }

      const doseInRange = sel.dosePerHectare >= rule.minDosePerHa && sel.dosePerHectare <= rule.maxDosePerHa;
      if (!doseInRange) { allMatch = false; break; }

      // Check remaining qty
      const remaining = remainingQty.get(ruleRef) || 0;
      if (remaining <= 0) { allMatch = false; break; }

      matchedRefs.push(ruleRef);
    }

    if (allMatch && matchedRefs.length > 0) {
      // Consume quantities
      const comboLedger: Record<string, number> = {};
      for (const ref of matchedRefs) {
        const sel = selections.find(s => getSelectionRef(s) === ref);
        const qty = sel?.roundedQuantity || 0;
        const remaining = remainingQty.get(ref) || 0;
        const consumed = Math.min(qty, remaining);
        comboLedger[ref] = consumed;
        remainingQty.set(ref, remaining - consumed);
        
        // Remove from available if fully consumed
        if ((remainingQty.get(ref) || 0) <= 0) {
          availableRefs.delete(ref);
        }
      }
      consumptionLedger[combo.id] = comboLedger;

      const matchedAreas = matchedRefs.map(ref => {
        const sel = selections.find(s => getSelectionRef(s) === ref);
        return sel?.areaHectares || 0;
      });
      const comboHectares = Math.min(...matchedAreas);
      totalActivatedHectares = Math.max(totalActivatedHectares, comboHectares);

      activations.push({
        comboId: combo.id,
        comboName: combo.name,
        discountPercent: combo.discountPercent,
        matchedProducts: matchedRefs,
        applied: true,
        isComplementary: false,
        activatedHectares: comboHectares,
      });
    } else {
      activations.push({
        comboId: combo.id,
        comboName: combo.name,
        discountPercent: combo.discountPercent,
        matchedProducts: [],
        applied: false,
        isComplementary: false,
      });
    }
  }

  // Complementary combos
  const hasActivatedOffers = activations.some(a => a.applied && !a.isComplementary);

  for (const combo of complementaryCombos) {
    if (!hasActivatedOffers) {
      activations.push({
        comboId: combo.id, comboName: combo.name, discountPercent: combo.discountPercent,
        matchedProducts: [], applied: false, isComplementary: true,
      });
      continue;
    }

    const matchedRefs: string[] = [];
    for (const rule of combo.products) {
      const ruleRef = (rule.ref || '').toUpperCase().trim();
      if (!ruleRef) continue;
      const sel = selections.find(s => getSelectionRef(s) === ruleRef);
      if (!sel) continue;
      if (sel.dosePerHectare >= rule.minDosePerHa && sel.dosePerHectare <= rule.maxDosePerHa) {
        matchedRefs.push(ruleRef);
      }
    }

    if (matchedRefs.length > 0) {
      const comboLedger: Record<string, number> = {};
      for (const ref of matchedRefs) {
        const remaining = remainingQty.get(ref) || 0;
        if (remaining > 0) {
          comboLedger[ref] = remaining;
          remainingQty.set(ref, 0);
        }
      }
      if (Object.keys(comboLedger).length > 0) {
        consumptionLedger[combo.id] = comboLedger;
      }
    }

    activations.push({
      comboId: combo.id,
      comboName: combo.name,
      discountPercent: combo.discountPercent,
      matchedProducts: matchedRefs,
      applied: matchedRefs.length > 0,
      isComplementary: true,
      proportionalHectares: matchedRefs.length > 0 ? totalActivatedHectares : undefined,
    });
  }

  return { activations, consumptionLedger, totalDiscountValue: 0 };
}

// Backwards-compatible wrapper
export function applyComboCascade(
  combos: ComboDefinition[],
  selections: AgronomicSelection[]
): ComboActivation[] {
  return applyComboCascadeWithLedger(combos, selections).activations;
}

export function getMaxPossibleDiscount(combos: ComboDefinition[]): number {
  const mainCombos = combos.filter(c => !c.isComplementary && !/^COMPLEMENTAR/i.test(c.name));
  if (mainCombos.length === 0) return 0;
  return Math.max(...mainCombos.map(c => c.discountPercent));
}

export function getActivatedDiscount(activations: ComboActivation[]): number {
  const activatedMain = activations.filter(a => a.applied && !a.isComplementary);
  if (activatedMain.length === 0) return 0;
  return Math.max(...activatedMain.map(a => a.discountPercent));
}

export function getComplementaryDiscount(activations: ComboActivation[]): number {
  return activations
    .filter(a => a.applied && a.isComplementary)
    .reduce((sum, a) => sum + a.discountPercent, 0);
}
