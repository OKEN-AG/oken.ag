import type { ComboDefinition, ComboActivation, AgronomicSelection } from '@/types/barter';

/**
 * COMBO CASCADE ENGINE v2
 * 
 * Key rules:
 * 1. Combos match by REF (Nome Mãe), not individual product ID
 *    → Any product presentation with the same REF satisfies the combo rule
 * 2. Combos fill progressively like dams (represas):
 *    - Priority 1 tries to consume REFs first
 *    - If fully activated, those REFs are consumed
 *    - If NOT fully activated, ALL REFs remain available for next combo
 * 3. "Complementary" combos (name starts with COMPLEMENTAR):
 *    - Apply proportionally to hectares of any activated offer
 *    - Don't consume REFs from the main pool
 */

/**
 * Resolve the effective REF for a selection.
 * Groups all product presentations under the same "Nome Mãe".
 */
function getSelectionRef(sel: AgronomicSelection): string {
  return (sel.ref || sel.product?.ref || '').toUpperCase().trim();
}

/**
 * Check if a combo name indicates it's complementary
 */
function isComplementaryCombo(combo: ComboDefinition): boolean {
  return combo.isComplementary || /^COMPLEMENTAR/i.test(combo.name);
}

/**
 * For a given REF, find the best matching selection (highest dose)
 */
function findSelectionByRef(
  ref: string,
  selections: AgronomicSelection[],
  availableRefs: Set<string>
): AgronomicSelection | undefined {
  const upperRef = ref.toUpperCase().trim();
  if (!availableRefs.has(upperRef)) return undefined;
  return selections.find(s => getSelectionRef(s) === upperRef);
}

/**
 * Given combos and a product REF, find the best suggested dose
 * (midpoint of the tightest combo range that includes this REF)
 */
export function getSuggestedDoseForRef(
  combos: ComboDefinition[],
  ref: string
): number | null {
  const upperRef = ref.toUpperCase().trim();
  if (!upperRef) return null;

  for (const combo of combos) {
    const rule = combo.products.find(p => (p.ref || '').toUpperCase().trim() === upperRef);
    if (rule) {
      // Use midpoint of the dose range as suggested dose
      return (rule.minDosePerHa + rule.maxDosePerHa) / 2;
    }
  }
  return null;
}

export function applyComboCascade(
  combos: ComboDefinition[],
  selections: AgronomicSelection[]
): ComboActivation[] {
  // Separate main offers from complementary
  const mainCombos = combos.filter(c => !isComplementaryCombo(c));
  const complementaryCombos = combos.filter(c => isComplementaryCombo(c));

  // Sort main combos: highest discount first, then by breadth (most products)
  const sortedMain = [...mainCombos].sort((a, b) => {
    if (b.discountPercent !== a.discountPercent) {
      return b.discountPercent - a.discountPercent;
    }
    return b.products.length - a.products.length;
  });

  // Build available REFs pool from selections
  const availableRefs = new Set<string>();
  for (const sel of selections) {
    const ref = getSelectionRef(sel);
    if (ref) availableRefs.add(ref);
  }

  const activations: ComboActivation[] = [];
  let totalActivatedHectares = 0;

  // Process main combos in cascade
  for (const combo of sortedMain) {
    const matchedRefs: string[] = [];
    let allMatch = true;

    for (const rule of combo.products) {
      const ruleRef = (rule.ref || '').toUpperCase().trim();
      if (!ruleRef) { allMatch = false; break; }

      const sel = findSelectionByRef(ruleRef, selections, availableRefs);
      if (!sel) { allMatch = false; break; }

      // Check dose is within range
      const doseInRange =
        sel.dosePerHectare >= rule.minDosePerHa &&
        sel.dosePerHectare <= rule.maxDosePerHa;

      if (!doseInRange) { allMatch = false; break; }

      matchedRefs.push(ruleRef);
    }

    if (allMatch && matchedRefs.length > 0) {
      // Combo fully activated → consume REFs
      matchedRefs.forEach(ref => availableRefs.delete(ref));
      totalActivatedHectares = Math.max(
        totalActivatedHectares,
        ...matchedRefs.map(ref => {
          const sel = selections.find(s => getSelectionRef(s) === ref);
          return sel?.areaHectares || 0;
        })
      );
      activations.push({
        comboId: combo.id,
        comboName: combo.name,
        discountPercent: combo.discountPercent,
        matchedProducts: matchedRefs,
        applied: true,
        isComplementary: false,
      });
    } else {
      // Combo NOT activated → all REFs remain available (dam didn't fill)
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

  // Process complementary combos
  // Complementary: selecting just ONE product with valid dose activates the discount
  // for that product, proportional to sum of hectares from activated main offers
  const hasActivatedOffers = activations.some(a => a.applied && !a.isComplementary);

  for (const combo of complementaryCombos) {
    if (!hasActivatedOffers) {
      activations.push({
        comboId: combo.id,
        comboName: combo.name,
        discountPercent: combo.discountPercent,
        matchedProducts: [],
        applied: false,
        isComplementary: true,
      });
      continue;
    }

    // For complementary: ANY single product match activates the combo
    // (they don't consume from main pool)
    const matchedRefs: string[] = [];

    for (const rule of combo.products) {
      const ruleRef = (rule.ref || '').toUpperCase().trim();
      if (!ruleRef) continue;

      const sel = selections.find(s => getSelectionRef(s) === ruleRef);
      if (!sel) continue;

      const doseInRange =
        sel.dosePerHectare >= rule.minDosePerHa &&
        sel.dosePerHectare <= rule.maxDosePerHa;

      if (doseInRange) {
        matchedRefs.push(ruleRef);
      }
    }

    const activated = matchedRefs.length > 0;

    activations.push({
      comboId: combo.id,
      comboName: combo.name,
      discountPercent: combo.discountPercent,
      matchedProducts: matchedRefs,
      applied: activated,
      isComplementary: true,
      proportionalHectares: activated ? totalActivatedHectares : undefined,
    });
  }

  return activations;
}

/**
 * Calculate max possible discount (highest single combo, since they're not cumulative)
 */
export function getMaxPossibleDiscount(combos: ComboDefinition[]): number {
  const mainCombos = combos.filter(c => !c.isComplementary && !/^COMPLEMENTAR/i.test(c.name));
  if (mainCombos.length === 0) return 0;
  return Math.max(...mainCombos.map(c => c.discountPercent));
}

/**
 * Calculate current activated discount (highest activated combo, not sum)
 */
export function getActivatedDiscount(activations: ComboActivation[]): number {
  const activatedMain = activations.filter(a => a.applied && !a.isComplementary);
  if (activatedMain.length === 0) return 0;
  return Math.max(...activatedMain.map(a => a.discountPercent));
}

/**
 * Get total complementary discount from activated complementary combos
 */
export function getComplementaryDiscount(activations: ComboActivation[]): number {
  return activations
    .filter(a => a.applied && a.isComplementary)
    .reduce((sum, a) => sum + a.discountPercent, 0);
}
