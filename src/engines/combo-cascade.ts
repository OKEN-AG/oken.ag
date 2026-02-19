import type { ComboDefinition, ComboActivation, AgronomicSelection } from '@/types/barter';

/**
 * COMBO CASCADE ENGINE v3
 * 
 * FIX: findSelectionByRef picks best match (highest dose, tiebreak by area)
 * FIX: getSuggestedDoseForRef picks tightest range (smallest span), tiebreak by highest discount
 * FIX: activatedHectares uses Math.min (intersection) instead of Math.max
 */

function getSelectionRef(sel: AgronomicSelection): string {
  const ref = (sel.ref || sel.product?.ref || '').toUpperCase().trim();
  if (ref) return ref;
  return (sel.product?.name || '').toUpperCase().trim();
}

function isComplementaryCombo(combo: ComboDefinition): boolean {
  return combo.isComplementary || /^COMPLEMENTAR/i.test(combo.name);
}

/**
 * FIX: Find best selection for a REF — highest dose, tiebreak by largest area
 */
function findSelectionByRef(
  ref: string,
  selections: AgronomicSelection[],
  availableRefs: Set<string>
): AgronomicSelection | undefined {
  const upperRef = ref.toUpperCase().trim();
  if (!availableRefs.has(upperRef)) return undefined;

  const candidates = selections.filter(s => getSelectionRef(s) === upperRef);
  if (candidates.length === 0) return undefined;

  // Sort: highest dose first, tiebreak by largest area
  candidates.sort((a, b) => {
    if (b.dosePerHectare !== a.dosePerHectare) return b.dosePerHectare - a.dosePerHectare;
    return b.areaHectares - a.areaHectares;
  });

  return candidates[0];
}

/**
 * FIX: Find tightest dose range for a REF across all combos.
 * Tightest = smallest (max - min). Tiebreak by highest discount.
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

export function applyComboCascade(
  combos: ComboDefinition[],
  selections: AgronomicSelection[]
): ComboActivation[] {
  const mainCombos = combos.filter(c => !isComplementaryCombo(c));
  const complementaryCombos = combos.filter(c => isComplementaryCombo(c));

  const sortedMain = [...mainCombos].sort((a, b) => {
    if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
    return b.products.length - a.products.length;
  });

  const availableRefs = new Set<string>();
  for (const sel of selections) {
    const ref = getSelectionRef(sel);
    if (ref) availableRefs.add(ref);
  }

  const activations: ComboActivation[] = [];
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

      matchedRefs.push(ruleRef);
    }

    if (allMatch && matchedRefs.length > 0) {
      matchedRefs.forEach(ref => availableRefs.delete(ref));

      // FIX: Use Math.min (intersection) for activated hectares
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

  return activations;
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
