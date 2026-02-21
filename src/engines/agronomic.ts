import type { Product, AgronomicSelection } from '@/types/barter';

/**
 * AGRONOMIC ENGINE
 * Calculates volumes based on area × dose and rounds to full boxes.
 * FIX: Now tests all package sizes and picks the one that minimizes waste.
 */
export function calculateAgronomicSelection(
  product: Product,
  areaHectares: number,
  dosePerHectare?: number,
  overrideQuantity?: number
): AgronomicSelection {
  const dose = dosePerHectare ?? product.dosePerHectare;
  const rawQuantity = overrideQuantity ?? (areaHectares * dose);

  const packageSizes = [...(product.packageSizes || [])].filter(s => s > 0);
  if (packageSizes.length === 0) packageSizes.push(1);

  // Test each package size, pick the one with minimum waste
  let bestResult = { packageSize: 1, boxes: 0, roundedQuantity: 0, waste: Infinity, pallets: 0 };

  for (const pkgSize of packageSizes) {
    const unitsPerBox = product.unitsPerBox * pkgSize;
    const boxes = Math.ceil(rawQuantity / unitsPerBox);
    const rounded = boxes * unitsPerBox;
    const waste = rounded - rawQuantity;
    const pallets = Math.ceil(boxes / product.boxesPerPallet);

    if (waste < bestResult.waste || (waste === bestResult.waste && boxes < bestResult.boxes)) {
      bestResult = { packageSize: pkgSize, boxes, roundedQuantity: rounded, waste, pallets };
    }
  }

  return {
    productId: product.id,
    ref: product.ref || '',
    product,
    areaHectares,
    dosePerHectare: dose,
    rawQuantity,
    roundedQuantity: bestResult.roundedQuantity,
    boxes: bestResult.boxes,
    pallets: bestResult.pallets,
  };
}

/**
 * Consolidate total treated area from selections
 */
export function consolidateArea(selections: AgronomicSelection[]): number {
  if (selections.length === 0) return 0;
  return Math.max(...selections.map(s => s.areaHectares));
}
