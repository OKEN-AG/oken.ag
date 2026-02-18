import type { Product, AgronomicSelection } from '@/types/barter';

/**
 * AGRONOMIC ENGINE
 * Calculates volumes based on area × dose and rounds to full boxes
 */
export function calculateAgronomicSelection(
  product: Product,
  areaHectares: number,
  dosePerHectare?: number
): AgronomicSelection {
  const dose = dosePerHectare ?? product.dosePerHectare;
  const rawQuantity = areaHectares * dose;

  // Find best package size
  const bestPackage = product.packageSizes.sort((a, b) => b - a)[0] || 1;
  const unitsPerBox = product.unitsPerBox * bestPackage;

  // Round up to full boxes
  const boxes = Math.ceil(rawQuantity / unitsPerBox);
  const roundedQuantity = boxes * unitsPerBox;
  const pallets = Math.ceil(boxes / product.boxesPerPallet);

  return {
    productId: product.id,
    ref: product.ref || '',
    product,
    areaHectares,
    dosePerHectare: dose,
    rawQuantity,
    roundedQuantity,
    boxes,
    pallets,
  };
}

/**
 * Consolidate total treated area from selections
 */
export function consolidateArea(selections: AgronomicSelection[]): number {
  if (selections.length === 0) return 0;
  return Math.max(...selections.map(s => s.areaHectares));
}
