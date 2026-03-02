import { useMemo } from 'react';
import { applyComboCascade, getMaxPossibleDiscount, getActivatedDiscount, getComplementaryDiscount } from '@/engines/combo-cascade';
import type { Product, AgronomicSelection } from '@/types/barter';

export interface ComboRecommendation {
  productName: string;
  ref: string;
  action: string;
  productId?: string;
  suggestedDose?: number;
  suggestedQty?: number;
}

export function getComboRecommendations(
  combos: any[],
  selections: AgronomicSelection[],
  products: Product[],
  area: number
): ComboRecommendation[] {
  const recommendations: ComboRecommendation[] = [];
  const selectedRefs = new Set(selections.map(s => (s.ref || '').toUpperCase().trim()));
  const productsByRef = new Map(products.map(p => [String(p.ref || '').toUpperCase().trim(), p]));
  const selectionsByRef = new Map(selections.map(sel => [String(sel.ref || '').toUpperCase().trim(), sel]));

  const prioritizedCombos = [...combos]
    .map(combo => {
      const missingCount = combo.products.filter((cp: any) => !selectedRefs.has((cp.ref || '').toUpperCase().trim())).length;
      return { ...combo, missingCount };
    })
    .sort((a, b) => {
      if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
      if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
      return b.products.length - a.products.length;
    })
    .slice(0, 30);

  for (const combo of prioritizedCombos) {
    if (recommendations.length >= 5) break;
    const missing = combo.products.filter((cp: any) => !selectedRefs.has((cp.ref || '').toUpperCase().trim()));
    if (missing.length > 0 && missing.length <= 2) {
      for (const mp of missing) {
        if (recommendations.length >= 5) break;
        const ref = (mp.ref || '').toUpperCase().trim();
        const prod = productsByRef.get(ref);
        if (!prod) continue;
        const suggestedDose = (mp.minDosePerHa + mp.maxDosePerHa) / 2;
        const suggestedQty = Math.ceil(area * suggestedDose);
        recommendations.push({
          productName: prod.name, ref: mp.ref, productId: prod.id,
          suggestedDose, suggestedQty,
          action: `Incluir ${prod.name} (${suggestedDose.toFixed(2)}/${prod.unitType}${(prod.pricingBasis || 'por_hectare') === 'por_hectare' ? '/ha' : ''} ≈ ${suggestedQty} ${prod.unitType}) → combo "${combo.name}" (+${combo.discountPercent}%)`
        });
      }
    }
    for (const cp of combo.products) {
      if (recommendations.length >= 5) break;
      const ref = (cp.ref || '').toUpperCase().trim();
      const sel = selectionsByRef.get(ref);
      if (sel && sel.dosePerHectare < cp.minDosePerHa) {
        const suggestedQty = Math.ceil(area * cp.minDosePerHa);
        recommendations.push({
          productName: sel.product.name, ref: cp.ref, productId: sel.productId,
          suggestedDose: cp.minDosePerHa, suggestedQty,
          action: `Ajustar ${sel.product.name} para ${cp.minDosePerHa}${(sel.product.pricingBasis || 'por_hectare') === 'por_hectare' ? '/ha' : ''} (≈ ${suggestedQty} ${sel.product.unitType}) → combo "${combo.name}"`
        });
      }
    }
  }

  const seen = new Set<string>();
  return recommendations.filter(rec => {
    const key = (rec.ref || '').toUpperCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

export function useComboEngine(
  combos: any[],
  products: Product[],
  selectedProducts: Map<string, number>,
  area: number,
  simResult: any | null,
) {
  const localComboResult = useMemo(() => {
    if (combos.length === 0) return null;
    if (selectedProducts.size === 0) {
      const maxD = getMaxPossibleDiscount(combos);
      const emptyActs = combos.map(c => ({ comboId: c.id, comboName: c.name, discountPercent: c.discountPercent, applied: false, consumed: {} }));
      return { activations: emptyActs, maxDiscount: maxD, activatedDiscount: 0, complementaryDiscount: 0, progress: 0 };
    }
    const localSels: AgronomicSelection[] = Array.from(selectedProducts.entries()).map(([id, dose]) => {
      const prod = products.find(p => p.id === id);
      if (!prod) return null;
      return { productId: id, ref: prod.ref || prod.name, product: prod, dosePerHectare: dose, areaHectares: area, rawQuantity: area * dose, roundedQuantity: Math.ceil(area * dose), boxes: 0, pallets: 0 };
    }).filter(Boolean) as AgronomicSelection[];
    const activations = applyComboCascade(combos, localSels);
    const maxD = getMaxPossibleDiscount(combos);
    const actD = getActivatedDiscount(activations);
    const compD = getComplementaryDiscount(activations);
    return { activations, maxDiscount: maxD, activatedDiscount: actD, complementaryDiscount: compD, progress: maxD > 0 ? (actD / maxD) * 100 : 0 };
  }, [combos, selectedProducts, products, area]);

  const comboActivations = simResult?.comboActivations ?? localComboResult?.activations ?? [];
  const maxDiscount = simResult?.maxDiscount ?? localComboResult?.maxDiscount ?? 0;
  const activatedDiscount = simResult?.activatedDiscount ?? localComboResult?.activatedDiscount ?? 0;
  const complementaryDiscount = simResult?.complementaryDiscount ?? localComboResult?.complementaryDiscount ?? 0;
  const discountProgress = maxDiscount > 0 ? (activatedDiscount / maxDiscount) * 100 : 0;

  const selections = useMemo(() => {
    if (!simResult?.selections) return [] as any[];
    return simResult.selections.map((s: any) => ({
      ...s, productId: s.productId, ref: s.ref,
      product: products.find(p => p.id === s.productId) || { name: s.productName, unitType: s.unitType, pricingBasis: 'por_hectare' as const } as any,
      areaHectares: s.areaHectares, dosePerHectare: s.dosePerHectare,
      rawQuantity: s.rawQuantity, roundedQuantity: s.roundedQuantity,
      boxes: s.boxes, pallets: s.pallets,
    }));
  }, [simResult?.selections, products]);

  const comboRecommendations = useMemo(() => {
    const sels = selections.length > 0 ? selections : Array.from(selectedProducts.entries()).map(([id, dose]) => {
      const prod = products.find(p => p.id === id);
      return prod ? { productId: id, ref: prod.ref || prod.name, product: prod, dosePerHectare: dose, areaHectares: area, rawQuantity: area * dose, roundedQuantity: Math.ceil(area * dose), boxes: 0, pallets: 0 } : null;
    }).filter(Boolean) as AgronomicSelection[];
    return getComboRecommendations(combos, sels, products, area);
  }, [combos, selections, selectedProducts, products, area]);

  return {
    localComboResult, comboActivations, maxDiscount, activatedDiscount, complementaryDiscount, discountProgress,
    selections, comboRecommendations,
  };
}
