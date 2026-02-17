import type { ComboDefinition, ComboActivation, AgronomicSelection } from '@/types/barter';

/**
 * COMBO CASCADE ENGINE
 * Applies combos in cascade: highest discount + broadest first
 * No double-counting of products across combos
 */
export function applyComboCascade(
  combos: ComboDefinition[],
  selections: AgronomicSelection[]
): ComboActivation[] {
  // Sort: highest discount first, then by breadth (most products)
  const sorted = [...combos].sort((a, b) => {
    if (b.discountPercent !== a.discountPercent) {
      return b.discountPercent - a.discountPercent;
    }
    return b.products.length - a.products.length;
  });

  const usedProducts = new Set<string>();
  const activations: ComboActivation[] = [];

  for (const combo of sorted) {
    const matchedProducts: string[] = [];
    let allMatch = true;

    for (const rule of combo.products) {
      if (usedProducts.has(rule.productId)) {
        allMatch = false;
        break;
      }

      const selection = selections.find(s => s.productId === rule.productId);
      if (!selection) {
        allMatch = false;
        break;
      }

      const doseInRange =
        selection.dosePerHectare >= rule.minDosePerHa &&
        selection.dosePerHectare <= rule.maxDosePerHa;

      if (!doseInRange) {
        allMatch = false;
        break;
      }

      matchedProducts.push(rule.productId);
    }

    if (allMatch && matchedProducts.length > 0) {
      matchedProducts.forEach(id => usedProducts.add(id));
      activations.push({
        comboId: combo.id,
        comboName: combo.name,
        discountPercent: combo.discountPercent,
        matchedProducts,
        applied: true,
      });
    } else {
      activations.push({
        comboId: combo.id,
        comboName: combo.name,
        discountPercent: combo.discountPercent,
        matchedProducts: [],
        applied: false,
      });
    }
  }

  return activations;
}

/**
 * Calculate max possible discount from all combos
 */
export function getMaxPossibleDiscount(combos: ComboDefinition[]): number {
  return combos.reduce((sum, c) => sum + c.discountPercent, 0);
}

/**
 * Calculate current activated discount
 */
export function getActivatedDiscount(activations: ComboActivation[]): number {
  return activations
    .filter(a => a.applied)
    .reduce((sum, a) => sum + a.discountPercent, 0);
}
